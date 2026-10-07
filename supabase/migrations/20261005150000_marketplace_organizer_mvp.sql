-- Marketplace + Organizer MVP. Requires 20261005090000_product_foundation.sql.

ALTER TABLE public."SU_KIEN"
  ADD COLUMN IF NOT EXISTS "TemplateKey" VARCHAR(40) NOT NULL DEFAULT 'DEFAULT',
  ADD COLUMN IF NOT EXISTS "TheLoai" VARCHAR(40) NOT NULL DEFAULT 'KHAC';

ALTER TABLE public."SU_KIEN" DROP CONSTRAINT IF EXISTS "chk_sukien_template";
ALTER TABLE public."SU_KIEN" ADD CONSTRAINT "chk_sukien_template"
  CHECK ("TemplateKey" IN ('DEFAULT', 'SUPER_CONCERT_2026'));
ALTER TABLE public."SU_KIEN" DROP CONSTRAINT IF EXISTS "chk_sukien_theloai";
ALTER TABLE public."SU_KIEN" ADD CONSTRAINT "chk_sukien_theloai"
  CHECK ("TheLoai" IN ('AM_NHAC', 'SAN_KHAU', 'THE_THAO', 'HOI_THAO', 'WORKSHOP', 'THAM_QUAN', 'KHAC'));

UPDATE public."SU_KIEN"
SET "TemplateKey" = 'SUPER_CONCERT_2026', "TheLoai" = 'AM_NHAC'
WHERE "SuKienID" = 1;

CREATE INDEX IF NOT EXISTS "idx_sukien_public_catalog"
  ON public."SU_KIEN" ("TrangThaiCongBo", "TheLoai", "ThoiGianBatDau");

CREATE OR REPLACE FUNCTION public.co_quyen_bien_tap_to_chuc(p_to_chuc_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."THANH_VIEN_TO_CHUC" tv
    WHERE tv."ToChucID" = p_to_chuc_id
      AND tv."NguoiDungID" = auth.uid()
      AND tv."VaiTro" IN ('CHU_SO_HUU', 'QUAN_TRI', 'BIEN_TAP')
  );
