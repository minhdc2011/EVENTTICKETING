-- BTC "xoa" su kien = XOA MEM (luu tru): TrangThaiCongBo = 'DA_AN'.
--
-- Khong xoa cung vi: nhat ky gia/de xuat gia la bat bien (trigger chan xoa) va khoa ngoai RESTRICT, ve da ban can giu de doi chieu.
-- Su kien DA_AN khong con hien o trang cong khai (chinh sach doc chi cho CONG_KHAI) va giao dien BTC loc bo.
--
-- Quy tac:
--   - Chi CHU_SO_HUU hoac QUAN_TRI cua to chuc (tai khoan ORGANIZER hoac ADMIN) duoc xoa.
--   - Duoc xoa khi: la BAN_NHAP, hoac DA KET THUC (su kien va moi suat da qua thoi gian ket thuc).
--   - Su kien dang ban (chua ket thuc) khong xoa duoc: SU_KIEN_CHUA_KET_THUC (P0001).
--   - Con giu cho dang hieu luc thi khong xoa: SU_KIEN_DANG_CO_GIU_CHO (P0001).
--   - Goi lai tren su kien da an thi thanh cong (idempotent).
-- Khong co tac vu tu dong xoa theo thoi han (xem ghi chu trong tai lieu): chi xoa khi BTC chu dong.

CREATE OR REPLACE FUNCTION public.xoa_su_kien(p_su_kien_id INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_event public."SU_KIEN"%ROWTYPE;
  v_da_ket_thuc BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Can dang nhap de xoa su kien' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_event FROM public."SU_KIEN" WHERE "SuKienID" = p_su_kien_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Khong co quyen xoa su kien' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."THANH_VIEN_TO_CHUC" tv
    JOIN public."HO_SO_NGUOI_DUNG" hs ON hs."NguoiDungID" = tv."NguoiDungID"
    WHERE tv."ToChucID" = v_event."ToChucID"
      AND tv."NguoiDungID" = v_user_id
      AND hs."LoaiTaiKhoan" IN ('ORGANIZER', 'ADMIN')
      AND tv."VaiTro" IN ('CHU_SO_HUU', 'QUAN_TRI')
  ) THEN
    RAISE EXCEPTION 'Khong co quyen xoa su kien' USING ERRCODE = '42501';
  END IF;

  IF v_event."TrangThaiCongBo" = 'DA_AN' THEN
    RETURN jsonb_build_object('suKienId', p_su_kien_id, 'trangThai', 'DA_AN', 'daXoaTruoc', TRUE);
  END IF;

  IF v_event."TrangThaiCongBo" <> 'BAN_NHAP' THEN
    v_da_ket_thuc := v_event."ThoiGianKetThuc" IS NOT NULL AND v_event."ThoiGianKetThuc" < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM public."SUAT_DIEN" sd
        WHERE sd."SuKienID" = p_su_kien_id AND sd."ThoiGianKetThuc" >= NOW()
      );
    IF NOT COALESCE(v_da_ket_thuc, FALSE) THEN
      RAISE EXCEPTION 'SU_KIEN_CHUA_KET_THUC' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public."GIU_CHO" gc
      WHERE gc."SuKienID" = p_su_kien_id AND gc."TrangThai" = 'ACTIVE' AND gc."HetHanLuc" > NOW()
    ) THEN
      RAISE EXCEPTION 'SU_KIEN_DANG_CO_GIU_CHO' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public."SU_KIEN"
  SET "TrangThaiCongBo" = 'DA_AN', "NgayCapNhat" = NOW()
  WHERE "SuKienID" = p_su_kien_id;

  RETURN jsonb_build_object('suKienId', p_su_kien_id, 'trangThai', 'DA_AN');
END;
$$;

REVOKE ALL ON FUNCTION public.xoa_su_kien(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xoa_su_kien(INT) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.xoa_su_kien(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon khong duoc goi xoa_su_kien';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
