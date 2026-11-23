-- Sprint 2 - sua hai loi that tim thay khi kiem chung tren Supabase hosted (23/11/2026).
--
-- 1. Ma loi xung dot khi duyet/tu choi de xuat gia: 40001 -> PT409.
--    PostgREST tu dong thu lai moi RPC nem SQLSTATE 40001 (serialization_failure) cho den khi cong API tra
--    "upstream timeout" (~60 giay cuc bo, ~130 giay tren hosted). Nguoi thua cuoc dua "hai BTC cung duyet mot
--    de xuat" vi vay khong nhan duoc loi. Ma tuy bien PTnnn la co che co san cua PostgREST: PT409 tra ngay
--    HTTP 409 voi body {code, message, details}. Ten loi (DE_XUAT_DA_XU_LY, GIA_DA_THAY_DOI, DE_XUAT_XUNG_DOT),
--    DETAIL, khoa dong va thu tu khoa giu nguyen; chi doi ERRCODE. Hai ham duoc dinh nghia lai nguyen van
--    tu 20261114090000_sprint2_price_approval.sql (so ERRCODE doi: duyet 3, tu choi 2).
--
-- 2. Khoa doi gia truc tiep: BIEN_TAP va CHU_SO_HUU doi duoc KHU_VUC.GiaVeNiemYet bang REST truc tiep (policy
--    "Editors manage show zones" FOR ALL), vong qua PriceGuard, buoc duyet va NHAT_KY_GIA. Trigger moi chan
--    nguoi dung client (authenticated, anon) doi gia khi khu co QUY_TAC_GIA dang kich hoat; chi RPC duyet
--    (SECURITY DEFINER, chay voi vai tro chu so huu ham) doi duoc gia. Khu chua co quy tac van sua tay nhu Sprint 1.
--    Khong anh huong service_role va migration.

