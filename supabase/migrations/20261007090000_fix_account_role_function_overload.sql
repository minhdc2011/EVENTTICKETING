-- Fix ambiguous helper overloads introduced by optional UUID arguments.
-- Both helpers intentionally expose a zero-argument wrapper and a UUID variant.
-- The UUID variant therefore must not have a default value.

BEGIN;

-- PostgreSQL cannot remove a parameter default with CREATE OR REPLACE.
-- Drop only the exact UUID overload, then recreate it immediately below.
DROP FUNCTION IF EXISTS public.lay_loai_tai_khoan(UUID);

CREATE OR REPLACE FUNCTION public.lay_loai_tai_khoan(p_user_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  IF auth.role() = 'authenticated'
     AND auth.uid() IS NOT NULL
     AND v_target_id <> auth.uid() THEN
    RAISE EXCEPTION 'Khong co quyen xem loai tai khoan cua nguoi dung khac'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT hs."LoaiTaiKhoan"
      FROM public."HO_SO_NGUOI_DUNG" hs
      WHERE hs."NguoiDungID" = v_target_id
    ),
    'USER'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lay_loai_tai_khoan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lay_loai_tai_khoan(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.lay_loai_tai_khoan()
RETURNS VARCHAR
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.lay_loai_tai_khoan(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.lay_loai_tai_khoan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lay_loai_tai_khoan() TO authenticated;

DROP FUNCTION IF EXISTS public.la_ban_to_chuc(UUID);

CREATE OR REPLACE FUNCTION public.la_ban_to_chuc(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  IF auth.role() = 'authenticated'
     AND auth.uid() IS NOT NULL
     AND v_target_id <> auth.uid() THEN
    RAISE EXCEPTION 'Khong co quyen kiem tra phan quyen cua nguoi dung khac'
      USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public."HO_SO_NGUOI_DUNG" hs
    WHERE hs."NguoiDungID" = v_target_id
      AND hs."LoaiTaiKhoan" IN ('ORGANIZER', 'ADMIN')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.la_ban_to_chuc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.la_ban_to_chuc(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.la_ban_to_chuc()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.la_ban_to_chuc(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.la_ban_to_chuc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.la_ban_to_chuc() TO authenticated;

-- Fail the migration if a future edit accidentally restores optional arguments.
DO $$
DECLARE
  v_account_kind_defaults INTEGER;
  v_organizer_defaults INTEGER;
BEGIN
  SELECT p.pronargdefaults
  INTO v_account_kind_defaults
  FROM pg_proc p
  WHERE p.oid = 'public.lay_loai_tai_khoan(uuid)'::regprocedure;

  SELECT p.pronargdefaults
  INTO v_organizer_defaults
  FROM pg_proc p
  WHERE p.oid = 'public.la_ban_to_chuc(uuid)'::regprocedure;

  IF v_account_kind_defaults <> 0 OR v_organizer_defaults <> 0 THEN
    RAISE EXCEPTION 'Account-role helper overloads must not define default arguments';
  END IF;

  PERFORM 'public.lay_loai_tai_khoan()'::regprocedure;
  PERFORM 'public.la_ban_to_chuc()'::regprocedure;
END;
$$;

COMMIT;
