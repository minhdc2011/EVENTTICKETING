-- Product Foundation (additive): multi-event, Event 1:N Show, organization RBAC.
-- Sprint 1 remains VERIFIED. This migration preserves the legacy tables and RPC
-- while introducing show-aware routes and inventory for the next increments.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public."TO_CHUC" (
  "ToChucID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "TenToChuc" VARCHAR(200) NOT NULL,
  "Slug" VARCHAR(120) NOT NULL UNIQUE,
  "TrangThai" VARCHAR(20) NOT NULL DEFAULT 'HOAT_DONG'
    CHECK ("TrangThai" IN ('HOAT_DONG', 'TAM_KHOA')),
  "NgayTao" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "NgayCapNhat" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public."HO_SO_NGUOI_DUNG" (
  "NguoiDungID" UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  "HoTen" VARCHAR(150),
  "AnhDaiDienURL" TEXT,
  "NgayTao" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "NgayCapNhat" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public."THANH_VIEN_TO_CHUC" (
  "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ToChucID" UUID NOT NULL REFERENCES public."TO_CHUC"("ToChucID") ON DELETE CASCADE,
  "NguoiDungID" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "VaiTro" VARCHAR(20) NOT NULL
    CHECK ("VaiTro" IN ('CHU_SO_HUU', 'QUAN_TRI', 'BIEN_TAP', 'VAN_HANH', 'SOAT_VE')),
  "NgayTao" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("ToChucID", "NguoiDungID")
);

CREATE TABLE IF NOT EXISTS public."DIA_DIEM" (
  "DiaDiemID" BIGSERIAL PRIMARY KEY,
  "ToChucID" UUID REFERENCES public."TO_CHUC"("ToChucID") ON DELETE SET NULL,
  "TenDiaDiem" VARCHAR(200) NOT NULL,
  "DiaChi" TEXT NOT NULL,
  "MuiGio" VARCHAR(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "SucChua" INT CHECK ("SucChua" IS NULL OR "SucChua" > 0),
  "NgayTao" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public."PHIEN_BAN_SO_DO" (
  "PhienBanSoDoID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "DiaDiemID" BIGINT NOT NULL REFERENCES public."DIA_DIEM"("DiaDiemID") ON DELETE RESTRICT,
  "SoPhienBan" INT NOT NULL CHECK ("SoPhienBan" > 0),
  "TenPhienBan" VARCHAR(150) NOT NULL,
  "DuLieuSoDo" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "DaKhoa" BOOLEAN NOT NULL DEFAULT FALSE,
  "NgayTao" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("DiaDiemID", "SoPhienBan")
);

ALTER TABLE public."SU_KIEN"
  ADD COLUMN IF NOT EXISTS "Slug" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "ToChucID" UUID REFERENCES public."TO_CHUC"("ToChucID") ON DELETE RESTRICT;

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES ('00000000-0000-0000-0000-000000000001', 'Ban tổ chức EventTicketing', 'eventticketing-demo')
ON CONFLICT ("Slug") DO NOTHING;

UPDATE public."SU_KIEN"
SET "Slug" = CASE
      WHEN "SuKienID" = 1 THEN 'super-concert-2026'
      ELSE 'su-kien-' || "SuKienID"::TEXT
    END
WHERE "Slug" IS NULL;

UPDATE public."SU_KIEN"
SET "ToChucID" = '00000000-0000-0000-0000-000000000001'
WHERE "ToChucID" IS NULL;

ALTER TABLE public."SU_KIEN"
  ALTER COLUMN "Slug" SET NOT NULL,
  ALTER COLUMN "ToChucID" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uk_sukien_slug" ON public."SU_KIEN" ("Slug");
CREATE INDEX IF NOT EXISTS "idx_sukien_tochuc" ON public."SU_KIEN" ("ToChucID");
ALTER TABLE public."SU_KIEN" DROP CONSTRAINT IF EXISTS "chk_sukien_slug";
ALTER TABLE public."SU_KIEN" ADD CONSTRAINT "chk_sukien_slug"
  CHECK ("Slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

CREATE TABLE IF NOT EXISTS public."SUAT_DIEN" (
  "SuatDienID" BIGSERIAL PRIMARY KEY,
  "SuKienID" INT NOT NULL REFERENCES public."SU_KIEN"("SuKienID") ON DELETE CASCADE,
  "Slug" VARCHAR(120) NOT NULL,
  "TenSuatDien" VARCHAR(200) NOT NULL,
  "DiaDiemID" BIGINT REFERENCES public."DIA_DIEM"("DiaDiemID") ON DELETE RESTRICT,
  "PhienBanSoDoID" UUID REFERENCES public."PHIEN_BAN_SO_DO"("PhienBanSoDoID") ON DELETE RESTRICT,
  "MuiGio" VARCHAR(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "ThoiGianBatDau" TIMESTAMPTZ NOT NULL,
  "ThoiGianKetThuc" TIMESTAMPTZ NOT NULL,
  "ThoiGianMoBanVe" TIMESTAMPTZ NOT NULL,
  "ThoiGianDongBanVe" TIMESTAMPTZ,
  "TrangThai" VARCHAR(30) NOT NULL DEFAULT 'SAP_MO_BAN'
    CHECK ("TrangThai" IN ('BAN_NHAP', 'SAP_MO_BAN', 'DANG_MO_BAN', 'HET_VE', 'DONG_BAN', 'HUY', 'DA_DIEN_RA')),
  "NgayTao" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "NgayCapNhat" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "chk_suatdien_thoigian" CHECK ("ThoiGianKetThuc" > "ThoiGianBatDau"),
  CONSTRAINT "chk_suatdien_banve" CHECK ("ThoiGianDongBanVe" IS NULL OR "ThoiGianDongBanVe" > "ThoiGianMoBanVe"),
  UNIQUE ("SuKienID", "Slug")
);

INSERT INTO public."DIA_DIEM" ("DiaDiemID", "ToChucID", "TenDiaDiem", "DiaChi", "MuiGio", "SucChua")
SELECT 1, "ToChucID", "TenSanVanDong", "DiaDiem", 'Asia/Ho_Chi_Minh', "SucChua"
FROM public."SU_KIEN"
WHERE "SuKienID" = 1
ON CONFLICT ("DiaDiemID") DO NOTHING;

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "DiaDiemID", "MuiGio",
  "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
)
SELECT 1, "SuKienID", 'dem-chinh', 'Đêm diễn chính', 1, 'Asia/Ho_Chi_Minh',
       "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
       CASE UPPER("TrangThaiMoBan")
         WHEN 'DANG_BAN' THEN 'DANG_MO_BAN'
         WHEN 'DANG_MO_BAN' THEN 'DANG_MO_BAN'
         WHEN 'HET_VE' THEN 'HET_VE'
         WHEN 'DONG_BAN' THEN 'DONG_BAN'
         ELSE 'SAP_MO_BAN'
       END
FROM public."SU_KIEN"
WHERE "SuKienID" = 1
ON CONFLICT ("SuatDienID") DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('public."DIA_DIEM"', 'DiaDiemID'),
  GREATEST(1, COALESCE((SELECT MAX("DiaDiemID") FROM public."DIA_DIEM"), 1))
);
SELECT setval(
  pg_get_serial_sequence('public."SUAT_DIEN"', 'SuatDienID'),
  GREATEST(1, COALESCE((SELECT MAX("SuatDienID") FROM public."SUAT_DIEN"), 1))
);

ALTER TABLE public."KHU_VUC"
  ADD COLUMN IF NOT EXISTS "SuatDienID" BIGINT REFERENCES public."SUAT_DIEN"("SuatDienID") ON DELETE CASCADE;

UPDATE public."KHU_VUC" kv
SET "SuatDienID" = (
  SELECT sd."SuatDienID" FROM public."SUAT_DIEN" sd
  WHERE sd."SuKienID" = kv."SuKienID"
  ORDER BY sd."ThoiGianBatDau", sd."SuatDienID"
  LIMIT 1
)
WHERE kv."SuatDienID" IS NULL;

ALTER TABLE public."KHU_VUC" ALTER COLUMN "SuatDienID" SET NOT NULL;
ALTER TABLE public."KHU_VUC" DROP CONSTRAINT IF EXISTS "uk_sukien_makhu";
CREATE UNIQUE INDEX IF NOT EXISTS "uk_suatdien_makhu"
  ON public."KHU_VUC" ("SuatDienID", "MaKhuVuc");
CREATE INDEX IF NOT EXISTS "idx_khuvuc_suatdien" ON public."KHU_VUC" ("SuatDienID");

ALTER TABLE public."GIU_CHO"
  ADD COLUMN IF NOT EXISTS "SuatDienID" BIGINT REFERENCES public."SUAT_DIEN"("SuatDienID") ON DELETE CASCADE;

UPDATE public."GIU_CHO" gc
SET "SuatDienID" = (
  SELECT sd."SuatDienID" FROM public."SUAT_DIEN" sd
  WHERE sd."SuKienID" = gc."SuKienID"
  ORDER BY sd."ThoiGianBatDau", sd."SuatDienID"
  LIMIT 1
)
WHERE gc."SuatDienID" IS NULL;

ALTER TABLE public."GIU_CHO" ALTER COLUMN "SuatDienID" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_giucho_suatdien" ON public."GIU_CHO" ("SuatDienID");

-- Reject mismatched redundant event/show references during the compatibility period.
CREATE OR REPLACE FUNCTION public.kiem_tra_suat_dien_thuoc_su_kien()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."SUAT_DIEN" sd
    WHERE sd."SuatDienID" = NEW."SuatDienID" AND sd."SuKienID" = NEW."SuKienID"
  ) THEN
    RAISE EXCEPTION 'Suat dien khong thuoc su kien da chon' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_khuvuc_suatdien_sukien" ON public."KHU_VUC";
CREATE TRIGGER "trg_khuvuc_suatdien_sukien"
BEFORE INSERT OR UPDATE OF "SuatDienID", "SuKienID" ON public."KHU_VUC"
FOR EACH ROW EXECUTE FUNCTION public.kiem_tra_suat_dien_thuoc_su_kien();

DROP TRIGGER IF EXISTS "trg_giucho_suatdien_sukien" ON public."GIU_CHO";
CREATE TRIGGER "trg_giucho_suatdien_sukien"
BEFORE INSERT OR UPDATE OF "SuatDienID", "SuKienID" ON public."GIU_CHO"
FOR EACH ROW EXECUTE FUNCTION public.kiem_tra_suat_dien_thuoc_su_kien();

-- Profile creation follows Supabase Auth without exposing auth.users.
CREATE OR REPLACE FUNCTION public.tao_ho_so_nguoi_dung_moi()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen")
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT ("NguoiDungID") DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "on_auth_user_created_eventticketing" ON auth.users;
CREATE TRIGGER "on_auth_user_created_eventticketing"
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.tao_ho_so_nguoi_dung_moi();

ALTER TABLE public."TO_CHUC" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HO_SO_NGUOI_DUNG" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."THANH_VIEN_TO_CHUC" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DIA_DIEM" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PHIEN_BAN_SO_DO" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SUAT_DIEN" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.la_thanh_vien_to_chuc(p_to_chuc_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."THANH_VIEN_TO_CHUC" tv
    WHERE tv."ToChucID" = p_to_chuc_id AND tv."NguoiDungID" = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.la_thanh_vien_to_chuc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.la_thanh_vien_to_chuc(UUID) TO authenticated;

CREATE POLICY "User reads own profile" ON public."HO_SO_NGUOI_DUNG"
FOR SELECT TO authenticated USING ("NguoiDungID" = auth.uid());
CREATE POLICY "User updates own profile" ON public."HO_SO_NGUOI_DUNG"
FOR UPDATE TO authenticated USING ("NguoiDungID" = auth.uid()) WITH CHECK ("NguoiDungID" = auth.uid());

CREATE POLICY "Members read own memberships" ON public."THANH_VIEN_TO_CHUC"
FOR SELECT TO authenticated USING ("NguoiDungID" = auth.uid() OR public.la_thanh_vien_to_chuc("ToChucID"));
CREATE POLICY "Members read organizations" ON public."TO_CHUC"
FOR SELECT TO authenticated USING (public.la_thanh_vien_to_chuc("ToChucID"));

CREATE POLICY "Public reads venues of published events" ON public."DIA_DIEM"
FOR SELECT TO anon, authenticated USING (
  EXISTS (
    SELECT 1 FROM public."SUAT_DIEN" sd
    JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
    WHERE sd."DiaDiemID" = "DIA_DIEM"."DiaDiemID"
      AND sk."TrangThaiCongBo" = 'CONG_KHAI'
      AND sd."TrangThai" <> 'BAN_NHAP'
  )
);
CREATE POLICY "Public reads locked maps of published events" ON public."PHIEN_BAN_SO_DO"
FOR SELECT TO anon, authenticated USING (
  "DaKhoa" AND EXISTS (
    SELECT 1 FROM public."SUAT_DIEN" sd
    JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
    WHERE sd."PhienBanSoDoID" = "PHIEN_BAN_SO_DO"."PhienBanSoDoID"
      AND sk."TrangThaiCongBo" = 'CONG_KHAI'
      AND sd."TrangThai" <> 'BAN_NHAP'
  )
);
CREATE POLICY "Public reads shows of published events" ON public."SUAT_DIEN"
FOR SELECT TO anon, authenticated USING (
  "TrangThai" <> 'BAN_NHAP' AND EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "SUAT_DIEN"."SuKienID"
      AND sk."TrangThaiCongBo" = 'CONG_KHAI'
  )
);

-- Replace Sprint 1 event-level catalog policies with show-aware policies. A
-- draft show of an already-published event must remain invisible.
DROP POLICY IF EXISTS "Public Read Published KHU_VUC" ON public."KHU_VUC";
CREATE POLICY "Public reads zones of published shows" ON public."KHU_VUC"
FOR SELECT TO anon, authenticated USING (
  EXISTS (
    SELECT 1 FROM public."SUAT_DIEN" sd
    JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
    WHERE sd."SuatDienID" = "KHU_VUC"."SuatDienID"
      AND sd."TrangThai" <> 'BAN_NHAP'
      AND sk."TrangThaiCongBo" = 'CONG_KHAI'
  )
);

DROP POLICY IF EXISTS "Public Read Published GHE" ON public."GHE";
CREATE POLICY "Public reads seats of published shows" ON public."GHE"
FOR SELECT TO anon, authenticated USING (
  EXISTS (
    SELECT 1 FROM public."KHU_VUC" kv
    JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = kv."SuatDienID"
    JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
    WHERE kv."KhuVucID" = "GHE"."KhuVucID"
      AND sd."TrangThai" <> 'BAN_NHAP'
      AND sk."TrangThaiCongBo" = 'CONG_KHAI'
  )
);

CREATE POLICY "Members manage their events" ON public."SU_KIEN"
FOR ALL TO authenticated
USING (public.la_thanh_vien_to_chuc("ToChucID"))
WITH CHECK (public.la_thanh_vien_to_chuc("ToChucID"));
CREATE POLICY "Members manage their shows" ON public."SUAT_DIEN"
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."SU_KIEN" sk
  WHERE sk."SuKienID" = "SUAT_DIEN"."SuKienID"
    AND public.la_thanh_vien_to_chuc(sk."ToChucID")
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public."SU_KIEN" sk
  WHERE sk."SuKienID" = "SUAT_DIEN"."SuKienID"
    AND public.la_thanh_vien_to_chuc(sk."ToChucID")
));

CREATE POLICY "Members manage their venues" ON public."DIA_DIEM"
FOR ALL TO authenticated
USING ("ToChucID" IS NOT NULL AND public.la_thanh_vien_to_chuc("ToChucID"))
WITH CHECK ("ToChucID" IS NOT NULL AND public.la_thanh_vien_to_chuc("ToChucID"));
CREATE POLICY "Members manage their map versions" ON public."PHIEN_BAN_SO_DO"
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."DIA_DIEM" dd
  WHERE dd."DiaDiemID" = "PHIEN_BAN_SO_DO"."DiaDiemID"
    AND dd."ToChucID" IS NOT NULL AND public.la_thanh_vien_to_chuc(dd."ToChucID")
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public."DIA_DIEM" dd
  WHERE dd."DiaDiemID" = "PHIEN_BAN_SO_DO"."DiaDiemID"
    AND dd."ToChucID" IS NOT NULL AND public.la_thanh_vien_to_chuc(dd."ToChucID")
));
CREATE POLICY "Members manage show zones" ON public."KHU_VUC"
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."SUAT_DIEN" sd JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
  WHERE sd."SuatDienID" = "KHU_VUC"."SuatDienID" AND public.la_thanh_vien_to_chuc(sk."ToChucID")
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public."SUAT_DIEN" sd JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
  WHERE sd."SuatDienID" = "KHU_VUC"."SuatDienID" AND public.la_thanh_vien_to_chuc(sk."ToChucID")
));
CREATE POLICY "Members manage show seats" ON public."GHE"
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."KHU_VUC" kv
  JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = kv."SuatDienID"
  JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
  WHERE kv."KhuVucID" = "GHE"."KhuVucID" AND public.la_thanh_vien_to_chuc(sk."ToChucID")
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public."KHU_VUC" kv
  JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = kv."SuatDienID"
  JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
  WHERE kv."KhuVucID" = "GHE"."KhuVucID" AND public.la_thanh_vien_to_chuc(sk."ToChucID")
));

