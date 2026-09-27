-- Transactional five-minute seat holds for the browser-facing Supabase client.
-- Direct INSERT/UPDATE access remains blocked by RLS; clients can only call the
-- two SECURITY DEFINER functions explicitly granted below.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "KHU_VUC"
SET "TongSoGhe" = 200
WHERE "MaKhuVuc" IN ('GA_STAND_1', 'GA_STAND_2');

UPDATE "KHU_VUC"
SET "MoTaQuyenLoi" = 'Khu premium chính diện, cao và bao quát sân khấu. Tham gia Soundcheck độc quyền, check-in Fast-track và nhận Gift set Concert.'
WHERE "MaKhuVuc" = 'VVIP_DIAMOND';

CREATE TABLE IF NOT EXISTS "GIU_CHO" (
  "GiuChoID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "SuKienID" INT NOT NULL REFERENCES "SU_KIEN"("SuKienID") ON DELETE CASCADE,
  "PhienNguoiDung" UUID NOT NULL,
  "TrangThai" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "HetHanLuc" TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  "NgayTao" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "NgayCapNhat" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "chk_giucho_trangthai"
    CHECK ("TrangThai" IN ('ACTIVE', 'EXPIRED', 'RELEASED', 'CONVERTED'))
);

CREATE TABLE IF NOT EXISTS "CHI_TIET_GIU_CHO" (
  "ID" BIGSERIAL PRIMARY KEY,
  "GiuChoID" UUID NOT NULL REFERENCES "GIU_CHO"("GiuChoID") ON DELETE CASCADE,
  "KhuVucID" INT NOT NULL REFERENCES "KHU_VUC"("KhuVucID") ON DELETE CASCADE,
  "GheID" INT REFERENCES "GHE"("GheID") ON DELETE CASCADE,
  "MaVe" VARCHAR(50) NOT NULL,
  "SoLuong" INT NOT NULL DEFAULT 1,
  CONSTRAINT "chk_giucho_soluong" CHECK ("SoLuong" BETWEEN 1 AND 4)
);

CREATE INDEX IF NOT EXISTS "idx_giucho_active_expiry"
  ON "GIU_CHO" ("HetHanLuc") WHERE "TrangThai" = 'ACTIVE';
CREATE INDEX IF NOT EXISTS "idx_chitiet_ghe"
  ON "CHI_TIET_GIU_CHO" ("GheID") WHERE "GheID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_chitiet_khuvuc"
  ON "CHI_TIET_GIU_CHO" ("KhuVucID");

