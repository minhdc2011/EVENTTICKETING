-- Sprint 2: ma demo thay the OTP, CHI cho tai khoan demo (email duoi @demo.vn).
--
-- Muc dich: tai khoan dang nhap nhanh (buyer@demo.vn) khong co hop thu that nen khong nhan duoc ma OTP;
-- khi demo, nhap ma demo vao o OTP thi xac nhan thanh toan thanh cong.
--
-- Rang buoc an toan:
--  1. Kiem o MAY CHU trong xac_nhan_thanh_toan (khong kiem o trinh duyet).
--  2. Ma KHONG nam trong ma nguon: chi luu dang bam SHA-256 trong bang rieng CAU_HINH_DEMO (khong ai ngoai
--     postgres/service_role doc duoc). Nguoi quan tri dat ma bang SQL tren dashboard; xoa dong do la tat tinh nang.
--  3. Chi co tac dung voi tai khoan co email ket thuc bang @demo.vn; nguoi dung that nhap ma van bi tu choi.
--  4. Sai ma tra cung loi nhu thieu OTP (42501), khong tiet lo ma co ton tai hay khong.
-- Chua dat ma o day: migration KHONG chua ma nao. Khi chua co dong cau hinh, tinh nang tat.

CREATE TABLE IF NOT EXISTS public."CAU_HINH_DEMO" (
  "Khoa" TEXT PRIMARY KEY,
  "GiaTri" TEXT NOT NULL,
  "NgayCapNhat" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public."CAU_HINH_DEMO" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."CAU_HINH_DEMO" FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public."CAU_HINH_DEMO" IS
  'Cau hinh demo chi doc boi ham SECURITY DEFINER. Khoa MA_DEMO_BO_QUA_OTP = sha256 hex cua ma demo thay the OTP cho tai khoan @demo.vn.';

-- Doi chu ky ham: them tham so ma demo (mac dinh NULL de loi goi hai tham so van chay).
DROP FUNCTION IF EXISTS public.xac_nhan_thanh_toan(UUID, UUID);

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

  IF v_otp_required AND NOT public.da_xac_minh_otp() THEN
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

REVOKE ALL ON FUNCTION public.xac_nhan_thanh_toan(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xac_nhan_thanh_toan(UUID, UUID, TEXT) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.xac_nhan_thanh_toan(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon khong duoc goi xac_nhan_thanh_toan';
  END IF;
  IF has_table_privilege('authenticated', 'public."CAU_HINH_DEMO"', 'SELECT')
     OR has_table_privilege('anon', 'public."CAU_HINH_DEMO"', 'SELECT') THEN
    RAISE EXCEPTION 'CAU_HINH_DEMO khong duoc doc boi authenticated hoac anon';
  END IF;
  IF EXISTS (SELECT 1 FROM public."CAU_HINH_DEMO") THEN
    RAISE EXCEPTION 'Migration khong duoc chua ma demo';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