$$;
REVOKE ALL ON FUNCTION public.co_quyen_bien_tap_to_chuc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.co_quyen_bien_tap_to_chuc(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.tao_to_chuc_cua_toi(p_ten_to_chuc TEXT, p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_slug TEXT := LOWER(TRIM(p_slug));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Can dang nhap de tao to chuc' USING ERRCODE = '42501';
  END IF;
  IF LENGTH(TRIM(COALESCE(p_ten_to_chuc, ''))) < 3 OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Ten hoac slug to chuc khong hop le' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public."TO_CHUC" ("TenToChuc", "Slug")
  VALUES (TRIM(p_ten_to_chuc), v_slug)
  RETURNING "ToChucID" INTO v_org_id;
  INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
  VALUES (v_org_id, v_user_id, 'CHU_SO_HUU');
  RETURN jsonb_build_object('organizationId', v_org_id, 'name', TRIM(p_ten_to_chuc), 'slug', v_slug, 'role', 'CHU_SO_HUU');
END;
$$;
REVOKE ALL ON FUNCTION public.tao_to_chuc_cua_toi(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tao_to_chuc_cua_toi(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.tao_ban_nhap_su_kien(
  p_to_chuc_id UUID,
  p_ten_su_kien TEXT,
  p_slug TEXT,
  p_mo_ta TEXT,
  p_the_loai TEXT,
  p_ten_dia_diem TEXT,
  p_dia_chi TEXT,
  p_bat_dau TIMESTAMPTZ,
  p_ket_thuc TIMESTAMPTZ,
  p_mo_ban TIMESTAMPTZ,
  p_dong_ban TIMESTAMPTZ,
  p_gia_ve NUMERIC,
  p_suc_chua INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id INT;
  v_show_id BIGINT;
  v_slug TEXT := LOWER(TRIM(p_slug));
  v_category TEXT := UPPER(TRIM(COALESCE(p_the_loai, 'KHAC')));
BEGIN
  IF NOT public.co_quyen_bien_tap_to_chuc(p_to_chuc_id) THEN
    RAISE EXCEPTION 'Khong co quyen tao su kien cho to chuc nay' USING ERRCODE = '42501';
  END IF;
  IF LENGTH(TRIM(COALESCE(p_ten_su_kien, ''))) < 5 OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Ten hoac slug su kien khong hop le' USING ERRCODE = '22023';
  END IF;
  IF v_category NOT IN ('AM_NHAC', 'SAN_KHAU', 'THE_THAO', 'HOI_THAO', 'WORKSHOP', 'THAM_QUAN', 'KHAC') THEN
    RAISE EXCEPTION 'The loai khong hop le' USING ERRCODE = '22023';
  END IF;
  IF p_ket_thuc <= p_bat_dau OR p_mo_ban >= p_bat_dau OR p_dong_ban <= p_mo_ban OR p_dong_ban > p_bat_dau THEN
    RAISE EXCEPTION 'Moc thoi gian khong hop le' USING ERRCODE = '22023';
  END IF;
  IF p_gia_ve < 0 OR p_suc_chua < 1 THEN
    RAISE EXCEPTION 'Gia ve hoac suc chua khong hop le' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public."SU_KIEN" (
    "TenSuKien", "Slug", "ToChucID", "Slogan", "MoTaChiTiet", "TheLoai", "TemplateKey",
    "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
    "DiaDiem", "TenSanVanDong", "SucChua", "TrangThaiMoBan", "TrangThaiCongBo"
  ) VALUES (
    TRIM(p_ten_su_kien), v_slug, p_to_chuc_id, UPPER(v_category), NULLIF(TRIM(p_mo_ta), ''), v_category, 'DEFAULT',
    p_bat_dau, p_ket_thuc, p_mo_ban, p_dong_ban,
    TRIM(p_dia_chi), TRIM(p_ten_dia_diem), p_suc_chua, 'SAP_MO_BAN', 'BAN_NHAP'
  ) RETURNING "SuKienID" INTO v_event_id;

  INSERT INTO public."SUAT_DIEN" (
    "SuKienID", "Slug", "TenSuatDien", "MuiGio", "ThoiGianBatDau", "ThoiGianKetThuc",
    "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
  ) VALUES (
    v_event_id, 'suat-1', 'Suất diễn 1', 'Asia/Ho_Chi_Minh', p_bat_dau, p_ket_thuc,
    p_mo_ban, p_dong_ban, 'BAN_NHAP'
  ) RETURNING "SuatDienID" INTO v_show_id;

  INSERT INTO public."KHU_VUC" (
    "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc",
    "GiaVeNiemYet", "MauSacHex", "MoTaQuyenLoi", "TongSoGhe"
  ) VALUES (
    v_event_id, v_show_id, 'GENERAL_ADMISSION', 'Vé tiêu chuẩn', 'DUNG_STAND',
    p_gia_ve, '#84CC16', 'Quyền vào cửa theo suất diễn đã chọn.', p_suc_chua
  );

  RETURN jsonb_build_object('eventId', v_event_id, 'eventSlug', v_slug, 'showId', v_show_id, 'showSlug', 'suat-1');
END;
$$;
REVOKE ALL ON FUNCTION public.tao_ban_nhap_su_kien(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tao_ban_nhap_su_kien(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, INT) TO authenticated;

-- Re-define publish so all draft shows become visible atomically after validation.
-- Validates authorized editor role, at least one valid show, valid sale dates, and at least one sellable zone.
CREATE OR REPLACE FUNCTION public.cong_bo_su_kien(p_su_kien_id INT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  SELECT "ToChucID" INTO v_org FROM public."SU_KIEN" WHERE "SuKienID" = p_su_kien_id FOR UPDATE;
  IF NOT FOUND OR NOT public.co_quyen_bien_tap_to_chuc(v_org) THEN
    RAISE EXCEPTION 'Khong co quyen cong bo su kien' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."SUAT_DIEN" WHERE "SuKienID" = p_su_kien_id)
     OR EXISTS (
       SELECT 1 FROM public."SUAT_DIEN" sd
       WHERE sd."SuKienID" = p_su_kien_id AND (
         sd."ThoiGianKetThuc" <= sd."ThoiGianBatDau"
         OR sd."ThoiGianMoBanVe" >= sd."ThoiGianBatDau"
         OR (sd."ThoiGianDongBanVe" IS NOT NULL AND (sd."ThoiGianDongBanVe" <= sd."ThoiGianMoBanVe" OR sd."ThoiGianDongBanVe" > sd."ThoiGianBatDau"))
         OR NOT EXISTS (
           SELECT 1 FROM public."KHU_VUC" kv
           WHERE kv."SuatDienID" = sd."SuatDienID"
             AND kv."TongSoGhe" > 0
             AND kv."GiaVeNiemYet" >= 0
         )
       )
     ) THEN
    RAISE EXCEPTION 'Su kien chua co suat dien va phan khu hop le' USING ERRCODE = '23514';
  END IF;
  UPDATE public."SUAT_DIEN" SET "TrangThai" = 'SAP_MO_BAN', "NgayCapNhat" = NOW()
  WHERE "SuKienID" = p_su_kien_id AND "TrangThai" = 'BAN_NHAP';
  UPDATE public."SU_KIEN" SET "TrangThaiCongBo" = 'CONG_KHAI', "NgayCapNhat" = NOW()
  WHERE "SuKienID" = p_su_kien_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.cong_bo_su_kien(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cong_bo_su_kien(INT) TO authenticated;

-- Prevent direct client-write bypass of publication rules:
-- Direct INSERT or UPDATE setting TrangThaiCongBo = 'CONG_KHAI' must pass the same checks.
CREATE OR REPLACE FUNCTION public.kiem_tra_trang_thai_cong_bo_su_kien()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW."TrangThaiCongBo" = 'CONG_KHAI' AND (TG_OP = 'INSERT' OR OLD."TrangThaiCongBo" <> 'CONG_KHAI') THEN
    IF NOT public.co_quyen_bien_tap_to_chuc(NEW."ToChucID") THEN
      RAISE EXCEPTION 'Khong co quyen cong bo su kien' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."SUAT_DIEN" WHERE "SuKienID" = NEW."SuKienID")
       OR EXISTS (
         SELECT 1 FROM public."SUAT_DIEN" sd
         WHERE sd."SuKienID" = NEW."SuKienID" AND (
           sd."TrangThai" = 'BAN_NHAP'
           OR sd."ThoiGianKetThuc" <= sd."ThoiGianBatDau"
           OR sd."ThoiGianMoBanVe" >= sd."ThoiGianBatDau"
           OR (sd."ThoiGianDongBanVe" IS NOT NULL AND (sd."ThoiGianDongBanVe" <= sd."ThoiGianMoBanVe" OR sd."ThoiGianDongBanVe" > sd."ThoiGianBatDau"))
           OR NOT EXISTS (
             SELECT 1 FROM public."KHU_VUC" kv
             WHERE kv."SuatDienID" = sd."SuatDienID"
               AND kv."TongSoGhe" > 0
               AND kv."GiaVeNiemYet" >= 0
           )
         )
       ) THEN
      RAISE EXCEPTION 'Su kien chua co suat dien va phan khu hop le' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kiem_tra_trang_thai_cong_bo_su_kien() FROM PUBLIC;

DROP TRIGGER IF EXISTS "trg_kiem_tra_cong_bo_su_kien" ON public."SU_KIEN";
CREATE TRIGGER "trg_kiem_tra_cong_bo_su_kien"
BEFORE INSERT OR UPDATE OF "TrangThaiCongBo" ON public."SU_KIEN"
FOR EACH ROW EXECUTE FUNCTION public.kiem_tra_trang_thai_cong_bo_su_kien();

-- Role validation and privilege separation:
-- Any member can view org data in the workspace, but only authorized editors (CHU_SO_HUU, QUAN_TRI, BIEN_TAP)
-- can insert, update, or delete.
DROP POLICY IF EXISTS "Members manage their events" ON public."SU_KIEN";
DROP POLICY IF EXISTS "Members read their events" ON public."SU_KIEN";
DROP POLICY IF EXISTS "Editors manage their events" ON public."SU_KIEN";
CREATE POLICY "Members read their events" ON public."SU_KIEN"
FOR SELECT TO authenticated
USING (public.la_thanh_vien_to_chuc("ToChucID"));
CREATE POLICY "Editors manage their events" ON public."SU_KIEN"
FOR ALL TO authenticated
USING (public.co_quyen_bien_tap_to_chuc("ToChucID"))
WITH CHECK (public.co_quyen_bien_tap_to_chuc("ToChucID"));

DROP POLICY IF EXISTS "Members manage their shows" ON public."SUAT_DIEN";
DROP POLICY IF EXISTS "Members read their shows" ON public."SUAT_DIEN";
DROP POLICY IF EXISTS "Editors manage their shows" ON public."SUAT_DIEN";
CREATE POLICY "Members read their shows" ON public."SUAT_DIEN"
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."SU_KIEN" sk
  WHERE sk."SuKienID" = "SUAT_DIEN"."SuKienID"
    AND public.la_thanh_vien_to_chuc(sk."ToChucID")
));
CREATE POLICY "Editors manage their shows" ON public."SUAT_DIEN"
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."SU_KIEN" sk
  WHERE sk."SuKienID" = "SUAT_DIEN"."SuKienID"
    AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public."SU_KIEN" sk
  WHERE sk."SuKienID" = "SUAT_DIEN"."SuKienID"
    AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
));

DROP POLICY IF EXISTS "Members manage show zones" ON public."KHU_VUC";
DROP POLICY IF EXISTS "Members read show zones" ON public."KHU_VUC";
DROP POLICY IF EXISTS "Editors manage show zones" ON public."KHU_VUC";
CREATE POLICY "Members read show zones" ON public."KHU_VUC"
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."SUAT_DIEN" sd JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
  WHERE sd."SuatDienID" = "KHU_VUC"."SuatDienID" AND public.la_thanh_vien_to_chuc(sk."ToChucID")
));
CREATE POLICY "Editors manage show zones" ON public."KHU_VUC"
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."SUAT_DIEN" sd JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
  WHERE sd."SuatDienID" = "KHU_VUC"."SuatDienID" AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public."SUAT_DIEN" sd JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
  WHERE sd."SuatDienID" = "KHU_VUC"."SuatDienID" AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
));