-- ----------------------------------------------------------------------------
-- 1. duyet_de_xuat_gia (ERRCODE 40001 -> PT409)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.duyet_de_xuat_gia(
    p_de_xuat_id BIGINT,
    p_ghi_chu TEXT,
    p_gia_dieu_chinh NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT := auth.role();
    v_kv_id INT;
    v_su_kien_id INT;
    v_kv_lock_id INT;
    v_gia_hien_hanh NUMERIC;
    v_qt_id BIGINT;
    v_gia_san NUMERIC;
    v_gia_tran NUMERIC;
    v_dx RECORD;
    v_gia_dieu_chinh NUMERIC;
    v_gia_cu NUMERIC;
    v_gia_moi NUMERIC;
    v_pct NUMERIC;
    v_ghi_chu TEXT := NULLIF(btrim(p_ghi_chu), '');
    v_loai TEXT;
    v_rows INT;
    v_nhat_ky_id BIGINT;
    v_now TIMESTAMPTZ;
BEGIN
    IF v_role = 'service_role' OR v_uid IS NULL THEN
        RAISE EXCEPTION 'Khong co quyen duyet de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    -- Step 1 (unlocked): resolve zone + event, then check ownership.
    SELECT dx."KhuVucID", kv."SuKienID"
      INTO v_kv_id, v_su_kien_id
      FROM public."DE_XUAT_GIA" dx
      JOIN public."KHU_VUC" kv
        ON kv."KhuVucID" = dx."KhuVucID"
     WHERE dx."DeXuatID" = p_de_xuat_id;

    IF NOT FOUND OR NOT EXISTS (
        SELECT 1
          FROM public."SU_KIEN" sk
          JOIN public."THANH_VIEN_TO_CHUC" tv
            ON tv."ToChucID" = sk."ToChucID"
          JOIN public."HO_SO_NGUOI_DUNG" hs
            ON hs."NguoiDungID" = tv."NguoiDungID"
         WHERE sk."SuKienID" = v_su_kien_id
           AND tv."NguoiDungID" = v_uid
           AND tv."VaiTro" IN ('CHU_SO_HUU', 'QUAN_TRI')
           AND hs."LoaiTaiKhoan" IN ('ORGANIZER', 'ADMIN')
    ) THEN
        RAISE EXCEPTION 'Khong co quyen duyet de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    -- Validate the adjusted price before taking locks (NULL is allowed).
    IF p_gia_dieu_chinh IS NOT NULL THEN
        IF p_gia_dieu_chinh IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC) THEN
            RAISE EXCEPTION 'GIA_DUYET_KHONG_HOP_LE'
                USING ERRCODE = '22023', DETAIL = 'Gia dieu chinh phai la so huu han';
        END IF;
        v_gia_dieu_chinh := ROUND(p_gia_dieu_chinh, 2);
    END IF;

    -- Step 2 (locked): KHU_VUC -> QUY_TAC_GIA -> DE_XUAT_GIA.
    SELECT kv."KhuVucID", kv."GiaVeNiemYet"
      INTO v_kv_lock_id, v_gia_hien_hanh
      FROM public."KHU_VUC" kv
     WHERE kv."KhuVucID" = v_kv_id
       AND kv."SuKienID" = v_su_kien_id
       FOR UPDATE OF kv;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Khong co quyen duyet de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    SELECT qt."QuyTacGiaID", qt."GiaSan", qt."GiaTran"
      INTO v_qt_id, v_gia_san, v_gia_tran
      FROM public."QUY_TAC_GIA" qt
     WHERE qt."KhuVucID" = v_kv_lock_id
       FOR UPDATE;

    SELECT dx."DeXuatID", dx."KhuVucID", dx."QuyTacGiaID", dx."TrangThaiDuyet",
           dx."GiaHienTai", dx."GiaDeXuat", dx."ThoiGianDeXuat", dx."LyDoDeXuat"
      INTO v_dx
      FROM public."DE_XUAT_GIA" dx
     WHERE dx."DeXuatID" = p_de_xuat_id
       FOR UPDATE;

    -- Step 3: re-verify the link and status under the locks.
    IF NOT FOUND
       OR v_qt_id IS NULL
       OR v_dx."KhuVucID" IS DISTINCT FROM v_kv_lock_id
       OR v_dx."QuyTacGiaID" IS DISTINCT FROM v_qt_id THEN
        RAISE EXCEPTION 'Khong co quyen duyet de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    IF v_dx."TrangThaiDuyet" <> 'PENDING' THEN
        RAISE EXCEPTION 'DE_XUAT_DA_XU_LY'
            USING ERRCODE = 'PT409', DETAIL = v_dx."TrangThaiDuyet";
    END IF;

    v_now := now();

    -- TTL predicate identical to het_han_de_xuat_gia. Normal RETURN so EXPIRED commits.
    IF v_dx."ThoiGianDeXuat" + INTERVAL '120 minutes' < now() THEN
        UPDATE public."DE_XUAT_GIA" dx
           SET "TrangThaiDuyet" = 'EXPIRED',
               "GhiChuDuyet" = 'HET_HAN_TTL_120_PHUT'
         WHERE dx."DeXuatID" = p_de_xuat_id
           AND dx."TrangThaiDuyet" = 'PENDING';

        RETURN jsonb_build_object(
            'ketQua', 'HET_HAN',
            'ma', 'DE_XUAT_HET_HAN',
            'deXuatId', p_de_xuat_id,
            'khuVucId', v_kv_lock_id,
            'suKienId', v_su_kien_id,
            'thoiGianDeXuat', v_dx."ThoiGianDeXuat",
            'hetHanLuc', v_dx."ThoiGianDeXuat" + INTERVAL '120 minutes'
        );
    END IF;

    -- Price checks under the lock.
    IF v_gia_hien_hanh IS DISTINCT FROM v_dx."GiaHienTai" THEN
        RAISE EXCEPTION 'GIA_DA_THAY_DOI'
            USING ERRCODE = 'PT409',
                  DETAIL = format('Gia hien hanh %s khac gia luc de xuat %s',
                                  v_gia_hien_hanh, v_dx."GiaHienTai");
    END IF;

    v_gia_cu := v_gia_hien_hanh;
    IF v_gia_cu <= 0 OR v_gia_cu >= 10000000000::NUMERIC THEN
        RAISE EXCEPTION 'GIA_HIEN_HANH_KHONG_HOP_LE'
            USING ERRCODE = '22023', DETAIL = 'Gia hien hanh phai > 0 va < 1e10';
    END IF;

    v_gia_moi := COALESCE(v_gia_dieu_chinh, v_dx."GiaDeXuat");

    IF v_gia_dieu_chinh IS NOT NULL AND v_ghi_chu IS NULL THEN
        RAISE EXCEPTION 'THIEU_LY_DO_DIEU_CHINH'
            USING ERRCODE = '22023', DETAIL = 'Dieu chinh gia thu cong can ly do';
    END IF;

    IF v_gia_moi < v_gia_san OR v_gia_moi > v_gia_tran THEN
        RAISE EXCEPTION 'NGOAI_KHUNG_GIA'
            USING ERRCODE = '22023',
                  DETAIL = jsonb_build_object('giaSan', v_gia_san, 'giaTran', v_gia_tran)::TEXT;
    END IF;

    IF v_gia_moi = v_gia_cu THEN
        RAISE EXCEPTION 'GIA_KHONG_THAY_DOI'
            USING ERRCODE = '22023', DETAIL = 'Gia moi bang gia hien hanh';
    END IF;

    v_pct := ROUND((v_gia_moi - v_gia_cu) / v_gia_cu * 100, 2);
    IF ABS(v_pct) >= 10000 THEN
        RAISE EXCEPTION 'TY_LE_THAY_DOI_VUOT_GIOI_HAN'
            USING ERRCODE = '22023', DETAIL = 'Ty le thay doi phan tram vuot do chinh xac cot';
    END IF;

    v_loai := CASE WHEN v_gia_dieu_chinh IS NOT NULL
                   THEN 'DIEU_CHINH_THU_CONG' ELSE 'DUYET_DE_XUAT_AI' END;

    -- Single transaction: price, proposal status and audit log together.
    UPDATE public."KHU_VUC" kv
       SET "GiaVeNiemYet" = v_gia_moi
     WHERE kv."KhuVucID" = v_kv_lock_id;

    UPDATE public."DE_XUAT_GIA" dx
       SET "TrangThaiDuyet" = 'APPROVED',
           "NguoiDuyetID" = v_uid,
           "ThoiGianDuyet" = v_now,
           "GhiChuDuyet" = v_ghi_chu
     WHERE dx."DeXuatID" = p_de_xuat_id
       AND dx."TrangThaiDuyet" = 'PENDING';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'DE_XUAT_XUNG_DOT'
            USING ERRCODE = 'PT409';
    END IF;

    INSERT INTO public."NHAT_KY_GIA" (
        "KhuVucID", "DeXuatID", "LoaiBienDong", "GiaCu", "GiaMoi",
        "TyLeThayDoiPhanTram", "LyDoThayDoi", "NguoiThucHienID", "ThoiGianApDung"
    )
    VALUES (
        v_kv_lock_id, p_de_xuat_id, v_loai, v_gia_cu, v_gia_moi,
        v_pct,
        COALESCE(v_ghi_chu, v_dx."LyDoDeXuat", 'DUYET_DE_XUAT_GIA'),
        v_uid, v_now
    )
    RETURNING "NhatKyGiaID" INTO v_nhat_ky_id;

    RETURN jsonb_build_object(
        'ketQua', 'DA_DUYET',
        'deXuatId', p_de_xuat_id,
        'khuVucId', v_kv_lock_id,
        'suKienId', v_su_kien_id,
        'giaCu', v_gia_cu,
        'giaMoi', v_gia_moi,
        'tyLeThayDoiPhanTram', v_pct,
        'loaiBienDong', v_loai,
        'nhatKyGiaId', v_nhat_ky_id,
        'nguoiDuyetId', v_uid,
        'thoiGianDuyet', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.duyet_de_xuat_gia(BIGINT, TEXT, NUMERIC) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.duyet_de_xuat_gia(BIGINT, TEXT, NUMERIC) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. tu_choi_de_xuat_gia (ERRCODE 40001 -> PT409)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tu_choi_de_xuat_gia(
    p_de_xuat_id BIGINT,
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
    v_role TEXT := auth.role();
    v_kv_id INT;
    v_su_kien_id INT;
    v_kv_lock_id INT;
    v_gia_hien_hanh NUMERIC;
    v_qt_id BIGINT;
    v_dx RECORD;
    v_ly_do TEXT := NULLIF(btrim(p_ly_do), '');
    v_rows INT;
    v_now TIMESTAMPTZ;
BEGIN
    IF v_role = 'service_role' OR v_uid IS NULL THEN
        RAISE EXCEPTION 'Khong co quyen tu choi de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    -- Step 1 (unlocked): resolve zone + event, then check ownership.
    SELECT dx."KhuVucID", kv."SuKienID"
      INTO v_kv_id, v_su_kien_id
      FROM public."DE_XUAT_GIA" dx
      JOIN public."KHU_VUC" kv
        ON kv."KhuVucID" = dx."KhuVucID"
     WHERE dx."DeXuatID" = p_de_xuat_id;

    IF NOT FOUND OR NOT EXISTS (
        SELECT 1
          FROM public."SU_KIEN" sk
          JOIN public."THANH_VIEN_TO_CHUC" tv
            ON tv."ToChucID" = sk."ToChucID"
          JOIN public."HO_SO_NGUOI_DUNG" hs
            ON hs."NguoiDungID" = tv."NguoiDungID"
         WHERE sk."SuKienID" = v_su_kien_id
           AND tv."NguoiDungID" = v_uid
           AND tv."VaiTro" IN ('CHU_SO_HUU', 'QUAN_TRI')
           AND hs."LoaiTaiKhoan" IN ('ORGANIZER', 'ADMIN')
    ) THEN
        RAISE EXCEPTION 'Khong co quyen tu choi de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    -- Step 2 (locked): KHU_VUC -> QUY_TAC_GIA -> DE_XUAT_GIA.
    SELECT kv."KhuVucID", kv."GiaVeNiemYet"
      INTO v_kv_lock_id, v_gia_hien_hanh
      FROM public."KHU_VUC" kv
     WHERE kv."KhuVucID" = v_kv_id
       AND kv."SuKienID" = v_su_kien_id
       FOR UPDATE OF kv;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Khong co quyen tu choi de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    SELECT qt."QuyTacGiaID"
      INTO v_qt_id
      FROM public."QUY_TAC_GIA" qt
     WHERE qt."KhuVucID" = v_kv_lock_id
       FOR UPDATE;

    SELECT dx."DeXuatID", dx."KhuVucID", dx."QuyTacGiaID", dx."TrangThaiDuyet",
           dx."ThoiGianDeXuat"
      INTO v_dx
      FROM public."DE_XUAT_GIA" dx
     WHERE dx."DeXuatID" = p_de_xuat_id
       FOR UPDATE;

    -- Re-verify the link and status under the locks.
    IF NOT FOUND
       OR v_qt_id IS NULL
       OR v_dx."KhuVucID" IS DISTINCT FROM v_kv_lock_id
       OR v_dx."QuyTacGiaID" IS DISTINCT FROM v_qt_id THEN
        RAISE EXCEPTION 'Khong co quyen tu choi de xuat gia'
            USING ERRCODE = '42501';
    END IF;

    IF v_dx."TrangThaiDuyet" <> 'PENDING' THEN
        RAISE EXCEPTION 'DE_XUAT_DA_XU_LY'
            USING ERRCODE = 'PT409', DETAIL = v_dx."TrangThaiDuyet";
    END IF;

    v_now := now();

    -- TTL predicate identical to het_han_de_xuat_gia. Normal RETURN so EXPIRED commits.
    IF v_dx."ThoiGianDeXuat" + INTERVAL '120 minutes' < now() THEN
        UPDATE public."DE_XUAT_GIA" dx
           SET "TrangThaiDuyet" = 'EXPIRED',
               "GhiChuDuyet" = 'HET_HAN_TTL_120_PHUT'
         WHERE dx."DeXuatID" = p_de_xuat_id
           AND dx."TrangThaiDuyet" = 'PENDING';

        RETURN jsonb_build_object(
            'ketQua', 'HET_HAN',
            'ma', 'DE_XUAT_HET_HAN',
            'deXuatId', p_de_xuat_id,
            'khuVucId', v_kv_lock_id,
            'suKienId', v_su_kien_id,
            'thoiGianDeXuat', v_dx."ThoiGianDeXuat",
            'hetHanLuc', v_dx."ThoiGianDeXuat" + INTERVAL '120 minutes'
        );
    END IF;

    -- Rejection: mark the proposal only. KHU_VUC price and NHAT_KY_GIA untouched.
    UPDATE public."DE_XUAT_GIA" dx
       SET "TrangThaiDuyet" = 'REJECTED',
           "NguoiDuyetID" = v_uid,
           "ThoiGianDuyet" = v_now,
           "GhiChuDuyet" = v_ly_do
     WHERE dx."DeXuatID" = p_de_xuat_id
       AND dx."TrangThaiDuyet" = 'PENDING';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'DE_XUAT_XUNG_DOT'
            USING ERRCODE = 'PT409';
    END IF;

    RETURN jsonb_build_object(
        'ketQua', 'DA_TU_CHOI',
        'deXuatId', p_de_xuat_id,
        'khuVucId', v_kv_lock_id,
        'suKienId', v_su_kien_id,
        'giaHienHanh', v_gia_hien_hanh,
        'nguoiDuyetId', v_uid,
        'thoiGianDuyet', v_now,
        'lyDo', v_ly_do
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tu_choi_de_xuat_gia(BIGINT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.tu_choi_de_xuat_gia(BIGINT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Khoa doi gia truc tiep khi khu co quy tac gia dang kich hoat
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiem_soat_doi_gia_truc_tiep()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW."GiaVeNiemYet" IS DISTINCT FROM OLD."GiaVeNiemYet"
       AND current_user IN ('authenticated', 'anon')
       AND EXISTS (
           SELECT 1
             FROM public."QUY_TAC_GIA" qt
            WHERE qt."KhuVucID" = OLD."KhuVucID"
              AND qt."TrangThaiKichHoat" IS TRUE
       ) THEN
        RAISE EXCEPTION 'GIA_DUOC_QUAN_LY_BOI_DINH_GIA'
            USING ERRCODE = '42501',
                  HINT = 'Khu nay co quy tac gia dang kich hoat; doi gia qua de xuat gia va buoc duyet.';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.kiem_soat_doi_gia_truc_tiep() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "trg_kiem_soat_doi_gia_truc_tiep" ON public."KHU_VUC";
CREATE TRIGGER "trg_kiem_soat_doi_gia_truc_tiep"
    BEFORE UPDATE OF "GiaVeNiemYet" ON public."KHU_VUC"
    FOR EACH ROW
    EXECUTE FUNCTION public.kiem_soat_doi_gia_truc_tiep();

-- ----------------------------------------------------------------------------
-- 4. Tu kiem tra cuoi file
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_def TEXT;
BEGIN
    FOR v_def IN
        SELECT pg_get_functiondef(p.oid)
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('duyet_de_xuat_gia', 'tu_choi_de_xuat_gia')
    LOOP
        IF v_def LIKE '%ERRCODE = ''40001''%' THEN
            RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: price approval RPC still raises 40001';
        END IF;
        IF v_def NOT LIKE '%ERRCODE = ''PT409''%' THEN
            RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: price approval RPC does not raise PT409';
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_kiem_soat_doi_gia_truc_tiep'
           AND tgrelid = 'public."KHU_VUC"'::regclass
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: direct price guard trigger missing';
    END IF;

    IF has_function_privilege('anon', 'public.duyet_de_xuat_gia(bigint, text, numeric)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.duyet_de_xuat_gia(bigint, text, numeric)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.duyet_de_xuat_gia(bigint, text, numeric)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.tu_choi_de_xuat_gia(bigint, text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.tu_choi_de_xuat_gia(bigint, text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.tu_choi_de_xuat_gia(bigint, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: price approval RPC privileges changed';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
