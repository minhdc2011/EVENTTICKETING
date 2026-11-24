-- Sprint 2, luong moi (24/11/2026): GIU CHO TRUOC, OTP XAC NHAN THANH TOAN SAU.
--
-- Truoc day OTP chan o buoc giu cho. Luong dung cua mot trang ban ve:
--   1. Chon ghe (chua giu).
--   2. Giu cho: chi can dang nhap. Dong ho 5 phut bat dau.
--   3. Xac nhan thanh toan: su kien bat OTP thi can OTP (amr = otp trong 24 gio). Dung thi giu cho -> CONVERTED, ghe -> DA_BAN.
--   4. Gia han giu cho MOT LAN (them 5 phut) luc nguoi dung bam Xac nhan thanh toan va can OTP,
--      de ghe khong bi tra khi nguoi dung dang nhap ma OTP (ma OTP co hieu luc 300 giay).
-- "Thanh toan" van la mo phong (chua co cong thanh toan); ham xac nhan chi chuyen giu cho thanh da ban.
--
-- Chi them moi: cot GIU_CHO.DaGiaHan, 2 ham moi, va CREATE OR REPLACE tao_giu_cho_theo_suat (bo kiem OTP,
-- tinh ca ve da xac nhan vao han muc va ton kho ve dung).

ALTER TABLE public."GIU_CHO"
  ADD COLUMN IF NOT EXISTS "DaGiaHan" BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 1. Giu cho: chi can dang nhap (khong con kiem OTP)
-- ---------------------------------------------------------------------------
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
  SELECT "SoVeToiDaMoiDon"
  INTO v_limit
  FROM public."CAU_HINH_SU_KIEN"
  WHERE "SuKienID" = v_show."SuKienID";
  IF NOT FOUND THEN
    v_limit := 4;
  END IF;
  v_limit := COALESCE(v_limit, 4);

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || v_show."SuKienID"::text));

  PERFORM public.expire_seat_holds(v_show."SuKienID");

  -- Ve dang giu con han VA ve da xac nhan thanh toan cua tai khoan trong su kien, tren moi suat.
  SELECT COALESCE(SUM(ct."SoLuong"), 0)::INT INTO v_held
  FROM public."GIU_CHO" gc
  JOIN public."CHI_TIET_GIU_CHO" ct ON ct."GiuChoID" = gc."GiuChoID"
  WHERE gc."NguoiDungID" = v_user_id
    AND gc."SuKienID" = v_show."SuKienID"
    AND ((gc."TrangThai" = 'ACTIVE' AND gc."HetHanLuc" > NOW()) OR gc."TrangThai" = 'CONVERTED');

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
      -- Ton kho ve dung: tinh giu cho con han va ve da xac nhan thanh toan.
      SELECT COALESCE(SUM(ct."SoLuong"), 0) INTO v_reserved_quantity
      FROM public."CHI_TIET_GIU_CHO" ct JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID"
      WHERE ct."KhuVucID" = v_zone."KhuVucID"
        AND ((gc."TrangThai" = 'ACTIVE' AND gc."HetHanLuc" > NOW()) OR gc."TrangThai" = 'CONVERTED');
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

