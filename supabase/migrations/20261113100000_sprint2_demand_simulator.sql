-- ============================================================================
-- Migration: 20261113100000_sprint2_demand_simulator.sql
-- Purpose: Sprint 2 / T4 — Demand Simulator with simulated sale timestamps.
--   Adds public.mo_phong_nhu_cau(INT, TEXT) and the bookkeeping table
--   public."MO_PHONG_GHE". Does NOT modify W1 (20261112090000/100000/110000),
--   T2 (20261113090000), T3 (20261113093000) or earlier migrations. Replay-safe.
--
-- ============================================================================
-- CONTRACT (T4)
-- ============================================================================
--
-- 1. Signature & privileges:
--    public.mo_phong_nhu_cau(p_su_kien_id INT, p_kich_ban TEXT) RETURNS JSONB
--      LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
--      REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, service_role.
--    SECURITY DEFINER is required because direct writes on seats are revoked from
--    PUBLIC/anon/authenticated (20261111090000). This migration opens NO table
--    privilege on seats and never disables any trigger.
--
-- 2. Gate order (every rejection happens BEFORE any write):
--    a) p_kich_ban must be one of ban_nhanh / ban_cham / ban_deu (NULL rejected)
--       -> 22023 'KICH_BAN_KHONG_HOP_LE'
--    b) unlocked event lookup; missing event -> service_role P0002, others 42501
--    c) co_quyen_dinh_gia(p_su_kien_id) false -> 42501
--    d) CAU_HINH_SU_KIEN.TuyChonMoRong->>'moPhong' not 'true' (missing row = false)
--       -> 55000 'MO_PHONG_CHUA_BAT'. Exact match on 'true' (JSON true or "true");
--       "TRUE"/"True" are rejected. Deliberately stricter than the LOWER(...) used
--       by the T2 lay_so_lieu_dinh_gia.mo_phong label.
--    e) row locks, then the flag is re-checked under the lock.
--    f) suat_dien_dang_mo_ban(p_su_kien_id, SuatDienID) per show of the event. No
--       own reading of show status or of legacy sale columns. No open show ->
--       {"ketQua":"KHONG_CO_SUAT_HOP_LE", ...} and ZERO writes.
--
-- 3. Lock order (same as dong_bo_ghe_su_kien, so no deadlock with the save RPC):
--    event row (weak row lock) -> all zones of the event in ascending
--    KhuVucID -> seat rows (SKIP LOCKED, ascending GheID).
--
-- 4. Timestamp mechanism (W1 trigger stays in force):
--    The W1 trigger fires on a change of the status column and stamps now().
--    Each seat is therefore written in TWO statements of one transaction:
--    (1) change the status (trigger stamps now()); (2) a second statement that
--    sets ONLY the status-time column (no status in its SET list, so the trigger
--    does not fire) to the simulated time. Regular status flows keep now().
--
-- 5. Eligible seats: status 'TRONG' AND not linked to any ACTIVE hold detail.
--    Held seats are never changed, so hold links stay intact. Zones without seat
--    rows (standing zones) and holds without a seat id cannot be simulated:
--    reported as khongCoGhe, no data is invented.
--
-- 6. Reset scope: each run first resets only rows of THIS event whose show is
--    open now (table MO_PHONG_GHE). A seat is restored only when it is still
--    'DA_BAN' and its status time equals the recorded simulated time (nobody
--    touched it). Diverged rows are dropped from bookkeeping and the seat is left
--    alone (datLai.boQuaDaThayDoi). Matching seats locked by someone else are
--    kept in bookkeeping (datLai.boQuaDangKhoa). A matching seat that is linked to
--    an ACTIVE hold detail is never restored either (same NOT EXISTS guard as the
--    eligible set); it stays in bookkeeping and is counted in boQuaDangKhoa.
--    Seats of skipped shows are kept as they are (datLai.chuaDatLai). Real sold
--    seats are never touched. GIU_CHO / CHI_TIET_GIU_CHO rows are never written.
--
-- 7. Scenarios (seat k = 0..n-1 in ascending GheID per zone; n = seats written;
--    target = LEAST(eligible, FLOOR(TongSoGhe * fill)); anchor = now()):
--      ban_nhanh  fill 0.70  time = anchor - 5h * k/n          (all inside the 6h window)
--      ban_cham   fill 0.10  time = anchor - (6h 1min + k min) (outside the 6h window)
--      ban_deu    fill 0.35  time spread evenly over (open time, anchor)
--    Every time = LEAST(anchor, GREATEST(open, raw)); open = SUAT_DIEN.ThoiGianMoBanVe,
--    or anchor - 24h when it is NULL. So no time is later than the anchor or earlier
--    than the sale open time. Seat order is ascending GheID and the anchor is now(),
--    so equal data gives equal output.
--    ban_cham clamp: if the show opened less than ~6h ago, the clamp pulls ban_cham
--    times INTO the 6h window and erases the difference from ban_nhanh. Those seats
--    are counted in khuVuc[].biKepVaoCuaSo6h (always 0 for the other scenarios).
--    DEMO PRECONDITION: the show opened at least 7h before the run (ban_cham needs
--    6h 1min + (n-1) min, so also keep n small enough, or open earlier, to avoid the
--    clamp; biKepVaoCuaSo6h = 0 proves there was none).
--
-- 8. Label & scope: result carries "nhan":"MO_PHONG" and "moPhong":true. The
--    simulator never changes listed prices, pricing rules, proposals or audit logs.
--    Only seats of zones with KHU_VUC.SuKienID = p_su_kien_id are touched.
--
-- 9. Result JSON:
--    {ketQua:'DA_MO_PHONG', nhan:'MO_PHONG', moPhong:true, kichBan, suKienId,
--     thoiDiemNeo, suatDaMoPhong:[ids], suatBoQua:[{suatDienId, lyDo}],
--     khuVuc:[{khuVucId, suatDienId, ghiMoi, datLai, boQuaDangGiu, khongCoGhe,
--              biKepVaoCuaSo6h}],
--     datLai:{tong, boQuaDaThayDoi, boQuaDangKhoa, chuaDatLai}}
--
-- Verification note:
--   `npm run check` validates TypeScript, Node tests, and Vite build only; it does
--   NOT execute SQL. Execution of this migration and the database demo are
--   UNVERIFIED.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bookkeeping table: public."MO_PHONG_GHE" (no FK, so seat deletion by the
--    seat sync is never blocked)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."MO_PHONG_GHE" (
    "GheID" BIGINT PRIMARY KEY,
    "SuKienID" INT NOT NULL,
    "SuatDienID" BIGINT,
    "KhuVucID" INT,
    "KichBan" VARCHAR(20) NOT NULL,
    "TrangThaiTruoc" VARCHAR(20) NOT NULL,
    "NgayCapNhatTruoc" TIMESTAMPTZ,
    "ThoiDiemGiaLap" TIMESTAMPTZ NOT NULL,
    "NgayTao" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "chk_mo_phong_ghe_kich_ban"
        CHECK ("KichBan" IN ('ban_nhanh', 'ban_cham', 'ban_deu')),
    CONSTRAINT "chk_mo_phong_ghe_truoc"
        CHECK ("TrangThaiTruoc" = 'TRONG')
);

