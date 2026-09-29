-- Sprint 1 final hardening:
-- 1. The database, not the browser, authorizes the sale window.
-- 2. Expired holds are released by an idempotent server-side function.
-- 3. pg_cron proactively runs expiry cleanup every 10 seconds.

CREATE OR REPLACE FUNCTION public.expire_seat_holds(
  p_su_kien_id INT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count INT := 0;
BEGIN
  WITH expired_holds AS (
    UPDATE public."GIU_CHO"
    SET "TrangThai" = 'EXPIRED', "NgayCapNhat" = NOW()
    WHERE "TrangThai" = 'ACTIVE'
      AND "HetHanLuc" <= NOW()
      AND (p_su_kien_id IS NULL OR "SuKienID" = p_su_kien_id)
    RETURNING "GiuChoID"
  ), reopened_seats AS (
    UPDATE public."GHE" AS g
    SET "TrangThai" = 'TRONG'
    WHERE g."TrangThai" = 'DANG_GIU'
      AND EXISTS (
        SELECT 1
        FROM public."CHI_TIET_GIU_CHO" AS ct
        JOIN expired_holds AS eh ON eh."GiuChoID" = ct."GiuChoID"
        WHERE ct."GheID" = g."GheID"
      )
    RETURNING g."GheID"
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired_holds;

  RETURN v_expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_seat_holds(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_seat_holds(INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_seat_holds(INT) TO postgres, service_role;

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
  v_event public."SU_KIEN"%ROWTYPE;
  v_zone public."KHU_VUC"%ROWTYPE;
  v_seat public."GHE"%ROWTYPE;
  v_quantity INT;
  v_total_quantity INT;
  v_reserved_quantity INT;
  v_sale_status TEXT;
BEGIN
  IF p_phien_id IS NULL THEN
    RAISE EXCEPTION 'Phien nguoi dung khong hop le' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Danh sach ve khong hop le' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event
  FROM public."SU_KIEN"
  WHERE "SuKienID" = p_su_kien_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Khong tim thay su kien' USING ERRCODE = 'P0002';
  END IF;

  v_sale_status := UPPER(TRIM(COALESCE(v_event."TrangThaiMoBan", '')));

  IF v_event."TrangThaiCongBo" <> 'CONG_KHAI' THEN
    RAISE EXCEPTION 'Su kien chua duoc cong bo' USING ERRCODE = 'P0001';
  END IF;

  IF NOW() < v_event."ThoiGianMoBanVe" THEN
    RAISE EXCEPTION 'Su kien chua den thoi gian mo ban' USING ERRCODE = 'P0001';
  END IF;

  IF v_event."ThoiGianDongBanVe" IS NOT NULL
     AND NOW() >= v_event."ThoiGianDongBanVe" THEN
    RAISE EXCEPTION 'Su kien da dong ban' USING ERRCODE = 'P0001';
  END IF;

  IF v_sale_status IN ('HET_VE', 'SOLD_OUT') THEN
    RAISE EXCEPTION 'Su kien da het ve' USING ERRCODE = 'P0001';
  END IF;

  IF v_sale_status IN ('DONG_BAN', 'DA_DONG', 'DA_DIEN_RA', 'CLOSED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Su kien khong con mo ban' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(COALESCE((item->>'quantity')::INT, 1)), 0)
  INTO v_total_quantity
  FROM jsonb_array_elements(p_items) AS item;

  IF v_total_quantity < 1 OR v_total_quantity > 4 THEN
    RAISE EXCEPTION 'Moi luot chi duoc giu tu 1 den 4 ve' USING ERRCODE = '22023';
  END IF;

  -- Idempotent cleanup also guarantees that an expired hold never blocks a
  -- new request even if the scheduler is briefly delayed.
  PERFORM public.expire_seat_holds(p_su_kien_id);

  INSERT INTO public."GIU_CHO" (
    "GiuChoID", "SuKienID", "PhienNguoiDung", "TrangThai", "HetHanLuc"
  ) VALUES (
    v_hold_id, p_su_kien_id, p_phien_id, 'ACTIVE', v_expires_at
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_item->>'quantity')::INT, 1);

    IF v_quantity < 1 OR v_quantity > 4 THEN
      RAISE EXCEPTION 'So luong ve khong hop le' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_zone
    FROM public."KHU_VUC"
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
      FROM public."CHI_TIET_GIU_CHO" AS ct
      JOIN public."GIU_CHO" AS gc ON gc."GiuChoID" = ct."GiuChoID"
      WHERE ct."KhuVucID" = v_zone."KhuVucID"
        AND gc."TrangThai" = 'ACTIVE'
        AND gc."HetHanLuc" > NOW();

      IF v_reserved_quantity + v_quantity > v_zone."TongSoGhe" THEN
        RAISE EXCEPTION 'Phan khu % khong con du so luong', v_zone."MaKhuVuc"
          USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO public."CHI_TIET_GIU_CHO" (
        "GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong"
      ) VALUES (
        v_hold_id,
        v_zone."KhuVucID",
        NULL,
        COALESCE(NULLIF(v_item->>'ticketCode', ''), v_zone."MaKhuVuc" || '-' || v_hold_id::TEXT),
        v_quantity
      );
    ELSE
      IF v_quantity <> 1 THEN
        RAISE EXCEPTION 'Ve ghe ngoi chi chap nhan so luong 1'
          USING ERRCODE = '22023';
      END IF;

      SELECT * INTO v_seat
      FROM public."GHE"
      WHERE "KhuVucID" = v_zone."KhuVucID"
        AND "MaGheDayDu" = v_item->>'ticketCode'
      FOR UPDATE;

      IF NOT FOUND OR v_seat."TrangThai" <> 'TRONG' THEN
        RAISE EXCEPTION 'Ghe % khong con trong', v_item->>'ticketCode'
          USING ERRCODE = 'P0001';
      END IF;

      UPDATE public."GHE"
      SET "TrangThai" = 'DANG_GIU'
      WHERE "GheID" = v_seat."GheID";

      INSERT INTO public."CHI_TIET_GIU_CHO" (
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

REVOKE ALL ON FUNCTION public.tao_giu_cho(INT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tao_giu_cho(INT, UUID, JSONB) TO anon, authenticated;

-- Supabase hosted projects provide pg_cron. Ten-second cadence keeps released
-- inventory close to the 300-second business deadline while the RPC cleanup
-- remains the correctness fallback.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'eventticketing-expire-seat-holds'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'eventticketing-expire-seat-holds',
    '10 seconds',
    'SELECT public.expire_seat_holds();'
  );
END;
$$;

