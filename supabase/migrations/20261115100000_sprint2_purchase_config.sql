-- ============================================================================
-- Sprint 2 / T2: Purchase configuration with role gate and immutable audit
-- ============================================================================
-- Scope: the two purchase-limit settings stored in public."CAU_HINH_SU_KIEN":
--   "SoVeToiDaMoiDon"   INT 1..20 (CHECK from 20261028100000, unchanged)
--   "YeuCauXacMinhOTP"  BOOLEAN   (from 20261112090000, unchanged)
-- No column is added to CAU_HINH_SU_KIEN. The only new table is
-- public."NHAT_KY_CAU_HINH_MUA_VE".
--
-- CONTRACT
--   public.luu_cau_hinh_mua_ve(p_su_kien_id INT, p_so_ve_toi_da INT, p_yeu_cau_otp BOOLEAN)
--     RETURNS JSONB {suKienId, soVeToiDaMoiDon, yeuCauXacMinhOtp, daThayDoi}
--     SECURITY DEFINER, SET search_path = public; EXECUTE: authenticated only.
--   Errors (message -> SQLSTATE):
--     CAU_HINH_MUA_VE_CAN_DANG_NHAP          42501  auth.uid() is NULL
--     CAU_HINH_MUA_VE_KHONG_HOP_LE: <param>  22023  NULL parameter or max outside 1..20
--     SU_KIEN_KHONG_TON_TAI                  P0002  event does not exist
--     CAU_HINH_MUA_VE_KHONG_CO_QUYEN         42501  caller is not CHU_SO_HUU/QUAN_TRI of the owning org
--     CAU_HINH_MUA_VE_KHONG_DOI_SU_KIEN      42501  UPDATE tried to change "SuKienID"
--
--     SU_KIEN_KHONG_TON_TAI                  P0002  direct INSERT for a missing event
--
-- LOCK ORDER: SU_KIEN row first, then CAU_HINH_SU_KIEN row (same as
--   luu_su_kien_toan_dien_core). Never the reverse. Trigger
--   trg_khoa_cau_hinh_mua_ve (BEFORE INSERT OR UPDATE, function
--   khoa_cau_hinh_mua_ve) locks the SU_KIEN row on INSERT only; on UPDATE it
--   only rejects a "SuKienID" change and never locks SU_KIEN.
--
-- SINGLE AUDIT WRITER: the AFTER row trigger trg_kiem_soat_cau_hinh_mua_ve
--   (function kiem_soat_cau_hinh_mua_ve) on CAU_HINH_SU_KIEN is the ONLY place
--   that checks the role and inserts into NHAT_KY_CAU_HINH_MUA_VE. Every write
--   path (the RPC, luu_su_kien_toan_dien, direct DML) goes through the table,
--   so one change yields exactly one audit row and no path can skip the check.
--   Being AFTER ROW, it sees only rows really written (ON CONFLICT DO NOTHING
--   fires nothing; a conflicting upsert fires AFTER UPDATE with the locked OLD
--   row). A failed check raises 42501 and aborts the statement. There is no service_role branch and no
--   client-settable flag (no set_config / GUC marker) that bypasses the check.
--   The trigger only acts when one of the two values actually changes, so other
--   configuration columns stay writable under the existing editor policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Audit table NHAT_KY_CAU_HINH_MUA_VE (no foreign keys: historical IDs only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."NHAT_KY_CAU_HINH_MUA_VE" (
    "NhatKyCauHinhMuaVeID" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "SuKienID" INT NOT NULL,
    "NguoiThucHienID" UUID NOT NULL,
    "VaiTroToChuc" VARCHAR(20) NOT NULL
        CHECK ("VaiTroToChuc" IN ('CHU_SO_HUU', 'QUAN_TRI')),
    "ThoiGian" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "SoVeToiDaCu" INT NOT NULL CHECK ("SoVeToiDaCu" BETWEEN 1 AND 20),
    "SoVeToiDaMoi" INT NOT NULL CHECK ("SoVeToiDaMoi" BETWEEN 1 AND 20),
    "YeuCauOtpCu" BOOLEAN NOT NULL,
    "YeuCauOtpMoi" BOOLEAN NOT NULL,
    CHECK (
        "SoVeToiDaCu" IS DISTINCT FROM "SoVeToiDaMoi"
        OR "YeuCauOtpCu" IS DISTINCT FROM "YeuCauOtpMoi"
    )
);

COMMENT ON TABLE public."NHAT_KY_CAU_HINH_MUA_VE" IS
    'Nhat ky bat bien thay doi SoVeToiDaMoiDon / YeuCauXacMinhOTP; chi trigger kiem_soat_cau_hinh_mua_ve ghi.';

CREATE INDEX IF NOT EXISTS "idx_nhatky_cauhinhmuave_sukien_thoigian"
    ON public."NHAT_KY_CAU_HINH_MUA_VE" ("SuKienID", "ThoiGian");

ALTER TABLE public."NHAT_KY_CAU_HINH_MUA_VE" ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public."NHAT_KY_CAU_HINH_MUA_VE" FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public."NHAT_KY_CAU_HINH_MUA_VE" FROM PUBLIC, anon;
GRANT SELECT ON public."NHAT_KY_CAU_HINH_MUA_VE" TO authenticated;

DROP POLICY IF EXISTS "Thanh vien to chuc doc nhat ky cau hinh mua ve" ON public."NHAT_KY_CAU_HINH_MUA_VE";
CREATE POLICY "Thanh vien to chuc doc nhat ky cau hinh mua ve"
    ON public."NHAT_KY_CAU_HINH_MUA_VE"
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public."SU_KIEN" sk
            WHERE sk."SuKienID" = "NHAT_KY_CAU_HINH_MUA_VE"."SuKienID"
              AND public.la_thanh_vien_to_chuc(sk."ToChucID")
        )
    );

