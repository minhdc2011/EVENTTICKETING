-- User vs Organizer Account Boundary (simplified additive migration)
-- Enforces server-authoritative account kinds ('USER', 'ORGANIZER', 'ADMIN')
-- Protects against buyer self-promotion and role disclosure.
-- Gates existing organizer RPCs and RLS by redefining permission helpers and onboarding.
-- Requires 20261006190000_organizer_event_creation_slice.sql.

-- 1. Additive column on HO_SO_NGUOI_DUNG
ALTER TABLE public."HO_SO_NGUOI_DUNG"
  ADD COLUMN IF NOT EXISTS "LoaiTaiKhoan" VARCHAR(30) NOT NULL DEFAULT 'USER';

ALTER TABLE public."HO_SO_NGUOI_DUNG" DROP CONSTRAINT IF EXISTS "chk_loai_tai_khoan";
ALTER TABLE public."HO_SO_NGUOI_DUNG" ADD CONSTRAINT "chk_loai_tai_khoan"
  CHECK ("LoaiTaiKhoan" IN ('USER', 'ORGANIZER', 'ADMIN'));

CREATE INDEX IF NOT EXISTS "idx_hosonguoidung_loaitaikhoan"
  ON public."HO_SO_NGUOI_DUNG" ("LoaiTaiKhoan");

-- 2. Safe migration / backfill strategy:
-- Backfill all auth.users into HO_SO_NGUOI_DUNG if missing (default 'USER')
INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', u.email), 'USER'
FROM auth.users u
ON CONFLICT ("NguoiDungID") DO NOTHING;

-- Backfill all existing known organization members to 'ORGANIZER'
UPDATE public."HO_SO_NGUOI_DUNG"
SET "LoaiTaiKhoan" = 'ORGANIZER',
    "NgayCapNhat" = NOW()
WHERE "NguoiDungID" IN (
  SELECT DISTINCT "NguoiDungID" FROM public."THANH_VIEN_TO_CHUC"
);

-- Ensure any existing organization members without a profile row get created as 'ORGANIZER'
INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
SELECT DISTINCT tv."NguoiDungID", 'Ban tổ chức', 'ORGANIZER'
FROM public."THANH_VIEN_TO_CHUC" tv
ON CONFLICT ("NguoiDungID") DO UPDATE
SET "LoaiTaiKhoan" = 'ORGANIZER',
    "NgayCapNhat" = NOW();

-- 3. Prevent client-side self-promotion on HO_SO_NGUOI_DUNG
CREATE OR REPLACE FUNCTION public.kiem_tra_khong_tu_nang_cap_loai_tai_khoan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW."LoaiTaiKhoan" IS DISTINCT FROM OLD."LoaiTaiKhoan" THEN
    -- If executed in an authenticated user session (client JWT), block any attempt to modify LoaiTaiKhoan
    IF auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
      RAISE EXCEPTION 'Khong co quyen tu y thay doi loai tai khoan' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kiem_tra_khong_tu_nang_cap_loai_tai_khoan() FROM PUBLIC;

DROP TRIGGER IF EXISTS "trg_kiem_tra_khong_tu_nang_cap" ON public."HO_SO_NGUOI_DUNG";
CREATE TRIGGER "trg_kiem_tra_khong_tu_nang_cap"
BEFORE UPDATE OF "LoaiTaiKhoan" ON public."HO_SO_NGUOI_DUNG"
FOR EACH ROW EXECUTE FUNCTION public.kiem_tra_khong_tu_nang_cap_loai_tai_khoan();

-- 4. Secure profile creation on auth signup: always initialize as 'USER', ignore raw_user_meta_data for role
CREATE OR REPLACE FUNCTION public.tao_ho_so_nguoi_dung_moi()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'USER'
  )
  ON CONFLICT ("NguoiDungID") DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5. Authoritative account kind helpers with anti-disclosure controls
