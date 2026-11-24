-- Sprint 2: MOI LAN THANH TOAN CAN MOT OTP MOI (khong dung chung cho nhieu giao dich).
--
-- Truoc: xac_nhan_thanh_toan chi kiem "phien co bang chung OTP trong 24 gio" (da_xac_minh_otp) -> mot OTP dung cho moi thanh toan.
-- Nay, voi su kien bat OTP, xac nhan thanh toan chi duoc khi:
--   (1) co bang chung OTP (amr, method = 'otp') duoc xac minh SAU khi giu cho nay duoc tao, va
--   (2) moc OTP do CHUA duoc dung cho giu cho khac cua cung nguoi dung (moi OTP chi thanh toan mot lan).
-- Moc OTP da dung duoc luu o GIU_CHO."MocOtpDaDung" (giay epoch cua bang chung amr). Ma demo (@demo.vn) van thay OTP nhu truoc
-- va khong ghi moc OTP (nhieu lan thanh toan demo dung cung ma demo).

ALTER TABLE public."GIU_CHO" ADD COLUMN IF NOT EXISTS "MocOtpDaDung" NUMERIC;
COMMENT ON COLUMN public."GIU_CHO"."MocOtpDaDung" IS
  'Moc thoi gian (giay epoch) cua bang chung OTP da dung de xac nhan thanh toan giu cho nay; moi moc chi dung mot lan.';

-- Moc OTP moi nhat trong 24 gio (khong o tuong lai) cua phien hien tai; NULL neu khong co. Khong bao gio nem loi.
CREATE OR REPLACE FUNCTION public.moc_otp_moi_nhat()
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amr JSONB;
  v_now NUMERIC := extract(epoch FROM now());
  v_ts NUMERIC;
BEGIN
  v_amr := auth.jwt() -> 'amr';
  IF v_amr IS NULL OR jsonb_typeof(v_amr) <> 'array' THEN
    RETURN NULL;
  END IF;
  SELECT max((elem ->> 'timestamp')::NUMERIC) INTO v_ts
  FROM jsonb_array_elements(v_amr) AS elem
  WHERE jsonb_typeof(elem) = 'object'
    AND elem ->> 'method' = 'otp'
    AND jsonb_typeof(elem -> 'timestamp') = 'number'
    AND (elem ->> 'timestamp')::NUMERIC <= v_now
    AND (elem ->> 'timestamp')::NUMERIC > v_now - 86400;
  RETURN v_ts;
END;
$$;
REVOKE ALL ON FUNCTION public.moc_otp_moi_nhat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moc_otp_moi_nhat() TO authenticated;

CREATE OR REPLACE FUNCTION public.xac_nhan_thanh_toan(
  p_giu_cho_id UUID,
  p_phien_id UUID,
  p_ma_demo TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_hold public."GIU_CHO"%ROWTYPE;
  v_otp_required BOOLEAN;
  v_email TEXT;
  v_hash TEXT;
  v_demo_ok BOOLEAN := FALSE;
  v_moc_otp NUMERIC;
  v_dung_moc_otp NUMERIC := NULL;
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

  IF v_hold."TrangThai" = 'CONVERTED' THEN
    RETURN jsonb_build_object('holdId', v_hold."GiuChoID", 'status', 'CONVERTED', 'daXacNhanTruoc', TRUE);
  END IF;

  IF v_hold."TrangThai" <> 'ACTIVE' OR v_hold."HetHanLuc" <= NOW() THEN
    RAISE EXCEPTION 'GIU_CHO_HET_HAN' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE("YeuCauXacMinhOTP", FALSE) INTO v_otp_required
  FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = v_hold."SuKienID";
  v_otp_required := COALESCE(v_otp_required, FALSE);

  IF v_otp_required THEN
    -- OTP phai moi: xac minh sau khi giu cho duoc tao va chua dung cho giao dich khac cua nguoi nay.
    v_moc_otp := public.moc_otp_moi_nhat();
    IF v_moc_otp IS NOT NULL
       AND v_moc_otp >= floor(extract(epoch FROM v_hold."NgayTao"))
       AND NOT EXISTS (
         SELECT 1 FROM public."GIU_CHO" g
         WHERE g."NguoiDungID" = v_user_id AND g."GiuChoID" <> p_giu_cho_id AND g."MocOtpDaDung" = v_moc_otp
       ) THEN
      v_dung_moc_otp := v_moc_otp;
    ELSE
      -- Ma demo thay OTP: chi tai khoan @demo.vn, ma khop ban bam dang luu; moi truong hop khac van la thieu OTP.
      IF p_ma_demo IS NOT NULL AND length(p_ma_demo) BETWEEN 4 AND 64 THEN
        SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_user_id;
        SELECT c."GiaTri" INTO v_hash FROM public."CAU_HINH_DEMO" c WHERE c."Khoa" = 'MA_DEMO_BO_QUA_OTP';
        v_demo_ok := v_email IS NOT NULL AND v_email LIKE '%@demo.vn'
          AND v_hash IS NOT NULL AND length(v_hash) > 0
          AND encode(sha256(convert_to(p_ma_demo, 'UTF8')), 'hex') = lower(v_hash);
      END IF;
      IF NOT v_demo_ok THEN
        RAISE EXCEPTION 'Can xac minh OTP de xac nhan thanh toan' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  UPDATE public."GHE" g
  SET "TrangThai" = 'DA_BAN'
  WHERE g."TrangThai" = 'DANG_GIU'
    AND g."GheID" IN (
      SELECT ct."GheID" FROM public."CHI_TIET_GIU_CHO" ct
      WHERE ct."GiuChoID" = p_giu_cho_id AND ct."GheID" IS NOT NULL
    );

  UPDATE public."GIU_CHO"
  SET "TrangThai" = 'CONVERTED', "NgayCapNhat" = NOW(), "MocOtpDaDung" = v_dung_moc_otp
  WHERE "GiuChoID" = p_giu_cho_id;

  SELECT COALESCE(SUM(ct."SoLuong"), 0)::INT INTO v_so_ve
  FROM public."CHI_TIET_GIU_CHO" ct WHERE ct."GiuChoID" = p_giu_cho_id;

  RETURN jsonb_build_object('holdId', p_giu_cho_id, 'status', 'CONVERTED', 'soVe', v_so_ve);
END;
$$;

REVOKE ALL ON FUNCTION public.xac_nhan_thanh_toan(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xac_nhan_thanh_toan(UUID, UUID, TEXT) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.xac_nhan_thanh_toan(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.moc_otp_moi_nhat()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon khong duoc goi ham thanh toan/OTP';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