CREATE OR REPLACE FUNCTION public.chan_sua_xoa_nhat_ky_cau_hinh_mua_ve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'NHAT_KY_CAU_HINH_MUA_VE la nhat ky bat bien: khong cho phep %', TG_OP
        USING ERRCODE = '42501',
              HINT = 'Ghi bo sung ban ghi moi thay vi sua/xoa';
END;
$$;

REVOKE ALL ON FUNCTION public.chan_sua_xoa_nhat_ky_cau_hinh_mua_ve() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chan_sua_xoa_nhat_ky_cau_hinh_mua_ve ON public."NHAT_KY_CAU_HINH_MUA_VE";
CREATE TRIGGER trg_chan_sua_xoa_nhat_ky_cau_hinh_mua_ve
    BEFORE UPDATE OR DELETE ON public."NHAT_KY_CAU_HINH_MUA_VE"
    FOR EACH ROW
    EXECUTE FUNCTION public.chan_sua_xoa_nhat_ky_cau_hinh_mua_ve();

DROP TRIGGER IF EXISTS trg_chan_truncate_nhat_ky_cau_hinh_mua_ve ON public."NHAT_KY_CAU_HINH_MUA_VE";
CREATE TRIGGER trg_chan_truncate_nhat_ky_cau_hinh_mua_ve
    BEFORE TRUNCATE ON public."NHAT_KY_CAU_HINH_MUA_VE"
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.chan_sua_xoa_nhat_ky_cau_hinh_mua_ve();