DROP POLICY IF EXISTS "Members manage show seats" ON public."GHE";
DROP POLICY IF EXISTS "Members read show seats" ON public."GHE";
DROP POLICY IF EXISTS "Editors manage show seats" ON public."GHE";
CREATE POLICY "Members read show seats" ON public."GHE"
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."KHU_VUC" kv
  JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = kv."SuatDienID"
  JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
  WHERE kv."KhuVucID" = "GHE"."KhuVucID" AND public.la_thanh_vien_to_chuc(sk."ToChucID")
));
CREATE POLICY "Editors manage show seats" ON public."GHE"
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."KHU_VUC" kv
  JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = kv."SuatDienID"
  JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
  WHERE kv."KhuVucID" = "GHE"."KhuVucID" AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public."KHU_VUC" kv
  JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = kv."SuatDienID"
  JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
  WHERE kv."KhuVucID" = "GHE"."KhuVucID" AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
));

DROP POLICY IF EXISTS "Members manage their venues" ON public."DIA_DIEM";
DROP POLICY IF EXISTS "Members read their venues" ON public."DIA_DIEM";
DROP POLICY IF EXISTS "Editors manage their venues" ON public."DIA_DIEM";
CREATE POLICY "Members read their venues" ON public."DIA_DIEM"
FOR SELECT TO authenticated
USING ("ToChucID" IS NOT NULL AND public.la_thanh_vien_to_chuc("ToChucID"));
CREATE POLICY "Editors manage their venues" ON public."DIA_DIEM"
FOR ALL TO authenticated
USING ("ToChucID" IS NOT NULL AND public.co_quyen_bien_tap_to_chuc("ToChucID"))
WITH CHECK ("ToChucID" IS NOT NULL AND public.co_quyen_bien_tap_to_chuc("ToChucID"));

