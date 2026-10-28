-- Sprint 1 security hardening: make administrative and organizer RPC ACLs explicit.
-- This migration is idempotent and is intended to repair environments where SQL
-- was applied manually and explicit grants to anon survived a PUBLIC revoke.

BEGIN;

CREATE OR REPLACE FUNCTION public.gan_loai_tai_khoan(p_email TEXT, p_loai TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_normalized_role TEXT := UPPER(TRIM(p_loai));
BEGIN
  -- Defense in depth: ACL drift must never make this administrative RPC usable
  -- from either public client role.
  IF auth.role() IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Ham chi danh rieng cho he thong quan tri backend'
      USING ERRCODE = '42501';
  END IF;

  IF v_normalized_role NOT IN ('USER', 'ORGANIZER', 'ADMIN') THEN
    RAISE EXCEPTION 'Loai tai khoan khong hop le' USING ERRCODE = '22023';
  END IF;

  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(TRIM(p_email));

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Khong tim thay nguoi dung voi email da cho'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
  VALUES (
    v_user_id,
    COALESCE(
      (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_user_id),
      p_email
    ),
    v_normalized_role
  )
  ON CONFLICT ("NguoiDungID") DO UPDATE
  SET "LoaiTaiKhoan" = v_normalized_role,
      "NgayCapNhat" = NOW();

  RETURN jsonb_build_object(
    'userId', v_user_id,
    'email', LOWER(TRIM(p_email)),
    'accountKind', v_normalized_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gan_loai_tai_khoan(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gan_loai_tai_khoan(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.luu_su_kien_toan_dien(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luu_su_kien_toan_dien(JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cong_bo_su_kien(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cong_bo_su_kien(INT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.tao_ban_nhap_su_kien(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, INT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tao_ban_nhap_su_kien(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, INT
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.tao_to_chuc_cua_toi(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tao_to_chuc_cua_toi(TEXT, TEXT) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.gan_loai_tai_khoan(text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: anon still holds EXECUTE on gan_loai_tai_khoan';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.gan_loai_tai_khoan(text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: authenticated still holds EXECUTE on gan_loai_tai_khoan';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.luu_su_kien_toan_dien(jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: anon still holds EXECUTE on luu_su_kien_toan_dien';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.cong_bo_su_kien(integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: anon still holds EXECUTE on cong_bo_su_kien';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.tao_ban_nhap_su_kien(uuid,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,numeric,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: anon still holds EXECUTE on tao_ban_nhap_su_kien';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.tao_to_chuc_cua_toi(text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: anon still holds EXECUTE on tao_to_chuc_cua_toi';
  END IF;
END;
$$;

COMMIT;

-- Dashboard/manual application does not automatically refresh PostgREST's schema cache.
NOTIFY pgrst, 'reload schema';