ALTER TABLE "GIU_CHO" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CHI_TIET_GIU_CHO" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tao_giu_cho(
  p_su_kien_id INT,
  p_phien_id UUID,
  p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold_id UUID := gen_random_uuid();
  v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '5 minutes';
  v_item JSONB;
  v_zone "KHU_VUC"%ROWTYPE;
  v_seat "GHE"%ROWTYPE;
  v_quantity INT;
  v_total_quantity INT;
  v_reserved_quantity INT;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Danh sach ve khong hop le' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(COALESCE((item->>'quantity')::INT, 1)), 0)
  INTO v_total_quantity
  FROM jsonb_array_elements(p_items) AS item;

  IF v_total_quantity < 1 OR v_total_quantity > 4 THEN
    RAISE EXCEPTION 'Moi luot chi duoc giu tu 1 den 4 ve' USING ERRCODE = '22023';
  END IF;

  -- Reopen seats whose server-side hold has expired before taking new locks.
  UPDATE "GHE" AS g
  SET "TrangThai" = 'TRONG'
  WHERE g."TrangThai" = 'DANG_GIU'
    AND EXISTS (
      SELECT 1
      FROM "CHI_TIET_GIU_CHO" AS ct
      JOIN "GIU_CHO" AS gc ON gc."GiuChoID" = ct."GiuChoID"
      WHERE ct."GheID" = g."GheID"
        AND gc."TrangThai" = 'ACTIVE'
        AND gc."HetHanLuc" <= NOW()
    );

  UPDATE "GIU_CHO"
  SET "TrangThai" = 'EXPIRED', "NgayCapNhat" = NOW()
  WHERE "TrangThai" = 'ACTIVE' AND "HetHanLuc" <= NOW();

  INSERT INTO "GIU_CHO" (
    "GiuChoID", "SuKienID", "PhienNguoiDung", "TrangThai", "HetHanLuc"
  ) VALUES (
    v_hold_id, p_su_kien_id, p_phien_id, 'ACTIVE', v_expires_at
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_item->>'quantity')::INT, 1);

    SELECT * INTO v_zone
    FROM "KHU_VUC"
    WHERE "SuKienID" = p_su_kien_id
      AND "MaKhuVuc" = v_item->>'zoneCode'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Khong tim thay phan khu %', v_item->>'zoneCode'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_zone."LoaiKhuVuc" = 'DUNG_STAND' THEN
      SELECT COALESCE(SUM(ct."SoLuong"), 0)
      INTO v_reserved_quantity
      FROM "CHI_TIET_GIU_CHO" AS ct
      JOIN "GIU_CHO" AS gc ON gc."GiuChoID" = ct."GiuChoID"
      WHERE ct."KhuVucID" = v_zone."KhuVucID"
        AND gc."TrangThai" = 'ACTIVE'
        AND gc."HetHanLuc" > NOW();

      IF v_reserved_quantity + v_quantity > v_zone."TongSoGhe" THEN
        RAISE EXCEPTION 'Phan khu % khong con du so luong', v_zone."MaKhuVuc"
          USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO "CHI_TIET_GIU_CHO" (
        "GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong"
      ) VALUES (
        v_hold_id, v_zone."KhuVucID", NULL, v_item->>'ticketCode', v_quantity
      );
    ELSE
      IF v_quantity <> 1 THEN
        RAISE EXCEPTION 'Ve ghe ngoi chi chap nhan so luong 1'
          USING ERRCODE = '22023';
      END IF;

      SELECT * INTO v_seat
      FROM "GHE"
      WHERE "KhuVucID" = v_zone."KhuVucID"
        AND "MaGheDayDu" = v_item->>'ticketCode'
      FOR UPDATE;

      IF NOT FOUND OR v_seat."TrangThai" <> 'TRONG' THEN
        RAISE EXCEPTION 'Ghe % khong con trong', v_item->>'ticketCode'
          USING ERRCODE = 'P0001';
      END IF;

      UPDATE "GHE"
      SET "TrangThai" = 'DANG_GIU'
      WHERE "GheID" = v_seat."GheID";

      INSERT INTO "CHI_TIET_GIU_CHO" (
        "GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong"
      ) VALUES (
        v_hold_id, v_zone."KhuVucID", v_seat."GheID", v_seat."MaGheDayDu", 1
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'holdId', v_hold_id,
    'eventId', p_su_kien_id,
    'status', 'ACTIVE',
    'expiresAt', v_expires_at,
    'items', p_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.huy_giu_cho(
  p_giu_cho_id UUID,
  p_phien_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status VARCHAR(20);
BEGIN
  SELECT "TrangThai" INTO v_status
  FROM "GIU_CHO"
  WHERE "GiuChoID" = p_giu_cho_id
    AND "PhienNguoiDung" = p_phien_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_status <> 'ACTIVE' THEN
    RETURN TRUE;
  END IF;

  UPDATE "GHE" AS g
  SET "TrangThai" = 'TRONG'
  WHERE g."TrangThai" = 'DANG_GIU'
    AND EXISTS (
      SELECT 1 FROM "CHI_TIET_GIU_CHO" AS ct
      WHERE ct."GiuChoID" = p_giu_cho_id
        AND ct."GheID" = g."GheID"
    );

  UPDATE "GIU_CHO"
  SET "TrangThai" = 'RELEASED', "NgayCapNhat" = NOW()
  WHERE "GiuChoID" = p_giu_cho_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.tao_giu_cho(INT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.huy_giu_cho(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tao_giu_cho(INT, UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.huy_giu_cho(UUID, UUID) TO anon, authenticated;

