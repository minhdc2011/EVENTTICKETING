-- Sprint 2 fix: ma ve mac dinh cua ve vung dung qua dai.
-- Khi giao dien khong gui ticketCode (ve vung dung), ham ghep MaKhuVuc || '-' || UUID.
-- Voi MaKhuVuc dai (vd GENERAL_ADMISSION, 17 ky tu) ket qua 54 ky tu > VARCHAR(50)
-- cua cot MaVe, gay loi 22001. Sua: cat MaKhuVuc con toi da 13 ky tu (13 + 1 + 36 = 50).
-- Phan con lai cua ham giu nguyen tu 20261115090000.
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
  v_user_id UUID;
  v_limit INT;
  v_otp_required BOOLEAN;
  v_held INT;
  v_remaining INT;
BEGIN
  IF p_phien_id IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Yeu cau giu cho khong hop le' USING ERRCODE = '22023';
  END IF;

  -- Account is taken from the JWT, never from the payload.
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Can dang nhap de giu cho' USING ERRCODE = '28000';
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

  -- Event-level config only (KHU_VUC has its own unrelated per-zone limit).
  SELECT "SoVeToiDaMoiDon", "YeuCauXacMinhOTP"
  INTO v_limit, v_otp_required
  FROM public."CAU_HINH_SU_KIEN"
  WHERE "SuKienID" = v_show."SuKienID";
  IF NOT FOUND THEN
    v_limit := 4;
    v_otp_required := FALSE;
  END IF;
  v_limit := COALESCE(v_limit, 4);
  v_otp_required := COALESCE(v_otp_required, FALSE);

  IF v_otp_required AND NOT public.da_xac_minh_otp() THEN
    RAISE EXCEPTION 'Can xac minh OTP de giu cho' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || v_show."SuKienID"::text));

  PERFORM public.expire_seat_holds(v_show."SuKienID");

  -- Active, unexpired holds of this account for this event, across all shows.
  SELECT COALESCE(SUM(ct."SoLuong"), 0)::INT INTO v_held
  FROM public."GIU_CHO" gc
  JOIN public."CHI_TIET_GIU_CHO" ct ON ct."GiuChoID" = gc."GiuChoID"
  WHERE gc."NguoiDungID" = v_user_id
    AND gc."SuKienID" = v_show."SuKienID"
    AND gc."TrangThai" = 'ACTIVE'
    AND gc."HetHanLuc" > NOW();

  IF v_held + v_total_quantity > v_limit THEN
    v_remaining := GREATEST(v_limit - v_held, 0);
    RAISE EXCEPTION 'VUOT_GIOI_HAN_VE' USING ERRCODE = '22023',
      DETAIL = jsonb_build_object('gioiHan', v_limit, 'dangGiu', v_held, 'conLai', v_remaining)::text,
      HINT = 'Con lai ' || v_remaining::text || ' ve';
  END IF;

  INSERT INTO public."GIU_CHO" ("GiuChoID", "SuKienID", "SuatDienID", "PhienNguoiDung", "NguoiDungID", "TrangThai", "HetHanLuc")
  VALUES (v_hold_id, v_show."SuKienID", p_suat_dien_id, p_phien_id, v_user_id, 'ACTIVE', v_expires_at);

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
      INSERT INTO public."CHI_TIET_GIU_CHO" ("GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong", "DonGiaChot")
      VALUES (v_hold_id, v_zone."KhuVucID", NULL,
        COALESCE(NULLIF(v_item->>'ticketCode', ''), LEFT(v_zone."MaKhuVuc", 13) || '-' || v_hold_id::TEXT), v_quantity,
        v_zone."GiaVeNiemYet");
    ELSE
      IF v_quantity <> 1 THEN RAISE EXCEPTION 'Ve ghe ngoi chi chap nhan so luong 1' USING ERRCODE = '22023'; END IF;
      SELECT * INTO v_seat FROM public."GHE"
      WHERE "KhuVucID" = v_zone."KhuVucID" AND "MaGheDayDu" = v_item->>'ticketCode' FOR UPDATE;
      IF NOT FOUND OR v_seat."TrangThai" <> 'TRONG' THEN RAISE EXCEPTION 'Ghe khong con trong' USING ERRCODE = 'P0001'; END IF;
      UPDATE public."GHE" SET "TrangThai" = 'DANG_GIU' WHERE "GheID" = v_seat."GheID";
      INSERT INTO public."CHI_TIET_GIU_CHO" ("GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong", "DonGiaChot")
      VALUES (v_hold_id, v_zone."KhuVucID", v_seat."GheID", v_seat."MaGheDayDu", 1, v_zone."GiaVeNiemYet");
    END IF;
  END LOOP;

  RETURN jsonb_build_object('holdId', v_hold_id, 'eventId', v_event."Slug", 'showId', p_suat_dien_id,
    'status', 'ACTIVE', 'expiresAt', v_expires_at, 'items', p_items);
END;
$$;

REVOKE ALL ON FUNCTION public.tao_giu_cho_theo_suat(BIGINT, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tao_giu_cho_theo_suat(BIGINT, UUID, JSONB) TO authenticated;

DO $$
BEGIN
  IF position('LEFT(v_zone."MaKhuVuc", 13)' IN pg_get_functiondef('public.tao_giu_cho_theo_suat(bigint,uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'tao_giu_cho_theo_suat chua cat MaKhuVuc';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