-- ----------------------------------------------------------------------------
-- 2. Row triggers on CAU_HINH_SU_KIEN: lock (BEFORE) and check + audit (AFTER)
-- ----------------------------------------------------------------------------
-- 2a. BEFORE INSERT OR UPDATE: serialise writers. It never decides permission
--     and never writes audit rows. INSERT locks the SU_KIEN row (SU_KIEN is
--     always locked before CAU_HINH_SU_KIEN). UPDATE must NOT lock SU_KIEN: the
--     row is already locked by the UPDATE itself and locking SU_KIEN here would
--     invert the lock order and risk deadlock with the RPC / wrapper.
CREATE OR REPLACE FUNCTION public.khoa_cau_hinh_mua_ve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM 1
        FROM public."SU_KIEN"
        WHERE "SuKienID" = NEW."SuKienID"
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'SU_KIEN_KHONG_TON_TAI'
                USING ERRCODE = 'P0002';
        END IF;
    ELSIF NEW."SuKienID" IS DISTINCT FROM OLD."SuKienID" THEN
        RAISE EXCEPTION 'CAU_HINH_MUA_VE_KHONG_DOI_SU_KIEN'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.khoa_cau_hinh_mua_ve() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_khoa_cau_hinh_mua_ve ON public."CAU_HINH_SU_KIEN";
CREATE TRIGGER trg_khoa_cau_hinh_mua_ve
    BEFORE INSERT OR UPDATE ON public."CAU_HINH_SU_KIEN"
    FOR EACH ROW
    EXECUTE FUNCTION public.khoa_cau_hinh_mua_ve();

-- 2b. AFTER INSERT OR UPDATE OR DELETE: the single permission check + audit
--     writer. It runs only for rows actually written, so ON CONFLICT DO NOTHING
--     fires nothing and an upsert that conflicts fires only AFTER UPDATE with
--     the locked OLD row. One real change therefore yields exactly one audit row.
CREATE OR REPLACE FUNCTION public.kiem_soat_cau_hinh_mua_ve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_su_kien_id INT;
    v_max_cu INT;
    v_max_moi INT;
    v_otp_cu BOOLEAN;
    v_otp_moi BOOLEAN;
    v_uid UUID := auth.uid();
    v_role VARCHAR(20);
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_su_kien_id := OLD."SuKienID";
        v_max_cu := OLD."SoVeToiDaMoiDon";
        v_otp_cu := OLD."YeuCauXacMinhOTP";
        v_max_moi := NEW."SoVeToiDaMoiDon";
        v_otp_moi := NEW."YeuCauXacMinhOTP";
    ELSIF TG_OP = 'INSERT' THEN
        v_su_kien_id := NEW."SuKienID";
        v_max_cu := 4;
        v_otp_cu := FALSE;
        v_max_moi := NEW."SoVeToiDaMoiDon";
        v_otp_moi := NEW."YeuCauXacMinhOTP";
    ELSE -- DELETE
        -- Cascade from deleting the event itself: the parent is already gone.
        IF NOT EXISTS (
            SELECT 1 FROM public."SU_KIEN" sk WHERE sk."SuKienID" = OLD."SuKienID"
        ) THEN
            RETURN OLD;
        END IF;
        v_su_kien_id := OLD."SuKienID";
        v_max_cu := OLD."SoVeToiDaMoiDon";
        v_otp_cu := OLD."YeuCauXacMinhOTP";
        v_max_moi := 4;
        v_otp_moi := FALSE;
    END IF;

    IF v_max_cu IS NOT DISTINCT FROM v_max_moi
       AND v_otp_cu IS NOT DISTINCT FROM v_otp_moi THEN
        RETURN NULL;
    END IF;

    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'CAU_HINH_MUA_VE_CAN_DANG_NHAP'
            USING ERRCODE = '42501';
    END IF;

    SELECT tv."VaiTro" INTO v_role
    FROM public."SU_KIEN" sk
    JOIN public."THANH_VIEN_TO_CHUC" tv ON tv."ToChucID" = sk."ToChucID"
    JOIN public."HO_SO_NGUOI_DUNG" hs ON hs."NguoiDungID" = tv."NguoiDungID"
    WHERE sk."SuKienID" = v_su_kien_id
      AND tv."NguoiDungID" = v_uid
      AND hs."LoaiTaiKhoan" IN ('ORGANIZER', 'ADMIN')
      AND tv."VaiTro" IN ('CHU_SO_HUU', 'QUAN_TRI')
    LIMIT 1;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public."NHAT_KY_CAU_HINH_MUA_VE" (
        "SuKienID", "NguoiThucHienID", "VaiTroToChuc", "ThoiGian",
        "SoVeToiDaCu", "SoVeToiDaMoi", "YeuCauOtpCu", "YeuCauOtpMoi"
    ) VALUES (
        v_su_kien_id, v_uid, v_role, now(),
        v_max_cu, v_max_moi, v_otp_cu, v_otp_moi
    );

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.kiem_soat_cau_hinh_mua_ve() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kiem_soat_cau_hinh_mua_ve ON public."CAU_HINH_SU_KIEN";
CREATE TRIGGER trg_kiem_soat_cau_hinh_mua_ve
    AFTER INSERT OR UPDATE OR DELETE ON public."CAU_HINH_SU_KIEN"
    FOR EACH ROW
    EXECUTE FUNCTION public.kiem_soat_cau_hinh_mua_ve();