CREATE INDEX IF NOT EXISTS "idx_mo_phong_ghe_sukien"
    ON public."MO_PHONG_GHE" ("SuKienID", "SuatDienID");

ALTER TABLE public."MO_PHONG_GHE" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."MO_PHONG_GHE" FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. RPC: public.mo_phong_nhu_cau(INT, TEXT)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mo_phong_nhu_cau(
    p_su_kien_id INT,
    p_kich_ban TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_is_service BOOLEAN := COALESCE(auth.role() = 'service_role', FALSE);
    v_fill NUMERIC;
    v_found INT;
    v_flag BOOLEAN;

    v_suat RECORD;
    v_open_ids BIGINT[] := '{}';
    v_skip JSONB := '[]'::JSONB;

    v_zone RECORD;
    v_ids BIGINT[];
    v_n INT;
    v_target INT;
    v_hold INT;
    v_has_seats BOOLEAN;
    v_in_window INT;
    v_zones_out JSONB := '[]'::JSONB;

    v_restore_ids BIGINT[];
    v_restored INT := 0;
    v_diverged INT := 0;
    v_locked INT := 0;
    v_deleted INT := 0;
    v_total_matching INT := 0;
    v_not_reset INT := 0;
    v_zone_restored INT;
BEGIN
    -- (a) Scenario: one source of truth for the fill ratios (see CONTRACT item 7).
    SELECT t.fill
      INTO v_fill
      FROM (VALUES
          ('ban_nhanh', 0.70::NUMERIC),
          ('ban_cham',  0.10::NUMERIC),
          ('ban_deu',   0.35::NUMERIC)
      ) AS t(kich_ban, fill)
     WHERE t.kich_ban = p_kich_ban;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'KICH_BAN_KHONG_HOP_LE'
            USING ERRCODE = '22023',
                  DETAIL = 'Kich ban phai la ban_nhanh, ban_cham hoac ban_deu';
    END IF;

    -- (b) Unlocked event lookup (anti-probing as in T2).
    SELECT 1 INTO v_found
      FROM public."SU_KIEN" sk
     WHERE sk."SuKienID" = p_su_kien_id;

    IF NOT FOUND THEN
        IF v_is_service THEN
            RAISE EXCEPTION 'Su kien khong ton tai'
                USING ERRCODE = 'P0002';
        END IF;
        RAISE EXCEPTION 'Khong co quyen mo phong nhu cau cua su kien'
            USING ERRCODE = '42501';
    END IF;

    -- (c) Authorization.
    IF NOT COALESCE(public.co_quyen_dinh_gia(p_su_kien_id), FALSE) THEN
        RAISE EXCEPTION 'Khong co quyen mo phong nhu cau cua su kien'
            USING ERRCODE = '42501';
    END IF;

    -- (d) Simulation flag: exact AC#2 comparison, case variants rejected
    -- (deliberately stricter than the LOWER used by the T2 mo_phong label).
    SELECT COALESCE(ch."TuyChonMoRong"->>'moPhong' = 'true', FALSE)
      INTO v_flag
      FROM public."SU_KIEN" sk
      LEFT JOIN public."CAU_HINH_SU_KIEN" ch ON ch."SuKienID" = sk."SuKienID"
     WHERE sk."SuKienID" = p_su_kien_id;

    IF NOT COALESCE(v_flag, FALSE) THEN
        RAISE EXCEPTION 'MO_PHONG_CHUA_BAT'
            USING ERRCODE = '55000',
                  DETAIL = 'Can bat TuyChonMoRong.moPhong = true cho su kien';
    END IF;

    -- (e) Locks: event, then zones ascending, (seats are locked per zone below).
    PERFORM 1
      FROM public."SU_KIEN" sk
     WHERE sk."SuKienID" = p_su_kien_id
       FOR NO KEY UPDATE;

    IF NOT FOUND THEN
        IF v_is_service THEN
            RAISE EXCEPTION 'Su kien khong ton tai'
                USING ERRCODE = 'P0002';
        END IF;
        RAISE EXCEPTION 'Khong co quyen mo phong nhu cau cua su kien'
            USING ERRCODE = '42501';
    END IF;

    PERFORM 1
      FROM public."KHU_VUC" kv
     WHERE kv."SuKienID" = p_su_kien_id
     ORDER BY kv."KhuVucID"
       FOR UPDATE;

    -- Re-check the flag under the lock (same exact comparison).
    SELECT COALESCE(ch."TuyChonMoRong"->>'moPhong' = 'true', FALSE)
      INTO v_flag
      FROM public."SU_KIEN" sk
      LEFT JOIN public."CAU_HINH_SU_KIEN" ch ON ch."SuKienID" = sk."SuKienID"
     WHERE sk."SuKienID" = p_su_kien_id;

    IF NOT COALESCE(v_flag, FALSE) THEN
        RAISE EXCEPTION 'MO_PHONG_CHUA_BAT'
            USING ERRCODE = '55000',
                  DETAIL = 'Can bat TuyChonMoRong.moPhong = true cho su kien';
    END IF;

    -- (f) Open shows only through the shared T2 helper.
    FOR v_suat IN
        SELECT sd."SuatDienID"
          FROM public."SUAT_DIEN" sd
         WHERE sd."SuKienID" = p_su_kien_id
         ORDER BY sd."SuatDienID"
    LOOP
        IF COALESCE(public.suat_dien_dang_mo_ban(p_su_kien_id, v_suat."SuatDienID"), FALSE) THEN
            v_open_ids := v_open_ids || v_suat."SuatDienID";
        ELSE
            v_skip := v_skip || jsonb_build_array(jsonb_build_object(
                'suatDienId', v_suat."SuatDienID",
                'lyDo', 'KHONG_MO_BAN'
            ));
        END IF;
    END LOOP;

    IF COALESCE(array_length(v_open_ids, 1), 0) = 0 THEN
        RETURN jsonb_build_object(
            'ketQua', 'KHONG_CO_SUAT_HOP_LE',
            'nhan', 'MO_PHONG',
            'moPhong', TRUE,
            'kichBan', p_kich_ban,
            'suKienId', p_su_kien_id,
            'suatBoQua', v_skip
        );
    END IF;

    -- ------------------------------------------------------------------
    -- Reset: only this event, only open shows (CONTRACT item 6).
    -- ------------------------------------------------------------------
    SELECT COUNT(*)::INT
      INTO v_total_matching
      FROM public."MO_PHONG_GHE" m
     WHERE m."SuKienID" = p_su_kien_id
       AND m."SuatDienID" = ANY (v_open_ids);

    v_restore_ids := ARRAY(
        SELECT g."GheID"
          FROM public."GHE" g
          JOIN public."KHU_VUC" kv
            ON kv."KhuVucID" = g."KhuVucID"
           AND kv."SuKienID" = p_su_kien_id
          JOIN public."MO_PHONG_GHE" m
            ON m."GheID" = g."GheID"
           AND m."SuKienID" = p_su_kien_id
         WHERE m."SuatDienID" = ANY (v_open_ids)
           AND g."TrangThai" = 'DA_BAN'
           AND g."NgayCapNhatTrangThai" IS NOT DISTINCT FROM m."ThoiDiemGiaLap"
           AND NOT EXISTS (
               SELECT 1
                 FROM public."CHI_TIET_GIU_CHO" ct
                 JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID"
                WHERE ct."GheID" = g."GheID"
                  AND gc."TrangThai" = 'ACTIVE'
           )
         ORDER BY g."GheID"
           FOR UPDATE OF g SKIP LOCKED
    );
    v_restored := COALESCE(array_length(v_restore_ids, 1), 0);

    IF v_restored > 0 THEN
        -- Step 1: status back to its recorded value (trigger stamps now()).
        UPDATE public."GHE" g
           SET "TrangThai" = m."TrangThaiTruoc"
          FROM public."MO_PHONG_GHE" m
         WHERE m."GheID" = g."GheID"
           AND g."GheID" = ANY (v_restore_ids);

        -- Step 2: status-time column only (trigger does not fire).
        UPDATE public."GHE" g
           SET "NgayCapNhatTrangThai" = m."NgayCapNhatTruoc"
          FROM public."MO_PHONG_GHE" m
         WHERE m."GheID" = g."GheID"
           AND g."GheID" = ANY (v_restore_ids);
    END IF;

    -- Drop bookkeeping of restored seats and of diverged seats (left alone).
    -- Rows whose seat still matches but was locked by someone else are kept.
    DELETE FROM public."MO_PHONG_GHE" m
     WHERE m."SuKienID" = p_su_kien_id
       AND m."SuatDienID" = ANY (v_open_ids)
       AND (
           m."GheID" = ANY (v_restore_ids)
           OR NOT EXISTS (
               SELECT 1
                 FROM public."GHE" g
                WHERE g."GheID" = m."GheID"
                  AND g."TrangThai" = 'DA_BAN'
                  AND g."NgayCapNhatTrangThai" IS NOT DISTINCT FROM m."ThoiDiemGiaLap"
           )
       );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_diverged := GREATEST(v_deleted - v_restored, 0);
    v_locked := GREATEST(v_total_matching - v_deleted, 0);

    SELECT COUNT(*)::INT
      INTO v_not_reset
      FROM public."MO_PHONG_GHE" m
     WHERE m."SuKienID" = p_su_kien_id
       AND NOT (m."SuatDienID" = ANY (v_open_ids));

    -- ------------------------------------------------------------------
    -- Apply the scenario per zone of an open show.
    -- ------------------------------------------------------------------
    FOR v_zone IN
        SELECT kv."KhuVucID", kv."SuatDienID", kv."TongSoGhe", sd."ThoiGianMoBanVe"
          FROM public."KHU_VUC" kv
          JOIN public."SUAT_DIEN" sd
            ON sd."SuatDienID" = kv."SuatDienID"
           AND sd."SuKienID" = kv."SuKienID"
         WHERE kv."SuKienID" = p_su_kien_id
           AND kv."SuatDienID" = ANY (v_open_ids)
         ORDER BY kv."KhuVucID"
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM public."GHE" g WHERE g."KhuVucID" = v_zone."KhuVucID"
        ) INTO v_has_seats;

        v_zone_restored := 0;
        v_n := 0;
        v_hold := 0;
        v_in_window := 0;

        IF v_has_seats THEN
            SELECT COUNT(*)::INT
              INTO v_hold
              FROM public."GHE" g
             WHERE g."KhuVucID" = v_zone."KhuVucID"
               AND g."TrangThai" = 'TRONG'
               AND EXISTS (
                   SELECT 1
                     FROM public."CHI_TIET_GIU_CHO" ct
                     JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID"
                    WHERE ct."GheID" = g."GheID"
                      AND gc."TrangThai" = 'ACTIVE'
               );

            v_target := GREATEST(FLOOR(COALESCE(v_zone."TongSoGhe", 0) * v_fill)::INT, 0);

            -- Eligible: free AND not linked to an ACTIVE hold detail.
            v_ids := ARRAY(
                SELECT g."GheID"
                  FROM public."GHE" g
                  JOIN public."KHU_VUC" kv
                    ON kv."KhuVucID" = g."KhuVucID"
                   AND kv."SuKienID" = p_su_kien_id
                 WHERE g."KhuVucID" = v_zone."KhuVucID"
                   AND g."TrangThai" = 'TRONG'
                   AND NOT EXISTS (
                       SELECT 1
                         FROM public."CHI_TIET_GIU_CHO" ct
                         JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID"
                        WHERE ct."GheID" = g."GheID"
                          AND gc."TrangThai" = 'ACTIVE'
                   )
                 ORDER BY g."GheID"
                 LIMIT v_target
                   FOR UPDATE OF g SKIP LOCKED
            );
            v_n := COALESCE(array_length(v_ids, 1), 0);

            IF v_n > 0 THEN
                -- Bookkeeping first (captures the previous status time).
                INSERT INTO public."MO_PHONG_GHE" AS mp (
                    "GheID", "SuKienID", "SuatDienID", "KhuVucID", "KichBan",
                    "TrangThaiTruoc", "NgayCapNhatTruoc", "ThoiDiemGiaLap"
                )
                SELECT
                    g."GheID", p_su_kien_id, v_zone."SuatDienID", v_zone."KhuVucID",
                    p_kich_ban, g."TrangThai", g."NgayCapNhatTrangThai",
                    LEAST(
                        v_now,
                        GREATEST(
                            COALESCE(v_zone."ThoiGianMoBanVe", v_now - INTERVAL '24 hours'),
                            v_now - CASE p_kich_ban
                                WHEN 'ban_nhanh' THEN
                                    INTERVAL '5 hours' * ((u.ord - 1)::DOUBLE PRECISION / v_n)
                                WHEN 'ban_cham' THEN
                                    INTERVAL '6 hours 1 minute' + INTERVAL '1 minute' * (u.ord - 1)
                                ELSE
                                    (v_now - COALESCE(v_zone."ThoiGianMoBanVe", v_now - INTERVAL '24 hours'))
                                        * (1.0 - u.ord::DOUBLE PRECISION / (v_n + 1))
                            END
                        )
                    )
                  FROM unnest(v_ids) WITH ORDINALITY AS u(id, ord)
                  JOIN public."GHE" g ON g."GheID" = u.id
                ON CONFLICT ("GheID") DO UPDATE SET
                    "SuKienID" = EXCLUDED."SuKienID",
                    "SuatDienID" = EXCLUDED."SuatDienID",
                    "KhuVucID" = EXCLUDED."KhuVucID",
                    "KichBan" = EXCLUDED."KichBan",
                    "TrangThaiTruoc" = EXCLUDED."TrangThaiTruoc",
                    "NgayCapNhatTruoc" = EXCLUDED."NgayCapNhatTruoc",
                    "ThoiDiemGiaLap" = EXCLUDED."ThoiDiemGiaLap",
                    "NgayTao" = now();

                -- Step 1: change status (W1 trigger stamps now()).
                UPDATE public."GHE" g
                   SET "TrangThai" = 'DA_BAN'
                 WHERE g."GheID" = ANY (v_ids)
                   AND g."TrangThai" = 'TRONG';

                -- Step 2: simulated time only; no status in SET, trigger does not fire.
                UPDATE public."GHE" g
                   SET "NgayCapNhatTrangThai" = m."ThoiDiemGiaLap"
                  FROM public."MO_PHONG_GHE" m
                 WHERE m."GheID" = g."GheID"
                   AND g."GheID" = ANY (v_ids)
                   AND g."TrangThai" = 'DA_BAN';

                SELECT COUNT(*)::INT
                  INTO v_in_window
                  FROM public."MO_PHONG_GHE" m
                 WHERE m."GheID" = ANY (v_ids)
                   AND m."ThoiDiemGiaLap" >= v_now - INTERVAL '6 hours';
            END IF;
        END IF;

        SELECT COUNT(*)::INT
          INTO v_zone_restored
          FROM unnest(v_restore_ids) AS r(id)
          JOIN public."GHE" g ON g."GheID" = r.id
         WHERE g."KhuVucID" = v_zone."KhuVucID";

        v_zones_out := v_zones_out || jsonb_build_array(jsonb_build_object(
            'khuVucId', v_zone."KhuVucID",
            'suatDienId', v_zone."SuatDienID",
            'ghiMoi', v_n,
            'datLai', v_zone_restored,
            'boQuaDangGiu', v_hold,
            'khongCoGhe', NOT v_has_seats,
            'biKepVaoCuaSo6h', CASE WHEN p_kich_ban = 'ban_cham' THEN v_in_window ELSE 0 END
        ));
    END LOOP;

    RETURN jsonb_build_object(
        'ketQua', 'DA_MO_PHONG',
        'nhan', 'MO_PHONG',
        'moPhong', TRUE,
        'kichBan', p_kich_ban,
        'suKienId', p_su_kien_id,
        'thoiDiemNeo', v_now,
        'suatDaMoPhong', to_jsonb(v_open_ids),
        'suatBoQua', v_skip,
        'khuVuc', v_zones_out,
        'datLai', jsonb_build_object(
            'tong', v_restored,
            'boQuaDaThayDoi', v_diverged,
            'boQuaDangKhoa', v_locked,
            'chuaDatLai', v_not_reset
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.mo_phong_nhu_cau(INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_phong_nhu_cau(INT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Assertions (same guard as 20261111090000)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'GHE'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['authenticated', 'anon', 'public']::name[]
  ) THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: a write policy on GHE is still open to authenticated/anon';
  END IF;
  IF has_table_privilege('authenticated', 'public."GHE"', 'UPDATE')
     OR has_table_privilege('authenticated', 'public."GHE"', 'INSERT')
     OR has_table_privilege('authenticated', 'public."GHE"', 'DELETE')
     OR has_table_privilege('anon', 'public."GHE"', 'INSERT')
     OR has_table_privilege('anon', 'public."GHE"', 'UPDATE')
     OR has_table_privilege('anon', 'public."GHE"', 'DELETE') THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: authenticated/anon can write GHE directly';
  END IF;
  IF has_table_privilege('authenticated', 'public."MO_PHONG_GHE"', 'SELECT')
     OR has_table_privilege('anon', 'public."MO_PHONG_GHE"', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: MO_PHONG_GHE is readable by authenticated/anon';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
