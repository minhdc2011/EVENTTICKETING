-- Dong bo 3 ham tai khoan/to chuc voi dinh nghia hien hanh cua repo (23/11/2026).
--
-- Boi canh: khi chuan bi nang cap Supabase staging (qxkgkbayxxaakkwtepss) len V2, so sanh cau truc cho thay staging
-- khop 15 migration cu o moi thu (bang, cot, rang buoc, chi muc, policy, trigger, quyen ham) TRU than cua 3 ham duoi day:
-- staging dang chay ban cu (ngan gon, thieu lop phong thu "ACL drift" cua gan_loai_tai_khoan, thieu chu thich chan tu
-- nang cap vai tro, tao_to_chuc_cua_toi kiem vai tro bang la_ban_to_chuc() thay vi la_ban_to_chuc(v_user_id)).
-- Migration nay tao lai ba ham bang CREATE OR REPLACE nguyen van dinh nghia hien hanh; CREATE OR REPLACE giu nguyen
-- quyen EXECUTE da cap. Tren CSDL moi (da co ban moi) migration khong doi gi.

CREATE OR REPLACE FUNCTION public.gan_loai_tai_khoan(p_email text, p_loai text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.kiem_tra_khong_tu_nang_cap_loai_tai_khoan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW."LoaiTaiKhoan" IS DISTINCT FROM OLD."LoaiTaiKhoan" THEN
    -- If executed in an authenticated user session (client JWT), block any attempt to modify LoaiTaiKhoan
    IF auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
      RAISE EXCEPTION 'Khong co quyen tu y thay doi loai tai khoan' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tao_to_chuc_cua_toi(p_ten_to_chuc text, p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- Tu kiem tra: ba ham van SECURITY DEFINER, co search_path co dinh; anon khong goi duoc gan_loai_tai_khoan.
DO $$
BEGIN
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('gan_loai_tai_khoan', 'kiem_tra_khong_tu_nang_cap_loai_tai_khoan', 'tao_to_chuc_cua_toi')
           AND p.prosecdef
           AND p.proconfig IS NOT NULL AND array_to_string(p.proconfig, ',') LIKE '%search_path%') <> 3 THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: account functions must be SECURITY DEFINER with fixed search_path';
    END IF;
    IF has_function_privilege('anon', 'public.gan_loai_tai_khoan(text, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.gan_loai_tai_khoan(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: gan_loai_tai_khoan must not be executable by client roles';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