-- ----------------------------------------------------------------------------
-- 3. CAU_HINH_SU_KIEN ACL: split the FOR ALL editor policy, no DELETE path
-- ----------------------------------------------------------------------------
-- Replaces "Editors manage event configuration" from 20261103090000.
DROP POLICY IF EXISTS "Editors manage event configuration" ON public."CAU_HINH_SU_KIEN";
DROP POLICY IF EXISTS "Editors insert event configuration" ON public."CAU_HINH_SU_KIEN";
DROP POLICY IF EXISTS "Editors update event configuration" ON public."CAU_HINH_SU_KIEN";

CREATE POLICY "Editors insert event configuration"
ON public."CAU_HINH_SU_KIEN" FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "CAU_HINH_SU_KIEN"."SuKienID"
      AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
  )
);

CREATE POLICY "Editors update event configuration"
ON public."CAU_HINH_SU_KIEN" FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "CAU_HINH_SU_KIEN"."SuKienID"
      AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = "CAU_HINH_SU_KIEN"."SuKienID"
      AND public.co_quyen_bien_tap_to_chuc(sk."ToChucID")
  )
);

REVOKE DELETE, TRUNCATE ON public."CAU_HINH_SU_KIEN" FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE ON public."CAU_HINH_SU_KIEN" FROM service_role;