-- Publish validation. An event needs at least one valid show and each show must
-- have at least one sale zone. This function is the only supported publish path.
CREATE OR REPLACE FUNCTION public.cong_bo_su_kien(p_su_kien_id INT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT "ToChucID" INTO v_org FROM public."SU_KIEN"
  WHERE "SuKienID" = p_su_kien_id FOR UPDATE;
  IF NOT FOUND OR NOT public.la_thanh_vien_to_chuc(v_org) THEN
    RAISE EXCEPTION 'Khong co quyen cong bo su kien' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."SUAT_DIEN" sd
    WHERE sd."SuKienID" = p_su_kien_id
  ) OR EXISTS (
    SELECT 1 FROM public."SUAT_DIEN" sd
    WHERE sd."SuKienID" = p_su_kien_id
      AND (
        sd."ThoiGianKetThuc" <= sd."ThoiGianBatDau"
        OR sd."ThoiGianMoBanVe" >= sd."ThoiGianBatDau"
        OR NOT EXISTS (SELECT 1 FROM public."KHU_VUC" kv WHERE kv."SuatDienID" = sd."SuatDienID")
      )
  ) THEN
    RAISE EXCEPTION 'Su kien chua co suat dien va phan khu hop le' USING ERRCODE = '23514';
  END IF;
  UPDATE public."SU_KIEN" SET "TrangThaiCongBo" = 'CONG_KHAI', "NgayCapNhat" = NOW()
  WHERE "SuKienID" = p_su_kien_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.cong_bo_su_kien(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cong_bo_su_kien(INT) TO authenticated;

-- Show-aware hold RPC. Prices and inventory are always resolved in PostgreSQL.
CREATE OR REPLACE FUNCTION public.tao_giu_cho_theo_suat(
  p_suat_dien_id BIGINT,
  p_phien_id UUID,
  p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hold_id UUID := gen_random_uuid();
  v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '5 minutes';
  v_item JSONB;
  v_show public."SUAT_DIEN"%ROWTYPE;
  v_event public."SU_KIEN"%ROWTYPE;
  v_zone public."KHU_VUC"%ROWTYPE;
  v_seat public."GHE"%ROWTYPE;
  v_quantity INT;
  v_total_quantity INT;
  v_reserved_quantity INT;
BEGIN
  IF p_phien_id IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Yeu cau giu cho khong hop le' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_show FROM public."SUAT_DIEN"
  WHERE "SuatDienID" = p_suat_dien_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Khong tim thay suat dien' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_event FROM public."SU_KIEN"
  WHERE "SuKienID" = v_show."SuKienID" FOR SHARE;
  IF v_event."TrangThaiCongBo" <> 'CONG_KHAI' OR v_show."TrangThai" IN ('BAN_NHAP', 'HUY', 'DONG_BAN', 'DA_DIEN_RA') THEN
    RAISE EXCEPTION 'Suat dien khong mo ban' USING ERRCODE = 'P0001';
  END IF;
  IF NOW() < v_show."ThoiGianMoBanVe" OR (v_show."ThoiGianDongBanVe" IS NOT NULL AND NOW() >= v_show."ThoiGianDongBanVe") THEN
    RAISE EXCEPTION 'Ngoai thoi gian mo ban' USING ERRCODE = 'P0001';
  END IF;
  IF v_show."TrangThai" = 'HET_VE' THEN RAISE EXCEPTION 'Suat dien da het ve' USING ERRCODE = 'P0001'; END IF;

  SELECT COALESCE(SUM(COALESCE((item->>'quantity')::INT, 1)), 0)
  INTO v_total_quantity FROM jsonb_array_elements(p_items) item;
  IF v_total_quantity < 1 OR v_total_quantity > 4 THEN
    RAISE EXCEPTION 'Moi luot chi duoc giu tu 1 den 4 ve' USING ERRCODE = '22023';
  END IF;

  PERFORM public.expire_seat_holds(v_show."SuKienID");
  INSERT INTO public."GIU_CHO" ("GiuChoID", "SuKienID", "SuatDienID", "PhienNguoiDung", "TrangThai", "HetHanLuc")
  VALUES (v_hold_id, v_show."SuKienID", p_suat_dien_id, p_phien_id, 'ACTIVE', v_expires_at);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_item->>'quantity')::INT, 1);
    IF v_quantity < 1 OR v_quantity > 4 THEN RAISE EXCEPTION 'So luong ve khong hop le' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_zone FROM public."KHU_VUC"
    WHERE "SuatDienID" = p_suat_dien_id AND "MaKhuVuc" = v_item->>'zoneCode' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Khong tim thay phan khu' USING ERRCODE = 'P0002'; END IF;

    IF v_zone."LoaiKhuVuc" = 'DUNG_STAND' THEN
      SELECT COALESCE(SUM(ct."SoLuong"), 0) INTO v_reserved_quantity
      FROM public."CHI_TIET_GIU_CHO" ct JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID"
      WHERE ct."KhuVucID" = v_zone."KhuVucID" AND gc."TrangThai" = 'ACTIVE' AND gc."HetHanLuc" > NOW();
      IF v_reserved_quantity + v_quantity > v_zone."TongSoGhe" THEN
        RAISE EXCEPTION 'Phan khu khong con du so luong' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO public."CHI_TIET_GIU_CHO" ("GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong")
      VALUES (v_hold_id, v_zone."KhuVucID", NULL,
        COALESCE(NULLIF(v_item->>'ticketCode', ''), v_zone."MaKhuVuc" || '-' || v_hold_id::TEXT), v_quantity);
    ELSE
      IF v_quantity <> 1 THEN RAISE EXCEPTION 'Ve ghe ngoi chi chap nhan so luong 1' USING ERRCODE = '22023'; END IF;
      SELECT * INTO v_seat FROM public."GHE"
      WHERE "KhuVucID" = v_zone."KhuVucID" AND "MaGheDayDu" = v_item->>'ticketCode' FOR UPDATE;
      IF NOT FOUND OR v_seat."TrangThai" <> 'TRONG' THEN RAISE EXCEPTION 'Ghe khong con trong' USING ERRCODE = 'P0001'; END IF;
      UPDATE public."GHE" SET "TrangThai" = 'DANG_GIU' WHERE "GheID" = v_seat."GheID";
      INSERT INTO public."CHI_TIET_GIU_CHO" ("GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong")
      VALUES (v_hold_id, v_zone."KhuVucID", v_seat."GheID", v_seat."MaGheDayDu", 1);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('holdId', v_hold_id, 'eventId', v_event."Slug", 'showId', p_suat_dien_id,
    'status', 'ACTIVE', 'expiresAt', v_expires_at, 'items', p_items);