-- ---------------------------------------------------------------------------
-- 2. Gia han giu cho MOT LAN (them 5 phut) luc bat dau buoc OTP
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gia_han_giu_cho(
  p_giu_cho_id UUID,
  p_phien_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_hold public."GIU_CHO"%ROWTYPE;
  v_moi TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Can dang nhap de gia han giu cho' USING ERRCODE = '28000';
  END IF;
  IF p_giu_cho_id IS NULL OR p_phien_id IS NULL THEN
    RAISE EXCEPTION 'Yeu cau gia han khong hop le' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_hold FROM public."GIU_CHO"
  WHERE "GiuChoID" = p_giu_cho_id AND "NguoiDungID" = v_user_id AND "PhienNguoiDung" = p_phien_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Khong tim thay giu cho' USING ERRCODE = 'P0002';
  END IF;

  IF v_hold."TrangThai" <> 'ACTIVE' OR v_hold."HetHanLuc" <= NOW() THEN
    RAISE EXCEPTION 'GIU_CHO_HET_HAN' USING ERRCODE = 'P0001';
  END IF;

  -- Da gia han roi: tra lai han hien tai, khong gia han them.
  IF v_hold."DaGiaHan" THEN
    RETURN jsonb_build_object('holdId', v_hold."GiuChoID", 'expiresAt', v_hold."HetHanLuc",
      'daGiaHan', TRUE, 'giaHanMoi', FALSE);
  END IF;

  v_moi := GREATEST(v_hold."HetHanLuc", NOW() + INTERVAL '5 minutes');
  UPDATE public."GIU_CHO"
  SET "HetHanLuc" = v_moi, "DaGiaHan" = TRUE, "NgayCapNhat" = NOW()
  WHERE "GiuChoID" = p_giu_cho_id;

  RETURN jsonb_build_object('holdId', p_giu_cho_id, 'expiresAt', v_moi, 'daGiaHan', TRUE, 'giaHanMoi', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.gia_han_giu_cho(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gia_han_giu_cho(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Xac nhan thanh toan (mo phong): can OTP neu su kien bat OTP
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.xac_nhan_thanh_toan(
  p_giu_cho_id UUID,
  p_phien_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_hold public."GIU_CHO"%ROWTYPE;
  v_otp_required BOOLEAN;
  v_so_ve INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Can dang nhap de xac nhan thanh toan' USING ERRCODE = '28000';
  END IF;
  IF p_giu_cho_id IS NULL OR p_phien_id IS NULL THEN
    RAISE EXCEPTION 'Yeu cau xac nhan thanh toan khong hop le' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_hold FROM public."GIU_CHO"
  WHERE "GiuChoID" = p_giu_cho_id AND "NguoiDungID" = v_user_id AND "PhienNguoiDung" = p_phien_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Khong tim thay giu cho' USING ERRCODE = 'P0002';
  END IF;

  -- Goi lai sau khi da xac nhan: thanh cong, khong lam gi them.
  IF v_hold."TrangThai" = 'CONVERTED' THEN
    RETURN jsonb_build_object('holdId', v_hold."GiuChoID", 'status', 'CONVERTED', 'daXacNhanTruoc', TRUE);
  END IF;

  IF v_hold."TrangThai" <> 'ACTIVE' OR v_hold."HetHanLuc" <= NOW() THEN
    RAISE EXCEPTION 'GIU_CHO_HET_HAN' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE("YeuCauXacMinhOTP", FALSE) INTO v_otp_required
  FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = v_hold."SuKienID";
  v_otp_required := COALESCE(v_otp_required, FALSE);

  IF v_otp_required AND NOT public.da_xac_minh_otp() THEN
    RAISE EXCEPTION 'Can xac minh OTP de xac nhan thanh toan' USING ERRCODE = '42501';
  END IF;

  UPDATE public."GHE" g
  SET "TrangThai" = 'DA_BAN'
  WHERE g."TrangThai" = 'DANG_GIU'
    AND g."GheID" IN (
      SELECT ct."GheID" FROM public."CHI_TIET_GIU_CHO" ct
      WHERE ct."GiuChoID" = p_giu_cho_id AND ct."GheID" IS NOT NULL
    );

  UPDATE public."GIU_CHO"
  SET "TrangThai" = 'CONVERTED', "NgayCapNhat" = NOW()
  WHERE "GiuChoID" = p_giu_cho_id;

  SELECT COALESCE(SUM(ct."SoLuong"), 0)::INT INTO v_so_ve
  FROM public."CHI_TIET_GIU_CHO" ct WHERE ct."GiuChoID" = p_giu_cho_id;

  RETURN jsonb_build_object('holdId', p_giu_cho_id, 'status', 'CONVERTED', 'soVe', v_so_ve);
END;
$$;

REVOKE ALL ON FUNCTION public.xac_nhan_thanh_toan(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xac_nhan_thanh_toan(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tu kiem tra: giu cho khong con kiem OTP; hai ham moi ton tai va chi cap cho authenticated.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF position('da_xac_minh_otp' IN pg_get_functiondef('public.tao_giu_cho_theo_suat(bigint,uuid,jsonb)'::regprocedure)) <> 0 THEN
    RAISE EXCEPTION 'tao_giu_cho_theo_suat van con kiem OTP';
  END IF;
  IF position('da_xac_minh_otp' IN pg_get_functiondef('public.xac_nhan_thanh_toan(uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'xac_nhan_thanh_toan thieu kiem OTP';
  END IF;
  IF has_function_privilege('anon', 'public.xac_nhan_thanh_toan(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.gia_han_giu_cho(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon khong duoc goi xac_nhan_thanh_toan hoac gia_han_giu_cho';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
