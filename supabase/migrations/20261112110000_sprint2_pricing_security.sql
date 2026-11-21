-- Sprint 2 / T2: lock down access to the 3 pricing tables from
-- 20261112090000_sprint2_pricing_tables.sql (QUY_TAC_GIA, DE_XUAT_GIA, NHAT_KY_GIA)
-- and protect the NHAT_KY_GIA audit log from UPDATE/DELETE.
--
-- References:
--   * Policy pattern: 20261005150000_marketplace_organizer_mvp.sql ("Members read show seats").
--   * Membership helper: public.la_thanh_vien_to_chuc(UUID), current definition in
--     20261006210000_user_organizer_boundary.sql (SECURITY DEFINER; requires
--     HO_SO_NGUOI_DUNG.LoaiTaiKhoan IN ('ORGANIZER','ADMIN'); any VaiTro passes). Called, not redefined.
--
-- Scope: SELECT only, for organization members. No pricing configuration/approval
-- rights are granted here (CHU_SO_HUU/QUAN_TRI restrictions belong to later RPCs).
-- No public-event branch: audiences and anon never read pricing data.
--
-- NOTE: `npm run check` does NOT execute SQL. This migration must be verified with
-- `npm run db:test` (pgTAP).

-- 1. Row Level Security (idempotent; also enabled by the tables migration)
ALTER TABLE public."QUY_TAC_GIA" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DE_XUAT_GIA" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NHAT_KY_GIA" ENABLE ROW LEVEL SECURITY;

-- 2. Privileges (Supabase default privileges grant ALL to anon/authenticated on new tables;
--    these REVOKEs are what actually block client writes). service_role is left untouched.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public."QUY_TAC_GIA" FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public."QUY_TAC_GIA" FROM PUBLIC, anon;
GRANT SELECT ON public."QUY_TAC_GIA" TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public."DE_XUAT_GIA" FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public."DE_XUAT_GIA" FROM PUBLIC, anon;
GRANT SELECT ON public."DE_XUAT_GIA" TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public."NHAT_KY_GIA" FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public."NHAT_KY_GIA" FROM PUBLIC, anon;
GRANT SELECT ON public."NHAT_KY_GIA" TO authenticated;

-- 3. SELECT-only policies for organization members.
--    The outer "KhuVucID" MUST be table-qualified: a bare "KhuVucID" would resolve to kv.
DROP POLICY IF EXISTS "Thanh vien to chuc doc quy tac gia" ON public."QUY_TAC_GIA";
CREATE POLICY "Thanh vien to chuc doc quy tac gia"
    ON public."QUY_TAC_GIA"
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public."KHU_VUC" kv
            JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = kv."SuatDienID"
            JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
            WHERE kv."KhuVucID" = "QUY_TAC_GIA"."KhuVucID"
              AND public.la_thanh_vien_to_chuc(sk."ToChucID")
        )
    );

DROP POLICY IF EXISTS "Thanh vien to chuc doc de xuat gia" ON public."DE_XUAT_GIA";
CREATE POLICY "Thanh vien to chuc doc de xuat gia"
    ON public."DE_XUAT_GIA"
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public."KHU_VUC" kv
            JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = kv."SuatDienID"
            JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
            WHERE kv."KhuVucID" = "DE_XUAT_GIA"."KhuVucID"
              AND public.la_thanh_vien_to_chuc(sk."ToChucID")
        )
    );

DROP POLICY IF EXISTS "Thanh vien to chuc doc nhat ky gia" ON public."NHAT_KY_GIA";
CREATE POLICY "Thanh vien to chuc doc nhat ky gia"
    ON public."NHAT_KY_GIA"
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public."KHU_VUC" kv
            JOIN public."SUAT_DIEN" sd ON sd."SuatDienID" = kv."SuatDienID"
            JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
            WHERE kv."KhuVucID" = "NHAT_KY_GIA"."KhuVucID"
              AND public.la_thanh_vien_to_chuc(sk."ToChucID")
        )
    );

-- 4. Immutability protection for NHAT_KY_GIA (no service_role bypass, no client EXECUTE)
CREATE OR REPLACE FUNCTION public.chan_sua_xoa_nhat_ky_gia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'NHAT_KY_GIA la nhat ky bat bien: khong cho phep %', TG_OP
        USING ERRCODE = '42501',
              HINT = 'Ghi bo sung ban ghi moi thay vi sua/xoa';
END;
$$;

DROP TRIGGER IF EXISTS chan_sua_xoa_nhat_ky_gia ON public."NHAT_KY_GIA";
CREATE TRIGGER chan_sua_xoa_nhat_ky_gia
    BEFORE UPDATE OR DELETE ON public."NHAT_KY_GIA"
    FOR EACH ROW
    EXECUTE FUNCTION public.chan_sua_xoa_nhat_ky_gia();

REVOKE ALL ON FUNCTION public.chan_sua_xoa_nhat_ky_gia() FROM PUBLIC, anon, authenticated;