-- Authenticated callers can only inspect their own account kind; probing others is denied
DROP FUNCTION IF EXISTS public.lay_loai_tai_khoan(UUID);
CREATE OR REPLACE FUNCTION public.lay_loai_tai_khoan(p_user_id UUID)
RETURNS VARCHAR LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target_id UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  IF auth.role() = 'authenticated' AND auth.uid() IS NOT NULL AND v_target_id <> auth.uid() THEN
    RAISE EXCEPTION 'Khong co quyen xem loai tai khoan cua nguoi dung khac' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(
    (SELECT hs."LoaiTaiKhoan" FROM public."HO_SO_NGUOI_DUNG" hs WHERE hs."NguoiDungID" = v_target_id),
    'USER'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.lay_loai_tai_khoan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lay_loai_tai_khoan(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.lay_loai_tai_khoan()
RETURNS VARCHAR LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.lay_loai_tai_khoan(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.lay_loai_tai_khoan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lay_loai_tai_khoan() TO authenticated;

DROP FUNCTION IF EXISTS public.la_ban_to_chuc(UUID);
CREATE OR REPLACE FUNCTION public.la_ban_to_chuc(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target_id UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  IF auth.role() = 'authenticated' AND auth.uid() IS NOT NULL AND v_target_id <> auth.uid() THEN
    RAISE EXCEPTION 'Khong co quyen kiem tra phan quyen cua nguoi dung khac' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public."HO_SO_NGUOI_DUNG" hs
    WHERE hs."NguoiDungID" = v_target_id
      AND hs."LoaiTaiKhoan" IN ('ORGANIZER', 'ADMIN')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.la_ban_to_chuc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.la_ban_to_chuc(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.la_ban_to_chuc()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.la_ban_to_chuc(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.la_ban_to_chuc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.la_ban_to_chuc() TO authenticated;

-- Admin/UAT account classification function: callable only by service_role or admin SQL
CREATE OR REPLACE FUNCTION public.gan_loai_tai_khoan(p_email TEXT, p_loai TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_normalized_role TEXT := UPPER(TRIM(p_loai));
BEGIN
  IF v_normalized_role NOT IN ('USER', 'ORGANIZER', 'ADMIN') THEN
    RAISE EXCEPTION 'Loai tai khoan khong hop le' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email));
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Khong tim thay nguoi dung voi email da cho' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
  VALUES (v_user_id, COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_user_id), p_email), v_normalized_role)
  ON CONFLICT ("NguoiDungID") DO UPDATE
  SET "LoaiTaiKhoan" = v_normalized_role, "NgayCapNhat" = NOW();

  RETURN jsonb_build_object('userId', v_user_id, 'email', LOWER(TRIM(p_email)), 'accountKind', v_normalized_role);
END;
$$;
REVOKE ALL ON FUNCTION public.gan_loai_tai_khoan(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gan_loai_tai_khoan(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gan_loai_tai_khoan(TEXT, TEXT) TO service_role;

-- 6. Gate organizer membership and editor helpers with account kind
-- Existing tao_ban_nhap_su_kien, luu_su_kien_toan_dien, cong_bo_su_kien, and direct-table RLS
-- policies all call co_quyen_bien_tap_to_chuc and la_thanh_vien_to_chuc, so updating them here
-- secures all downstream mutation and read access without duplicate function definitions.
CREATE OR REPLACE FUNCTION public.la_thanh_vien_to_chuc(p_to_chuc_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."THANH_VIEN_TO_CHUC" tv
    JOIN public."HO_SO_NGUOI_DUNG" hs ON hs."NguoiDungID" = tv."NguoiDungID"
    WHERE tv."ToChucID" = p_to_chuc_id
      AND tv."NguoiDungID" = auth.uid()
      AND hs."LoaiTaiKhoan" IN ('ORGANIZER', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION public.la_thanh_vien_to_chuc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.la_thanh_vien_to_chuc(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.co_quyen_bien_tap_to_chuc(p_to_chuc_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."THANH_VIEN_TO_CHUC" tv
    JOIN public."HO_SO_NGUOI_DUNG" hs ON hs."NguoiDungID" = tv."NguoiDungID"
    WHERE tv."ToChucID" = p_to_chuc_id
      AND tv."NguoiDungID" = auth.uid()
      AND hs."LoaiTaiKhoan" IN ('ORGANIZER', 'ADMIN')
      AND tv."VaiTro" IN ('CHU_SO_HUU', 'QUAN_TRI', 'BIEN_TAP')
  );
$$;
REVOKE ALL ON FUNCTION public.co_quyen_bien_tap_to_chuc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.co_quyen_bien_tap_to_chuc(UUID) TO authenticated;

-- 7. Hardened organizer onboarding RPC: redefined because onboarding has no prior membership
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

  -- CRITICAL TENANT / ROLE BOUNDARY: Caller must be an ORGANIZER or ADMIN
  IF NOT public.la_ban_to_chuc(v_user_id) THEN
    RAISE EXCEPTION 'Chi tai khoan Ban to chuc moi co the tao to chuc' USING ERRCODE = '42501';
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