-- ----------------------------------------------------------------------------
-- 4. RPC public.luu_cau_hinh_mua_ve(INT, INT, BOOLEAN)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luu_cau_hinh_mua_ve(
    p_su_kien_id INT,
    p_so_ve_toi_da INT,
    p_yeu_cau_otp BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_to_chuc_id UUID;
    v_role VARCHAR(20);
    v_ton_tai BOOLEAN;
    v_max_cu INT := 4;
    v_otp_cu BOOLEAN := FALSE;
    v_thay_doi BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'CAU_HINH_MUA_VE_CAN_DANG_NHAP'
            USING ERRCODE = '42501';
    END IF;

    IF p_su_kien_id IS NULL THEN
        RAISE EXCEPTION 'CAU_HINH_MUA_VE_KHONG_HOP_LE: p_su_kien_id'
            USING ERRCODE = '22023';
    END IF;
    IF p_so_ve_toi_da IS NULL THEN
        RAISE EXCEPTION 'CAU_HINH_MUA_VE_KHONG_HOP_LE: p_so_ve_toi_da'
            USING ERRCODE = '22023';
    END IF;
    IF p_yeu_cau_otp IS NULL THEN
        RAISE EXCEPTION 'CAU_HINH_MUA_VE_KHONG_HOP_LE: p_yeu_cau_otp'
            USING ERRCODE = '22023';
    END IF;
    IF p_so_ve_toi_da < 1 OR p_so_ve_toi_da > 20 THEN
        RAISE EXCEPTION 'CAU_HINH_MUA_VE_KHONG_HOP_LE: p_so_ve_toi_da'
            USING ERRCODE = '22023',
                  HINT = 'So ve toi da moi don phai la so nguyen tu 1 den 20';
    END IF;

    -- Lock order: SU_KIEN first, then CAU_HINH_SU_KIEN.
    SELECT sk."ToChucID" INTO v_to_chuc_id
    FROM public."SU_KIEN" sk
    WHERE sk."SuKienID" = p_su_kien_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SU_KIEN_KHONG_TON_TAI'
            USING ERRCODE = 'P0002';
    END IF;

    -- Pre-check for a clear error; the trigger re-checks on every write path.
    SELECT tv."VaiTro" INTO v_role
    FROM public."THANH_VIEN_TO_CHUC" tv
    JOIN public."HO_SO_NGUOI_DUNG" hs ON hs."NguoiDungID" = tv."NguoiDungID"
    WHERE tv."ToChucID" = v_to_chuc_id
      AND tv."NguoiDungID" = v_uid
      AND hs."LoaiTaiKhoan" IN ('ORGANIZER', 'ADMIN')
      AND tv."VaiTro" IN ('CHU_SO_HUU', 'QUAN_TRI')
    LIMIT 1;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN'
            USING ERRCODE = '42501';
    END IF;

    SELECT TRUE, ch."SoVeToiDaMoiDon", ch."YeuCauXacMinhOTP"
      INTO v_ton_tai, v_max_cu, v_otp_cu
    FROM public."CAU_HINH_SU_KIEN" ch
    WHERE ch."SuKienID" = p_su_kien_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_ton_tai := FALSE;
        v_max_cu := 4;
        v_otp_cu := FALSE;
    END IF;

    v_thay_doi := v_max_cu IS DISTINCT FROM p_so_ve_toi_da
               OR v_otp_cu IS DISTINCT FROM p_yeu_cau_otp;

    -- The audit row is written by the AFTER ROW trigger trg_kiem_soat_cau_hinh_mua_ve, not here.
    IF NOT v_ton_tai THEN
        INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "SoVeToiDaMoiDon", "YeuCauXacMinhOTP")
        VALUES (p_su_kien_id, p_so_ve_toi_da, p_yeu_cau_otp);
    ELSIF v_thay_doi THEN
        UPDATE public."CAU_HINH_SU_KIEN"
           SET "SoVeToiDaMoiDon" = p_so_ve_toi_da,
               "YeuCauXacMinhOTP" = p_yeu_cau_otp,
               "NgayCapNhat" = NOW()
         WHERE "SuKienID" = p_su_kien_id;
    END IF;

    RETURN jsonb_build_object(
        'suKienId', p_su_kien_id,
        'soVeToiDaMoiDon', p_so_ve_toi_da,
        'yeuCauXacMinhOtp', p_yeu_cau_otp,
        'daThayDoi', v_thay_doi
    );
END;
$$;