END;
$$;
REVOKE ALL ON FUNCTION public.tao_giu_cho_theo_suat(BIGINT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tao_giu_cho_theo_suat(BIGINT, UUID, JSONB) TO anon, authenticated;

-- Compatibility adapter for the verified Sprint 1 client. It resolves the
-- earliest show so existing deployments keep working for one release.
CREATE OR REPLACE FUNCTION public.tao_giu_cho(p_su_kien_id INT, p_phien_id UUID, p_items JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_show_id BIGINT;
BEGIN
  SELECT "SuatDienID" INTO v_show_id FROM public."SUAT_DIEN"
  WHERE "SuKienID" = p_su_kien_id AND "TrangThai" <> 'BAN_NHAP'
  ORDER BY "ThoiGianBatDau", "SuatDienID" LIMIT 1;
  IF v_show_id IS NULL THEN RAISE EXCEPTION 'Su kien chua co suat dien' USING ERRCODE = 'P0002'; END IF;
  RETURN public.tao_giu_cho_theo_suat(v_show_id, p_phien_id, p_items);
END;
$$;
REVOKE ALL ON FUNCTION public.tao_giu_cho(INT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tao_giu_cho(INT, UUID, JSONB) TO anon, authenticated;

GRANT SELECT ON public."SUAT_DIEN", public."DIA_DIEM", public."PHIEN_BAN_SO_DO" TO anon, authenticated;
GRANT SELECT ON public."TO_CHUC", public."HO_SO_NGUOI_DUNG", public."THANH_VIEN_TO_CHUC" TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public."SU_KIEN", public."SUAT_DIEN", public."KHU_VUC", public."GHE",
  public."DIA_DIEM", public."PHIEN_BAN_SO_DO" TO authenticated;
GRANT UPDATE ON public."HO_SO_NGUOI_DUNG" TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public."SUAT_DIEN_SuatDienID_seq", public."DIA_DIEM_DiaDiemID_seq" TO authenticated;
