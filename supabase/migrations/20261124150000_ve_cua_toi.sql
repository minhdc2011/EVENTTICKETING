-- Trang "Tai khoan cua toi": danh sach ve da mua (giu cho da xac nhan thanh toan) cua nguoi dung dang dang nhap.
-- Chi doc. GIU_CHO va CHI_TIET_GIU_CHO van bi khoa RLS, nen dung ham SECURITY DEFINER chi tra ve ve cua auth.uid().

CREATE OR REPLACE FUNCTION public.ve_cua_toi()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Can dang nhap de xem ve da mua' USING ERRCODE = '28000';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(t.ve ORDER BY t.mua_luc DESC, t.ct_id)
    FROM (
      SELECT
        gc."NgayCapNhat" AS mua_luc,
        ct."ID" AS ct_id,
        jsonb_build_object(
          'veId', ct."ID",
          'holdId', gc."GiuChoID",
          'maVe', ct."MaVe",
          'soLuong', ct."SoLuong",
          'muaLuc', gc."NgayCapNhat",
          'donGia', COALESCE(ct."DonGiaChot", kv."GiaVeNiemYet"),
          'suKienSlug', sk."Slug",
          'tenSuKien', sk."TenSuKien",
          'posterUrl', sk."PosterURL",
          'diaDiem', sk."DiaDiem",
          'tenSanVanDong', sk."TenSanVanDong",
          'suatSlug', sd."Slug",
          'tenSuat', sd."TenSuatDien",
          'batDauLuc', sd."ThoiGianBatDau",
          'maKhuVuc', kv."MaKhuVuc",
          'tenKhuVuc', kv."TenKhuVuc",
          'loaiKhuVuc', kv."LoaiKhuVuc",
          'soHang', g."SoHang",
          'soGhe', g."SoGhe"
        ) AS ve
      FROM public."GIU_CHO" gc
      JOIN public."CHI_TIET_GIU_CHO" ct ON ct."GiuChoID" = gc."GiuChoID"
      JOIN public."KHU_VUC" kv ON kv."KhuVucID" = ct."KhuVucID"
      JOIN public."SU_KIEN" sk ON sk."SuKienID" = gc."SuKienID"
      JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = gc."SuatDienID"
      LEFT JOIN public."GHE" g ON g."GheID" = ct."GheID"
      WHERE gc."NguoiDungID" = v_user_id
        AND gc."TrangThai" = 'CONVERTED'
    ) t
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.ve_cua_toi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ve_cua_toi() TO authenticated;

NOTIFY pgrst, 'reload schema';