REVOKE ALL ON FUNCTION public.luu_cau_hinh_mua_ve(INT, INT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luu_cau_hinh_mua_ve(INT, INT, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. (reserved)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 6. luu_su_kien_toan_dien wrapper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luu_su_kien_toan_dien(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payload JSONB := p_payload;
    v_event_id INT := NULLIF(p_payload->>'eventId', '')::INT;
    v_cfg_key TEXT;
    v_cfg JSONB;
    v_max_key TEXT;
    v_max_stored INT := 4;
    v_result JSONB;
    v_seats JSONB;
BEGIN
    IF v_event_id IS NOT NULL AND (v_payload ? 'configuration' OR v_payload ? 'cauHinh') THEN
        -- Lock order: SU_KIEN first, then CAU_HINH_SU_KIEN (matches luu_cau_hinh_mua_ve).
        PERFORM 1
        FROM public."SU_KIEN" sk
        WHERE sk."SuKienID" = v_event_id
        FOR UPDATE;

        IF FOUND THEN
            SELECT ch."SoVeToiDaMoiDon"
              INTO v_max_stored
            FROM public."CAU_HINH_SU_KIEN" ch
            WHERE ch."SuKienID" = v_event_id
            FOR UPDATE;

            v_max_stored := COALESCE(v_max_stored, 4);

            IF v_payload ? 'configuration' THEN
                v_cfg_key := 'configuration';
            ELSE
                v_cfg_key := 'cauHinh';
            END IF;

            v_cfg := v_payload->v_cfg_key;

            IF jsonb_typeof(v_cfg) IS DISTINCT FROM 'object' THEN
                v_max_key := CASE WHEN v_cfg_key = 'cauHinh' THEN 'soVeToiDaMoiDon' ELSE 'maxTicketsPerOrder' END;
                v_payload := jsonb_set(
                    v_payload,
                    ARRAY[v_cfg_key],
                    jsonb_build_object(v_max_key, v_max_stored),
                    TRUE
                );
            ELSIF NULLIF(v_cfg->>'maxTicketsPerOrder', '') IS NULL
              AND NULLIF(v_cfg->>'soVeToiDaMoiDon', '') IS NULL THEN
                v_max_key := CASE WHEN v_cfg_key = 'cauHinh' THEN 'soVeToiDaMoiDon' ELSE 'maxTicketsPerOrder' END;
                v_payload := jsonb_set(
                    v_payload,
                    ARRAY[v_cfg_key],
                    v_cfg || jsonb_build_object(v_max_key, v_max_stored),
                    TRUE
                );
            END IF;
        END IF;
    END IF;

    v_result := public.luu_su_kien_toan_dien_core(v_payload);
    -- Any error here (e.g. more than 50,000 seats) aborts the whole call, including the save above.
    v_seats := public.dong_bo_ghe_su_kien((v_result->>'eventId')::INT);
    RETURN v_result || jsonb_build_object('seats', v_seats);
END;
$$;

REVOKE ALL ON FUNCTION public.luu_su_kien_toan_dien(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luu_su_kien_toan_dien(JSONB) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Migration assertions
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE oid = 'public."NHAT_KY_CAU_HINH_MUA_VE"'::regclass AND relrowsecurity
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: RLS must be enabled on NHAT_KY_CAU_HINH_MUA_VE';
    END IF;

    IF has_table_privilege('authenticated', 'public."NHAT_KY_CAU_HINH_MUA_VE"', 'INSERT')
       OR has_table_privilege('authenticated', 'public."NHAT_KY_CAU_HINH_MUA_VE"', 'UPDATE')
       OR has_table_privilege('authenticated', 'public."NHAT_KY_CAU_HINH_MUA_VE"', 'DELETE')
       OR has_table_privilege('authenticated', 'public."NHAT_KY_CAU_HINH_MUA_VE"', 'TRUNCATE')
       OR has_table_privilege('anon', 'public."NHAT_KY_CAU_HINH_MUA_VE"', 'SELECT')
       OR has_table_privilege('anon', 'public."NHAT_KY_CAU_HINH_MUA_VE"', 'INSERT')
       OR has_table_privilege('anon', 'public."NHAT_KY_CAU_HINH_MUA_VE"', 'UPDATE')
       OR has_table_privilege('anon', 'public."NHAT_KY_CAU_HINH_MUA_VE"', 'DELETE')
       OR has_table_privilege('anon', 'public."NHAT_KY_CAU_HINH_MUA_VE"', 'TRUNCATE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: client roles have forbidden privileges on NHAT_KY_CAU_HINH_MUA_VE';
    END IF;

    IF NOT has_table_privilege('authenticated', 'public."NHAT_KY_CAU_HINH_MUA_VE"', 'SELECT') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: authenticated must have SELECT on NHAT_KY_CAU_HINH_MUA_VE';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public."NHAT_KY_CAU_HINH_MUA_VE"'::regclass AND contype = 'f'
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: NHAT_KY_CAU_HINH_MUA_VE must not have foreign keys';
    END IF;

    IF has_table_privilege('authenticated', 'public."CAU_HINH_SU_KIEN"', 'DELETE')
       OR has_table_privilege('authenticated', 'public."CAU_HINH_SU_KIEN"', 'TRUNCATE')
       OR has_table_privilege('anon', 'public."CAU_HINH_SU_KIEN"', 'DELETE')
       OR has_table_privilege('anon', 'public."CAU_HINH_SU_KIEN"', 'TRUNCATE')
       OR has_table_privilege('service_role', 'public."CAU_HINH_SU_KIEN"', 'TRUNCATE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: CAU_HINH_SU_KIEN must not be deletable/truncatable by clients';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'CAU_HINH_SU_KIEN'
          AND (policyname = 'Editors manage event configuration' OR cmd IN ('DELETE', 'ALL'))
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: CAU_HINH_SU_KIEN must have no ALL/DELETE policy';
    END IF;

    IF has_function_privilege('authenticated', 'public.khoa_cau_hinh_mua_ve()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.khoa_cau_hinh_mua_ve()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.chan_sua_xoa_nhat_ky_cau_hinh_mua_ve()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.chan_sua_xoa_nhat_ky_cau_hinh_mua_ve()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.kiem_soat_cau_hinh_mua_ve()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.kiem_soat_cau_hinh_mua_ve()', 'EXECUTE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: client roles can execute purchase-config trigger functions';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'chan_sua_xoa_nhat_ky_cau_hinh_mua_ve' AND NOT p.prosecdef
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: chan_sua_xoa_nhat_ky_cau_hinh_mua_ve must be SECURITY INVOKER';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('khoa_cau_hinh_mua_ve', 'kiem_soat_cau_hinh_mua_ve', 'luu_cau_hinh_mua_ve')
          AND p.prosecdef
          AND EXISTS (
              SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
          )
    ) <> 3 THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: purchase-config functions must be SECURITY DEFINER with search_path';
    END IF;

    IF has_function_privilege('anon', 'public.luu_cau_hinh_mua_ve(integer, integer, boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: anon can execute luu_cau_hinh_mua_ve';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.luu_cau_hinh_mua_ve(integer, integer, boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: authenticated must execute luu_cau_hinh_mua_ve';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger t
        WHERE t.tgrelid = 'public."CAU_HINH_SU_KIEN"'::regclass
          AND t.tgname = 'trg_khoa_cau_hinh_mua_ve'
          AND NOT t.tgisinternal
          AND t.tgenabled <> 'D'
          AND (t.tgtype & 1) = 1    -- FOR EACH ROW
          AND (t.tgtype & 2) = 2    -- BEFORE
          AND (t.tgtype & 4) = 4    -- INSERT
          AND (t.tgtype & 8) = 0    -- no DELETE
          AND (t.tgtype & 16) = 16  -- UPDATE
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: trg_khoa_cau_hinh_mua_ve must be an enabled BEFORE INSERT/UPDATE row trigger on CAU_HINH_SU_KIEN';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger t
        WHERE t.tgrelid = 'public."CAU_HINH_SU_KIEN"'::regclass
          AND t.tgname = 'trg_kiem_soat_cau_hinh_mua_ve'
          AND NOT t.tgisinternal
          AND t.tgenabled <> 'D'
          AND (t.tgtype & 1) = 1    -- FOR EACH ROW
          AND (t.tgtype & 2) = 0    -- AFTER
          AND (t.tgtype & 4) = 4    -- INSERT
          AND (t.tgtype & 8) = 8    -- DELETE
          AND (t.tgtype & 16) = 16  -- UPDATE
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: trg_kiem_soat_cau_hinh_mua_ve must be an enabled AFTER INSERT/UPDATE/DELETE row trigger on CAU_HINH_SU_KIEN';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'luu_su_kien_toan_dien'
          AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb'
          AND p.prosecdef
          AND EXISTS (
              SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
          )
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: luu_su_kien_toan_dien(jsonb) must be SECURITY DEFINER with search_path';
    END IF;

    IF has_function_privilege('anon', 'public.luu_su_kien_toan_dien(jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.luu_su_kien_toan_dien(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: luu_su_kien_toan_dien(jsonb) grants must be authenticated only (no anon)';
    END IF;
END;
$$;
