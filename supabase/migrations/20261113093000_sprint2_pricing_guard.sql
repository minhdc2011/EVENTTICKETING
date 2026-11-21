-- ============================================================================
-- Migration: 20261113093000_sprint2_pricing_guard.sql
-- Purpose: Sprint 2 / T3 — PriceGuard for pricing proposals: de-duplication of
--   PENDING proposals (one per zone), 120-minute TTL, and the audit of blocked
--   proposals in NHAT_KY_DINH_GIA (defined by T2).
--   Does NOT modify W1 migrations, the T2 migration (20261113090000), the audit
--   schema, chk_loai_bien_dong, luu_quy_tac_gia, or GiaVeNiemYet.
--   Safe to replay (CREATE OR REPLACE / IF NOT EXISTS).
--
-- ============================================================================
-- CONTRACT T3 (builds on the CONTRACT of 20261113090000_sprint2_pricing_rpc.sql)
-- ============================================================================
--
-- 1. Signatures (all: LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;
--    REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, service_role):
--    - public.luu_de_xuat_gia(
--        p_khu_vuc_id INT, p_quy_tac_gia_id BIGINT, p_quy_tac_ngay_cap_nhat TIMESTAMPTZ,
--        p_gia_de_xuat NUMERIC, p_gia_tinh_toan_tho NUMERIC, p_ly_do TEXT
--      ) RETURNS JSONB
--    - public.het_han_de_xuat_gia(p_su_kien_id INT) RETURNS JSONB
--    No identity, current price, price frame, open-for-sale flag, simulation flag or
--    r / v / T_rem metric is accepted from the client; all are read from the database.
--
-- 2. luu_de_xuat_gia result (blocked != transport error):
--    - Saved:   { "ketQua": "DA_LUU", "deXuatId", "khuVucId", "suKienId", "giaDeXuat",
--                 "giaHienTai", "loaiCanhBao", "moPhong", "deXuatHetHan": [ids asc] }
--    - Blocked: { "ketQua": "BI_CHAN", "maChan", "nhatKyId", "deXuatHetHan": [ids asc] }
--      A business rejection is a NORMAL RETURN (never RAISE after the audit INSERT), so the
--      audit row survives the commit of the calling transaction. Clients must branch on
--      "ketQua". Exceptions are reserved for transport/permission/missing-object errors.
--    - Exceptions: 42501 (caller lacks pricing permission, or a non-service caller used a
--      zone that does not exist / changed link); P0002 (service_role, zone does not exist).
--
-- 3. Block codes (first failing code wins, in this order, all evaluated under the lock):
--    QUY_TAC_KHONG_TON_TAI, LIEN_KET_KHONG_HOP_LE, QUY_TAC_DA_THAY_DOI, QUY_TAC_TAT,
--    SUAT_DIEN_KHONG_MO_BAN, GIA_KHONG_HOP_LE, GIA_HIEN_HANH_KHONG_HOP_LE,
--    NGOAI_KHUNG_GIA, VUOT_BIEN_DO, DUOI_BUOC_NHAY, DA_CO_PENDING, THIEU_DU_LIEU.
--    (DA_CO_PENDING is also returned when the partial unique index rejects a concurrent
--    insert.) Pure price guards run before market-data availability (THIEU_DU_LIEU).
--
-- 4. Lock order (T2 contract section 3): step 1 unlocked lookup + co_quyen_dinh_gia;
--    step 2 KHU_VUC FOR UPDATE (ascending KhuVucID for several zones) -> QUY_TAC_GIA
--    FOR UPDATE -> DE_XUAT_GIA FOR UPDATE ORDER BY DeXuatID; step 3 verify under the lock.
--    Overdue PENDING proposals (> 120 minutes) are expired BEFORE the PENDING duplicate
--    check. At most one PENDING per zone is also enforced by the partial unique index
--    uq_de_xuat_gia_pending_khu_vuc.
--
-- 5. Audit limits:
--    - Blocked results are written to NHAT_KY_DINH_GIA (LoaiHanhDong = 'CHAN_DE_XUAT',
--      MaChan = code). Nothing is written to NHAT_KY_GIA and no DE_XUAT_GIA row is created.
--      GiaThu is the rounded tried price (NULL when not finite); the raw value is kept as
--      text in ThamSo. The audit never claims a price was applied.
--    - 42501 (permission) errors have NO database audit row: an INSERT followed by RAISE
--      would be rolled back. They are only recorded with RAISE LOG (server log, not DB).
--    - The 120-minute TTL expiry has no LoaiHanhDong in NHAT_KY_DINH_GIA (the set is
--      locked by T2 and 'HET_HIEU_LUC_DO_DOI_KHUNG' is reserved for frame narrowing), so
--      TTL expiry is NOT audited; it is visible as TrangThaiDuyet = 'EXPIRED' with
--      GhiChuDuyet = 'HET_HAN_TTL_120_PHUT'.
--
-- 6. Simulation: the server derives it from CAU_HINH_SU_KIEN.TuyChonMoRong->>'moPhong';
--    a simulated proposal always has LyDoDeXuat starting with '[MÔ PHỎNG]', and a
--    non-simulated one never does.
--
-- Verification note: `npm run check` does not execute SQL; this file is verified by
-- code reading only (no pgTAP has been run).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. At most one PENDING proposal per zone (partial unique index).
--    Existing duplicates are NOT repaired automatically: the migration stops.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_khu_vuc_id INT;
    v_so_luong BIGINT;