DROP POLICY IF EXISTS "Members manage their map versions" ON public."PHIEN_BAN_SO_DO";
DROP POLICY IF EXISTS "Members read their map versions" ON public."PHIEN_BAN_SO_DO";
DROP POLICY IF EXISTS "Editors manage their map versions" ON public."PHIEN_BAN_SO_DO";
CREATE POLICY "Members read their map versions" ON public."PHIEN_BAN_SO_DO"
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."DIA_DIEM" dd
  WHERE dd."DiaDiemID" = "PHIEN_BAN_SO_DO"."DiaDiemID"
    AND dd."ToChucID" IS NOT NULL AND public.la_thanh_vien_to_chuc(dd."ToChucID")
));
CREATE POLICY "Editors manage their map versions" ON public."PHIEN_BAN_SO_DO"
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public."DIA_DIEM" dd
  WHERE dd."DiaDiemID" = "PHIEN_BAN_SO_DO"."DiaDiemID"
    AND dd."ToChucID" IS NOT NULL AND public.co_quyen_bien_tap_to_chuc(dd."ToChucID")
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public."DIA_DIEM" dd
  WHERE dd."DiaDiemID" = "PHIEN_BAN_SO_DO"."DiaDiemID"
    AND dd."ToChucID" IS NOT NULL AND public.co_quyen_bien_tap_to_chuc(dd."ToChucID")
));