BEGIN
    SELECT dx."KhuVucID", COUNT(*)
      INTO v_khu_vuc_id, v_so_luong
      FROM public."DE_XUAT_GIA" dx
     WHERE dx."TrangThaiDuyet" = 'PENDING'
     GROUP BY dx."KhuVucID"
    HAVING COUNT(*) > 1
     ORDER BY dx."KhuVucID"
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'DE_XUAT_GIA co nhieu hon mot de xuat PENDING cho KhuVucID % (% dong)',
            v_khu_vuc_id, v_so_luong
            USING ERRCODE = '23505',
                  HINT = 'Xu ly thu cong (chuyen cac de xuat du thanh EXPIRED/REJECTED) roi chay lai migration.';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_de_xuat_gia_pending_khu_vuc
    ON public."DE_XUAT_GIA" ("KhuVucID")
    WHERE "TrangThaiDuyet" = 'PENDING';

-- ----------------------------------------------------------------------------
-- 2. luu_de_xuat_gia: PriceGuard + save one PENDING proposal (or audited block).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luu_de_xuat_gia(
    p_khu_vuc_id INT,
    p_quy_tac_gia_id BIGINT,
    p_quy_tac_ngay_cap_nhat TIMESTAMPTZ,
    p_gia_de_xuat NUMERIC,
    p_gia_tinh_toan_tho NUMERIC,
    p_ly_do TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role VARCHAR(30) := COALESCE(auth.role(), 'unknown');
    v_is_service BOOLEAN := COALESCE(auth.role() = 'service_role', FALSE);
    v_su_kien_id INT;
    v_suat_dien_id BIGINT;
    v_vai_tro_to_chuc VARCHAR(20);

    v_gia_hien NUMERIC(15,2);
    v_mo_phong BOOLEAN := FALSE;

    v_expired BIGINT[] := '{}';
    v_dx_id BIGINT;

    v_qt_found BOOLEAN := FALSE;
    v_qt_id BIGINT;
    v_qt_ngay TIMESTAMPTZ;
    v_kich_hoat BOOLEAN;
    v_gia_san NUMERIC(12,2);
    v_gia_tran NUMERIC(12,2);
    v_buoc NUMERIC(12,2);
    v_bien_do NUMERIC(5,4);

    v_dang_mo_ban BOOLEAN;
    v_pending_id BIGINT;

    v_gia_ok BOOLEAN;
    v_tho_ok BOOLEAN;
    v_p NUMERIC;          -- final proposed price: ROUND(p_gia_de_xuat, 2)
    v_tho NUMERIC;        -- ROUND(p_gia_tinh_toan_tho, 2)
    v_gia_thu NUMERIC(15,2);
    v_chenh NUMERIC;

    v_m RECORD;
    v_ty_le NUMERIC;
    v_toc_do_thuc NUMERIC;
    v_toc_do_ky_vong NUMERIC;
    v_gio_con_lai NUMERIC;

    v_loai_canh_bao VARCHAR(30);
    v_ly_do TEXT;
    v_de_xuat_id BIGINT;
    v_constraint TEXT;

    v_ma VARCHAR(40);    -- first block code; NULL = not blocked
    v_thong_diep TEXT;
    v_tham_so JSONB;
    v_nhat_ky_id BIGINT;
BEGIN
    -- ------------------------------------------------------------------
    -- Step 1 (unlocked): resolve the verified event, then check permission.
    -- ------------------------------------------------------------------
    SELECT kv."SuKienID", kv."SuatDienID"
      INTO v_su_kien_id, v_suat_dien_id
      FROM public."KHU_VUC" kv
      JOIN public."SUAT_DIEN" sd
        ON sd."SuatDienID" = kv."SuatDienID"
       AND sd."SuKienID" = kv."SuKienID"
     WHERE kv."KhuVucID" = p_khu_vuc_id;

    IF NOT FOUND THEN
        IF v_is_service THEN
            RAISE EXCEPTION 'Khu vuc khong ton tai'
                USING ERRCODE = 'P0002';
        END IF;
        RAISE LOG 'luu_de_xuat_gia: tu choi (khu vuc khong ton tai) uid=% role=% khu_vuc=%',
            v_uid, v_role, p_khu_vuc_id;
        RAISE EXCEPTION 'Khong co quyen de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    IF NOT COALESCE(public.co_quyen_dinh_gia(v_su_kien_id), FALSE) THEN
        -- NOTE: no NHAT_KY_DINH_GIA row for permission errors. An INSERT followed by
        -- RAISE is rolled back, so the only trace is this server log line.
        RAISE LOG 'luu_de_xuat_gia: tu choi (khong co quyen) uid=% role=% khu_vuc=%',
            v_uid, v_role, p_khu_vuc_id;
        RAISE EXCEPTION 'Khong co quyen de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    -- ------------------------------------------------------------------
    -- Step 2 (locked, in order): KHU_VUC -> QUY_TAC_GIA -> DE_XUAT_GIA.
    -- ------------------------------------------------------------------
    SELECT kv."GiaVeNiemYet"
      INTO v_gia_hien
      FROM public."KHU_VUC" kv
      JOIN public."SUAT_DIEN" sd
        ON sd."SuatDienID" = kv."SuatDienID"
       AND sd."SuKienID" = kv."SuKienID"
     WHERE kv."KhuVucID" = p_khu_vuc_id
       AND kv."SuKienID" = v_su_kien_id
       AND kv."SuatDienID" = v_suat_dien_id
       FOR UPDATE OF kv;

    IF NOT FOUND THEN
        IF v_is_service THEN
            RAISE EXCEPTION 'Khu vuc khong con ton tai hoac da doi lien ket'
                USING ERRCODE = 'P0002';
        END IF;
        RAISE LOG 'luu_de_xuat_gia: tu choi (khu vuc doi lien ket) uid=% role=% khu_vuc=%',
            v_uid, v_role, p_khu_vuc_id;
        RAISE EXCEPTION 'Khong co quyen de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    SELECT TRUE, qt."QuyTacGiaID", qt."NgayCapNhat", qt."TrangThaiKichHoat",
           qt."GiaSan", qt."GiaTran", qt."BuocNhayGia", qt."BienDoToiDaMoiChuKy"
      INTO v_qt_found, v_qt_id, v_qt_ngay, v_kich_hoat,
           v_gia_san, v_gia_tran, v_buoc, v_bien_do
      FROM public."QUY_TAC_GIA" qt
     WHERE qt."KhuVucID" = p_khu_vuc_id
       FOR UPDATE;
    v_qt_found := COALESCE(v_qt_found, FALSE);

    -- Expire overdue PENDING proposals of this zone BEFORE the duplicate check.
    FOR v_dx_id IN
        SELECT dx."DeXuatID"
          FROM public."DE_XUAT_GIA" dx
         WHERE dx."KhuVucID" = p_khu_vuc_id
           AND dx."TrangThaiDuyet" = 'PENDING'
           AND dx."ThoiGianDeXuat" + INTERVAL '120 minutes' < now()
         ORDER BY dx."DeXuatID"
           FOR UPDATE
    LOOP
        v_expired := v_expired || v_dx_id;
    END LOOP;

    IF COALESCE(array_length(v_expired, 1), 0) > 0 THEN
        UPDATE public."DE_XUAT_GIA" dx
           SET "TrangThaiDuyet" = 'EXPIRED',
               "GhiChuDuyet" = 'HET_HAN_TTL_120_PHUT'
         WHERE dx."DeXuatID" = ANY (v_expired)
           AND dx."TrangThaiDuyet" = 'PENDING';
    END IF;

    -- Server-derived simulation flag (never from the client).
    SELECT COALESCE(LOWER(ch."TuyChonMoRong"->>'moPhong') = 'true', FALSE)
      INTO v_mo_phong
      FROM public."CAU_HINH_SU_KIEN" ch
     WHERE ch."SuKienID" = v_su_kien_id;
    v_mo_phong := COALESCE(v_mo_phong, FALSE);

    IF v_uid IS NOT NULL THEN
        SELECT tv."VaiTro"
          INTO v_vai_tro_to_chuc
          FROM public."SU_KIEN" sk
          JOIN public."THANH_VIEN_TO_CHUC" tv ON tv."ToChucID" = sk."ToChucID"
         WHERE sk."SuKienID" = v_su_kien_id
           AND tv."NguoiDungID" = v_uid
         LIMIT 1;
    END IF;

    -- Final proposed / raw-calculated prices. NULL, NaN, +-Infinity and precision
    -- overflow (NUMERIC(12,2) => ABS < 1e10 after ROUND) are invalid; the test on the
    -- RAW value uses IN (...) because 'NaN'::numeric = 'NaN'::numeric is TRUE in PG.
    v_gia_ok := COALESCE(
        p_gia_de_xuat IS NOT NULL
        AND p_gia_de_xuat NOT IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
        AND ABS(ROUND(p_gia_de_xuat, 2)) < 10000000000::NUMERIC,
        FALSE);
    v_tho_ok := COALESCE(
        p_gia_tinh_toan_tho IS NOT NULL
        AND p_gia_tinh_toan_tho NOT IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
        AND ABS(ROUND(p_gia_tinh_toan_tho, 2)) < 10000000000::NUMERIC,
        FALSE);
    IF v_gia_ok THEN
        v_p := ROUND(p_gia_de_xuat, 2);
        v_gia_thu := v_p;
    ELSIF p_gia_de_xuat IS NOT NULL
          AND p_gia_de_xuat NOT IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
          AND ABS(ROUND(p_gia_de_xuat, 2)) < 10000000000000::NUMERIC THEN
        v_gia_thu := ROUND(p_gia_de_xuat, 2);   -- finite, fits the audit column only
    END IF;
    IF v_tho_ok THEN
        v_tho := ROUND(p_gia_tinh_toan_tho, 2);
    END IF;

    -- ------------------------------------------------------------------
    -- Step 3: PriceGuard under the lock; stop at the first block code.
    -- ------------------------------------------------------------------
    IF NOT v_qt_found THEN
        v_ma := 'QUY_TAC_KHONG_TON_TAI';
        v_thong_diep := 'Khu vuc chua co quy tac gia';
    END IF;

    IF v_ma IS NULL AND p_quy_tac_gia_id IS DISTINCT FROM v_qt_id THEN
        v_ma := 'LIEN_KET_KHONG_HOP_LE';
        v_thong_diep := 'Quy tac gia khong thuoc khu vuc';
    END IF;

    IF v_ma IS NULL AND p_quy_tac_ngay_cap_nhat IS DISTINCT FROM v_qt_ngay THEN
        v_ma := 'QUY_TAC_DA_THAY_DOI';
        v_thong_diep := 'Quy tac gia da thay doi sau khi tinh de xuat';
    END IF;

    IF v_ma IS NULL AND NOT COALESCE(v_kich_hoat, FALSE) THEN
        v_ma := 'QUY_TAC_TAT';
        v_thong_diep := 'Quy tac gia dang tat';
    END IF;

    IF v_ma IS NULL THEN
        -- Called only after the permission check (the helper raises 42501 otherwise).
        v_dang_mo_ban := COALESCE(public.suat_dien_dang_mo_ban(v_su_kien_id, v_suat_dien_id), FALSE);
        IF NOT v_dang_mo_ban THEN
            v_ma := 'SUAT_DIEN_KHONG_MO_BAN';
            v_thong_diep := 'Suat dien khong dang mo ban';
        END IF;
    END IF;

    IF v_ma IS NULL AND NOT (v_gia_ok AND v_tho_ok) THEN
        v_ma := 'GIA_KHONG_HOP_LE';
        v_thong_diep := 'Gia de xuat hoac gia tinh toan tho la NULL, khong huu han hoac vuot do chinh xac';
    END IF;

    IF v_ma IS NULL AND (v_gia_hien IS NULL OR v_gia_hien <= 0 OR v_gia_hien >= 10000000000::NUMERIC) THEN
        -- <= 0: the swing cannot be computed; >= 1e10: does not fit DE_XUAT_GIA.GiaHienTai.
        v_ma := 'GIA_HIEN_HANH_KHONG_HOP_LE';
        v_thong_diep := 'Gia hien hanh khong hop le de tinh bien do';
    END IF;

    IF v_ma IS NULL AND (v_p < v_gia_san OR v_p > v_gia_tran) THEN
        v_ma := 'NGOAI_KHUNG_GIA';
        v_thong_diep := 'Gia de xuat nam ngoai khung [san, tran]';
    END IF;

    IF v_ma IS NULL THEN
        v_chenh := ABS(v_p - v_gia_hien);
        IF v_chenh > v_gia_hien * v_bien_do THEN
            v_ma := 'VUOT_BIEN_DO';
            v_thong_diep := 'Gia de xuat vuot bien do toi da moi chu ky';
        ELSIF v_chenh < v_buoc THEN
            v_ma := 'DUOI_BUOC_NHAY';
            v_thong_diep := 'Chenh lech gia nho hon buoc nhay gia';
        END IF;
    END IF;

    IF v_ma IS NULL THEN
        SELECT dx."DeXuatID"
          INTO v_pending_id
          FROM public."DE_XUAT_GIA" dx
         WHERE dx."KhuVucID" = p_khu_vuc_id
           AND dx."TrangThaiDuyet" = 'PENDING'
         ORDER BY dx."DeXuatID"
         LIMIT 1;
        IF FOUND THEN
            v_ma := 'DA_CO_PENDING';
            v_thong_diep := 'Khu vuc da co de xuat PENDING';
        END IF;
    END IF;

    -- Market metrics from the server (same source as lay_so_lieu_dinh_gia); never invented.
    IF v_ma IS NULL THEN
        SELECT m.n_total, m.n_sold, m.n_hold, m.v_actual, m.v_target, m.t_rem_gio
          INTO v_m
          FROM public.lay_so_lieu_dinh_gia(v_su_kien_id) m
         WHERE m.khu_vuc_id = p_khu_vuc_id;

        IF NOT FOUND
           OR v_m.n_total IS NULL OR v_m.n_total <= 0
           OR v_m.n_sold IS NULL OR v_m.n_hold IS NULL
           OR v_m.v_actual IS NULL OR v_m.v_target IS NULL OR v_m.t_rem_gio IS NULL THEN
            v_ma := 'THIEU_DU_LIEU';
            v_thong_diep := 'Thieu so lieu thi truong (tong ghe, toc do ky vong hoac gio con lai)';
        ELSE
            v_ty_le := ROUND(LEAST(GREATEST(
                (v_m.n_sold::NUMERIC + 0.5 * v_m.n_hold::NUMERIC) / v_m.n_total::NUMERIC,
                0), 1), 4);
            v_toc_do_thuc := ROUND(v_m.v_actual, 2);
            v_toc_do_ky_vong := ROUND(v_m.v_target, 2);
            v_gio_con_lai := ROUND(v_m.t_rem_gio, 2);
            -- NUMERIC(10,2) columns: ABS must stay below 1e8.
            IF v_toc_do_thuc >= 100000000::NUMERIC
               OR v_toc_do_ky_vong >= 100000000::NUMERIC
               OR v_gio_con_lai >= 100000000::NUMERIC THEN
                v_ma := 'THIEU_DU_LIEU';
                v_thong_diep := 'So lieu thi truong vuot do chinh xac cua cot';
            END IF;
        END IF;
    END IF;

    -- ------------------------------------------------------------------
    -- Save the proposal (still under the zone lock). The partial unique index is
    -- the last line of defence; a violation becomes a normal DA_CO_PENDING block.
    -- ------------------------------------------------------------------
    IF v_ma IS NULL THEN
        v_loai_canh_bao := CASE
            WHEN v_p = v_gia_tran THEN 'CHAM_GIA_TRAN'
            WHEN v_p = v_gia_san THEN 'CHAM_GIA_SAN'
            ELSE 'BINH_THUONG'
        END;

        -- Reason: strip any client-sent simulation prefix, then (and only then) let the
        -- server add it for simulated events.
        v_ly_do := NULLIF(BTRIM(regexp_replace(
            COALESCE(p_ly_do, ''), '^\s*(\[MÔ PHỎNG\]\s*)+', '', 'i')), '');
        IF v_mo_phong THEN
            v_ly_do := BTRIM('[MÔ PHỎNG] ' || COALESCE(v_ly_do, ''));
        END IF;

        BEGIN
            INSERT INTO public."DE_XUAT_GIA" (
                "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe",
                "TocDoBanKyVong", "SoGioConLai", "GiaHienTai", "GiaTinhToanTho",
                "GiaDeXuat", "CoCanhBaoVuotKhung", "LoaiCanhBao", "TrangThaiDuyet",
                "LyDoDeXuat", "ThoiGianDeXuat"
            ) VALUES (
                v_qt_id, p_khu_vuc_id, v_ty_le, v_toc_do_thuc,
                v_toc_do_ky_vong, v_gio_con_lai, v_gia_hien, v_tho,
                v_p, (v_loai_canh_bao <> 'BINH_THUONG'), v_loai_canh_bao, 'PENDING',
                v_ly_do, now()
            )
            RETURNING "DeXuatID" INTO v_de_xuat_id;
        EXCEPTION WHEN unique_violation THEN
            -- Only the partial PENDING index maps to DA_CO_PENDING (business block).
            -- Every other unique error (e.g. DeXuatID primary key) is re-raised as a
            -- database error: it rolls back and writes no audit row.
            GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
            IF v_constraint = 'uq_de_xuat_gia_pending_khu_vuc' THEN
                v_de_xuat_id := NULL;
            ELSE
                RAISE;
            END IF;
        END;

        IF v_de_xuat_id IS NULL THEN
            SELECT dx."DeXuatID"
              INTO v_pending_id
              FROM public."DE_XUAT_GIA" dx
             WHERE dx."KhuVucID" = p_khu_vuc_id
               AND dx."TrangThaiDuyet" = 'PENDING'
             ORDER BY dx."DeXuatID"
             LIMIT 1;
            v_ma := 'DA_CO_PENDING';
            v_thong_diep := 'Khu vuc da co de xuat PENDING';
        ELSE
            RETURN jsonb_build_object(
                'ketQua', 'DA_LUU',
                'deXuatId', v_de_xuat_id,
                'khuVucId', p_khu_vuc_id,
                'suKienId', v_su_kien_id,
                'giaDeXuat', v_p,
                'giaHienTai', v_gia_hien,
                'loaiCanhBao', v_loai_canh_bao,
                'moPhong', v_mo_phong,
                'deXuatHetHan', to_jsonb(v_expired)
            );
        END IF;
    END IF;

    -- ------------------------------------------------------------------
    -- Single audit point for EVERY blocked result: INSERT, then a NORMAL RETURN.
    -- Never RAISE after this INSERT (it would roll the audit row back).
    -- No NHAT_KY_GIA row, no DE_XUAT_GIA row, no price applied.
    -- ------------------------------------------------------------------
    v_tham_so := jsonb_build_object(
        'giaSan', v_gia_san,
        'giaTran', v_gia_tran,
        'bienDo', v_bien_do,
        'buocNhay', v_buoc,
        'kichHoat', v_kich_hoat,
        'dangMoBan', v_dang_mo_ban,
        'moPhong', v_mo_phong,
        'deXuatPendingId', v_pending_id,
        'quyTacNgayCapNhat', v_qt_ngay,
        'quyTacNgayCapNhatDauVao', p_quy_tac_ngay_cap_nhat,
        'quyTacGiaIdDauVao', p_quy_tac_gia_id,
        'giaDeXuatDauVao', p_gia_de_xuat::TEXT,
        'giaTinhToanThoDauVao', p_gia_tinh_toan_tho::TEXT,
        'lyDoDeXuatDauVao', LEFT(p_ly_do, 500)
    );

    INSERT INTO public."NHAT_KY_DINH_GIA" (
        "LoaiHanhDong", "KhuVucID", "SuatDienID", "SuKienID", "QuyTacGiaID",
        "KhuVucIDDauVao", "NguoiThucHienID", "VaiTroXacThuc", "VaiTroToChuc",
        "GiaHienHanh", "GiaThu", "ThamSo", "MaChan", "LyDo"
    ) VALUES (
        'CHAN_DE_XUAT', p_khu_vuc_id, v_suat_dien_id, v_su_kien_id, v_qt_id,
        p_khu_vuc_id, v_uid, v_role, v_vai_tro_to_chuc,
        v_gia_hien, v_gia_thu, v_tham_so, v_ma, v_thong_diep
    )
    RETURNING "NhatKyDinhGiaID" INTO v_nhat_ky_id;

    RETURN jsonb_build_object(
        'ketQua', 'BI_CHAN',
        'maChan', v_ma,
        'nhatKyId', v_nhat_ky_id,
        'deXuatHetHan', to_jsonb(v_expired)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.luu_de_xuat_gia(
    INT, BIGINT, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luu_de_xuat_gia(
    INT, BIGINT, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT
) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. het_han_de_xuat_gia: expire PENDING proposals past the 120-minute TTL
--    within an event the caller is authorized to price.
--    NOTE: NHAT_KY_DINH_GIA.LoaiHanhDong has no action type for TTL expiry
--    (the enum is locked by T2, and 'HET_HIEU_LUC_DO_DOI_KHUNG' is reserved
--    for frame narrowing), so TTL expiry is NOT audited in NHAT_KY_DINH_GIA;
--    it is recorded on DE_XUAT_GIA as TrangThaiDuyet = 'EXPIRED' and
--    GhiChuDuyet = 'HET_HAN_TTL_120_PHUT'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.het_han_de_xuat_gia(p_su_kien_id INT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role VARCHAR(30) := COALESCE(auth.role(), 'unknown');
    v_khu_vuc_ids INT[] := '{}';
    v_kv_id INT;
    v_expired BIGINT[] := '{}';
    v_dx_id BIGINT;
BEGIN
    -- Step 1 (unlocked): reject NULL event IDs or callers without pricing permission.
    -- NOTE: no NHAT_KY_DINH_GIA row for permission errors (INSERT + RAISE rolls back).
    IF p_su_kien_id IS NULL OR NOT COALESCE(public.co_quyen_dinh_gia(p_su_kien_id), FALSE) THEN
        RAISE LOG 'het_han_de_xuat_gia: tu choi (khong co quyen hoac su kien NULL) uid=% role=% su_kien=%',
            v_uid, v_role, p_su_kien_id;
        RAISE EXCEPTION 'Khong co quyen het han de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    -- Step 2 (locked, in T2 order): KHU_VUC (ascending KhuVucID) -> QUY_TAC_GIA -> DE_XUAT_GIA.
    FOR v_kv_id IN
        SELECT kv."KhuVucID"
          FROM public."KHU_VUC" kv
         WHERE kv."SuKienID" = p_su_kien_id
           AND EXISTS (
               SELECT 1
                 FROM public."DE_XUAT_GIA" dx
                WHERE dx."KhuVucID" = kv."KhuVucID"
                  AND dx."TrangThaiDuyet" = 'PENDING'
                  AND dx."ThoiGianDeXuat" + INTERVAL '120 minutes' < now()
           )
         ORDER BY kv."KhuVucID" ASC
           FOR UPDATE OF kv
    LOOP
        v_khu_vuc_ids := v_khu_vuc_ids || v_kv_id;
    END LOOP;

    IF COALESCE(array_length(v_khu_vuc_ids, 1), 0) > 0 THEN
        PERFORM qt."QuyTacGiaID"
          FROM public."QUY_TAC_GIA" qt
         WHERE qt."KhuVucID" = ANY (v_khu_vuc_ids)
         ORDER BY qt."KhuVucID" ASC
           FOR UPDATE;

        -- Re-verify PENDING and 120-minute TTL under the lock.
        FOR v_dx_id IN
            SELECT dx."DeXuatID"
              FROM public."DE_XUAT_GIA" dx
             WHERE dx."KhuVucID" = ANY (v_khu_vuc_ids)
               AND dx."TrangThaiDuyet" = 'PENDING'
               AND dx."ThoiGianDeXuat" + INTERVAL '120 minutes' < now()
             ORDER BY dx."DeXuatID" ASC
               FOR UPDATE
        LOOP
            v_expired := v_expired || v_dx_id;
        END LOOP;

        -- Only PENDING -> EXPIRED; leave NguoiDuyetID, ThoiGianDuyet, and other statuses untouched.
        IF COALESCE(array_length(v_expired, 1), 0) > 0 THEN
            UPDATE public."DE_XUAT_GIA" dx
               SET "TrangThaiDuyet" = 'EXPIRED',
                   "GhiChuDuyet" = 'HET_HAN_TTL_120_PHUT'
             WHERE dx."DeXuatID" = ANY (v_expired)
               AND dx."TrangThaiDuyet" = 'PENDING'
               AND dx."ThoiGianDeXuat" + INTERVAL '120 minutes' < now();
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'suKienId', p_su_kien_id,
        'deXuatHetHan', to_jsonb(v_expired),
        'soLuong', COALESCE(array_length(v_expired, 1), 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.het_han_de_xuat_gia(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.het_han_de_xuat_gia(INT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. End-of-file Assertions & Schema Cache Reload
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'DE_XUAT_GIA'
          AND indexname = 'uq_de_xuat_gia_pending_khu_vuc'
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: uq_de_xuat_gia_pending_khu_vuc index must exist';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('luu_de_xuat_gia', 'het_han_de_xuat_gia')
          AND p.prosecdef
    ) <> 2 THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: T3 pricing RPCs must be SECURITY DEFINER';
    END IF;

    IF has_function_privilege(
           'anon',
           'public.luu_de_xuat_gia(integer, bigint, timestamp with time zone, numeric, numeric, text)',
           'EXECUTE'
       )
       OR has_function_privilege(
           'anon',
           'public.het_han_de_xuat_gia(integer)',
           'EXECUTE'
       ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: anon can execute T3 pricing RPCs';
    END IF;

    IF NOT has_function_privilege(
           'authenticated',
           'public.luu_de_xuat_gia(integer, bigint, timestamp with time zone, numeric, numeric, text)',
           'EXECUTE'
       )
       OR NOT has_function_privilege(
           'service_role',
           'public.luu_de_xuat_gia(integer, bigint, timestamp with time zone, numeric, numeric, text)',
           'EXECUTE'
       )
       OR NOT has_function_privilege(
           'authenticated',
           'public.het_han_de_xuat_gia(integer)',
           'EXECUTE'
       )
       OR NOT has_function_privilege(
           'service_role',
           'public.het_han_de_xuat_gia(integer)',
           'EXECUTE'
       ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: authenticated/service_role missing EXECUTE on T3 pricing RPCs';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
