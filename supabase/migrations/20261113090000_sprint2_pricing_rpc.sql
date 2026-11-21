-- ============================================================================
-- Migration: 20261113090000_sprint2_pricing_rpc.sql
-- Purpose: Sprint 2 / T2 — Pricing authorization helper, shared open-for-sale
--   helper, pricing configuration & narrowing RPC, pricing metrics RPC, and
--   the shared W2 pricing audit log (NHAT_KY_DINH_GIA).
--   Does NOT modify W1 migrations (20261112090000/100000/110000) or earlier
--   migrations. Safe to replay (idempotent).
--
-- ============================================================================
-- CONTRACT FOR T3-T8 (LOCKED BY T2)
-- ============================================================================
--
-- 1. Function Signatures & Privileges:
--    - public.co_quyen_dinh_gia(p_su_kien_id INT) RETURNS BOOLEAN
--        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--    - public.suat_dien_dang_mo_ban(p_su_kien_id INT, p_suat_dien_id BIGINT) RETURNS BOOLEAN
--        LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
--    - public.lay_so_lieu_dinh_gia(p_su_kien_id INT) RETURNS TABLE (
--        khu_vuc_id INT, suat_dien_id BIGINT, su_kien_id INT,
--        ma_khu_vuc VARCHAR(50), ten_khu_vuc VARCHAR(150),
--        trang_thai_suat VARCHAR(30), thoi_gian_mo_ban TIMESTAMPTZ,
--        thoi_gian_dong_ban TIMESTAMPTZ, thoi_gian_bat_dau TIMESTAMPTZ,
--        dang_mo_ban BOOLEAN, gia_hien_hanh NUMERIC(15,2),
--        quy_tac_gia_id BIGINT, co_quy_tac BOOLEAN, kich_hoat BOOLEAN,
--        gia_goc NUMERIC(12,2), gia_san NUMERIC(12,2), gia_tran NUMERIC(12,2),
--        buoc_nhay NUMERIC(12,2), bien_do NUMERIC(5,4),
--        nguong_thap NUMERIC(5,4), nguong_cao NUMERIC(5,4),
--        trong_so_lap_day NUMERIC(5,4), trong_so_toc_do NUMERIC(5,4),
--        trong_so_thoi_gian NUMERIC(5,4),
--        n_total INT, n_sold INT, n_hold INT, so_ban_6h INT,
--        v_actual NUMERIC, t_rem_gio NUMERIC, tong_gio_mo_ban NUMERIC,
--        v_target NUMERIC, de_xuat_pending_id BIGINT, co_pending BOOLEAN,
--        mo_phong BOOLEAN, thoi_diem_tinh TIMESTAMPTZ
--      )
--        LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
--    - public.luu_quy_tac_gia(
--        p_khu_vuc_id INT, p_gia_goc NUMERIC, p_gia_san NUMERIC, p_gia_tran NUMERIC,
--        p_buoc_nhay_gia NUMERIC, p_bien_do_toi_da NUMERIC,
--        p_nguong_lap_day_thap NUMERIC, p_nguong_lap_day_cao NUMERIC,
--        p_trong_so_lap_day NUMERIC, p_trong_so_toc_do_ban NUMERIC,
--        p_trong_so_thoi_gian NUMERIC, p_trang_thai_kich_hoat BOOLEAN
--      ) RETURNS JSONB
--        LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
--    - Client RPCs & helpers: REVOKE ALL FROM PUBLIC, anon;
--      GRANT EXECUTE TO authenticated, service_role.
--    - Trigger function public.chan_sua_xoa_nhat_ky_dinh_gia():
--      SECURITY INVOKER, SET search_path = public,
--      REVOKE ALL FROM PUBLIC, anon, authenticated.
--
-- 2. Identity & Error Codes:
--    - Caller identity comes ONLY from auth.uid() and auth.role(); no identity
--      parameter is accepted. A direct postgres connection without JWT claims
--      evaluates co_quyen_dinh_gia() to FALSE.
--    - 42501: insufficient privilege, and ALSO when a non-service_role caller
--      passes a non-existent event or zone (prevents existence probing). Also
--      raised by chan_sua_xoa_nhat_ky_dinh_gia() on UPDATE/DELETE/TRUNCATE.
--    - P0002: raised when service_role passes a zone that does not exist.
--    - 22023: invalid input in luu_quy_tac_gia with MESSAGE
--      'QUY_TAC_GIA_KHONG_HOP_LE: <field>' and DETAIL naming the parameter,
--      covering NULL, NaN, +/-Infinity (v IN ('NaN'::numeric, 'Infinity'::numeric,
--      '-Infinity'::numeric)), column precision overflow, and domain bounds.
--
-- 3. Lock Order (mandatory for T2 and T3+ to prevent deadlocks):
--    - Step 1 (unlocked): look up KHU_VUC + SUAT_DIEN (ensuring sd.SuKienID = kv.SuKienID)
--      to resolve SuKienID, then call co_quyen_dinh_gia(SuKienID) BEFORE locking.
--    - Step 2 (locked, in order):
--        a) Lock KHU_VUC FOR UPDATE (multi-zone ops MUST lock in ascending KhuVucID)
--           — locking KHU_VUC protects even the very first rule creation.
--        b) Lock QUY_TAC_GIA FOR UPDATE (if row already exists).
--        c) Lock DE_XUAT_GIA rows to update FOR UPDATE ORDER BY "DeXuatID".
--    - Step 3: re-read / re-verify configuration and links under the lock.
--
-- 4. Shared Open-for-Sale Condition (T2/T3/T4/T6/T7/T8):
--    - Evaluates server data using now(). NEVER uses SU_KIEN.TrangThaiMoBan and
--      does NOT require SUAT_DIEN.TrangThai = 'DANG_MO_BAN' (SAP_MO_BAN inside the
--      sale window is open for sale). Missing/invalid data returns FALSE.
--      +/-infinity in ThoiGianMoBanVe / ThoiGianDongBanVe is invalid, so returns FALSE;
--      a NULL close time is still valid (open-ended sale).
--    - Exact parenthesized predicate:
--        COALESCE(
--          (sk."TrangThaiCongBo" = 'CONG_KHAI')
--          AND (sd."TrangThai" IS NOT NULL AND sd."TrangThai" NOT IN ('BAN_NHAP', 'HUY', 'DONG_BAN', 'DA_DIEN_RA', 'HET_VE'))
--          AND (sd."ThoiGianMoBanVe" IS NOT NULL AND isfinite(sd."ThoiGianMoBanVe") AND now() >= sd."ThoiGianMoBanVe")
--          AND (sd."ThoiGianDongBanVe" IS NULL OR (isfinite(sd."ThoiGianDongBanVe") AND sd."ThoiGianDongBanVe" > sd."ThoiGianMoBanVe" AND now() < sd."ThoiGianDongBanVe")),
--          FALSE
--        )
--
-- 5. Shared Pricing Metrics Contract (lay_so_lieu_dinh_gia for T3/T4/T6/T7/T8):
--    - Per-zone, per-show aggregation in separate LATERAL subqueries (never joins
--      GHE and CHI_TIET_GIU_CHO together, preventing JOIN fan-out).
--    - n_total = kv."TongSoGhe"
--    - n_sold = COUNT(GHE) WHERE TrangThai = 'DA_BAN'
--    - n_hold = COALESCE(SUM(ct."SoLuong"), 0) over CHI_TIET_GIU_CHO JOIN GIU_CHO
--      WHERE gc."SuKienID" = kv."SuKienID" AND gc."SuatDienID" = kv."SuatDienID"
--      AND gc."TrangThai" = 'ACTIVE' AND gc."HetHanLuc" > now() (includes GheID NULL)
--    - so_ban_6h = COUNT(GHE) WHERE TrangThai = 'DA_BAN' AND
--      NgayCapNhatTrangThai BETWEEN now() - INTERVAL '6 hours' AND now()
--      (NULL timestamps are excluded and never fabricated)
--    - v_actual = so_ban_6h::NUMERIC / 6.0
--    - Infinite timestamps (+/-infinity) count as INVALID: time metrics are NULL (never an
--      error, never 0) and the helper returns FALSE. Every subtraction sits in a THEN
--      branch, guarded by isfinite(). If ThoiGianDongBanVe is infinite the result is NULL
--      and does NOT fall back to ThoiGianBatDau. W1 chk_suatdien_banve (Dong > Mo) and
--      chk_suatdien_thoigian (KetThuc > BatDau) make Dong=-infinity and BatDau=+infinity
--      impossible, but the code still guards them with isfinite().
--    - t_rem_gio = GREATEST(EXTRACT(EPOCH FROM (sd."ThoiGianBatDau" - now())) / 3600.0, 0)
--      when ThoiGianBatDau IS NOT NULL AND isfinite(ThoiGianBatDau); else NULL
--    - tong_gio_mo_ban = EXTRACT(EPOCH FROM (COALESCE(sd."ThoiGianDongBanVe", sd."ThoiGianBatDau") - sd."ThoiGianMoBanVe")) / 3600.0
--      when ThoiGianMoBanVe IS NOT NULL AND isfinite(ThoiGianMoBanVe) AND
--      isfinite(COALESCE(ThoiGianDongBanVe, ThoiGianBatDau)) AND
--      COALESCE(ThoiGianDongBanVe, ThoiGianBatDau) > ThoiGianMoBanVe;
--      else NULL (never 0 or invented, so pricingEngine treats it as missing data)
--    - v_target = n_total / tong_gio_mo_ban when tong_gio_mo_ban IS NOT NULL (same
--      guards as tong_gio_mo_ban); else NULL (never 0 or invented)
--    - co_quy_tac = (qt."QuyTacGiaID" IS NOT NULL); kich_hoat = COALESCE(qt."TrangThaiKichHoat", FALSE)
--    - de_xuat_pending_id = latest PENDING proposal for kv."KhuVucID"; co_pending = (de_xuat_pending_id IS NOT NULL)
--    - mo_phong = COALESCE(LOWER(ch."TuyChonMoRong"->>'moPhong') = 'true', FALSE)
--
-- 6. Audit Log NHAT_KY_DINH_GIA & No-FK Design (T2 & T3):
--    - Unified W2 audit table for LoaiHanhDong IN (
--        'TAO_QUY_TAC', 'CAP_NHAT_QUY_TAC',
--        'HET_HIEU_LUC_DO_DOI_KHUNG', 'CHAN_DE_XUAT'
--      ).
--    - Does NOT modify NHAT_KY_GIA.chk_loai_bien_dong or NHAT_KY_GIA's ON DELETE
--      RESTRICT foreign keys, and never writes fake price-application entries to
--      NHAT_KY_GIA.
--    - Historical IDs (KhuVucID, SuatDienID, SuKienID, QuyTacGiaID, DeXuatID,
--      NguoiThucHienID) carry NO foreign keys and NO UNIQUE constraints:
--      * Cross-check 20261028100000 lines 481-569: the organizer save RPC deletes
--        omitted GHE, KHU_VUC, and SUAT_DIEN when no holds/sold seats/active
--        inventory exist, and QUY_TAC_GIA / DE_XUAT_GIA CASCADE on KHU_VUC delete.
--      * Because NHAT_KY_DINH_GIA has zero FKs to KHU_VUC, DE_XUAT_GIA, SU_KIEN,
--        or HO_SO_NGUOI_DUNG, saving a pricing rule NEVER blocks an organizer from
--        deleting an eligible zone or show, and deleting a zone, proposal, show,
--        or event NEVER deletes or mutates historical audit rows.
--    - CHAN_DE_XUAT contract for T3 (T3 only INSERTs; no schema change needed):
--      * MaChan REQUIRED, non-blank (CHECK chk_nhatky_dinhgia_chan_de_xuat); LyDo optional text.
--      * KhuVucID / SuatDienID / SuKienID / QuyTacGiaID / DeXuatID hold ONLY IDs verified
--        against real relations under the zone lock. Rejected or unverifiable input IDs go
--        to KhuVucIDDauVao / DeXuatIDDauVao (raw), never into the verified columns.
--      * SuKienID is set only when verified; otherwise NULL, which means the row is
--        visible to service_role only (RLS policy requires a verified SuKienID).
--      * Allowed with NO applied price: GiaHienHanh / GiaThu may be NULL; nothing is
--        written to NHAT_KY_GIA.
--      * Multiple CHAN_DE_XUAT rows for the same zone or proposal are allowed (no UNIQUE).
--      * ThamSo (JSONB, default '{}') carries the engine inputs; NguoiThucHienID is
--        auth.uid() (NULL for service_role); VaiTroXacThuc is auth.role().
--    - Verified vs. raw IDs: RPCs must verify real relational links before writing
--      verified IDs (KhuVucID, SuatDienID, SuKienID, QuyTacGiaID, DeXuatID) and
--      record raw/unverified or rejected input IDs in KhuVucIDDauVao / DeXuatIDDauVao.
--    - RLS SELECT policy uses the server-verified SuKienID -> SU_KIEN ->
--      la_thanh_vien_to_chuc(ToChucID). Deleting a zone or proposal does NOT remove
--      member read access; if SU_KIEN is deleted, authenticated loses read access
--      while the audit row remains preserved.
--
-- 7. EXPIRED-on-Narrowing Contract (luu_quy_tac_gia):
--    - When [GiaSan, GiaTran] narrows, if KHU_VUC.GiaVeNiemYet falls outside the
--      new frame, return warning GIA_HIEN_HANH_NGOAI_KHUNG without changing GiaVeNiemYet.
--    - Immediately expire ONLY PENDING proposals for that zone where
--      GiaDeXuat < new GiaSan OR GiaDeXuat > new GiaTran (values equal to GiaSan
--      or GiaTran remain PENDING; all non-PENDING statuses are untouched).
--    - Ignore the 120-minute TTL; set TrangThaiDuyet = 'EXPIRED',
--      GhiChuDuyet = 'CAU_HINH_THU_HEP_KHUNG', NguoiDuyetID = NULL,
--      ThoiGianDuyet = NULL. Do NOT use REJECTED or modify chk_trang_thai_duyet.
--    - Insert one HET_HIEU_LUC_DO_DOI_KHUNG audit row per expired proposal in the
--      same transaction with DeXuatID, KhuVucID, DuLieuTruoc, DuLieuSau, and LyDo.
--
-- Verification note:
--   `npm run check` validates TypeScript, Node tests, and Vite build only;
--   it does NOT execute SQL and does NOT prove this migration ran.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Unified W2 Pricing Audit Log: public."NHAT_KY_DINH_GIA"
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."NHAT_KY_DINH_GIA" (
    "NhatKyDinhGiaID" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    "LoaiHanhDong" VARCHAR(40) NOT NULL,
    "KhuVucID" INT,
    "SuatDienID" BIGINT,
    "SuKienID" INT,
    "QuyTacGiaID" BIGINT,
    "DeXuatID" BIGINT,
    "KhuVucIDDauVao" INT,
    "DeXuatIDDauVao" BIGINT,
    "NguoiThucHienID" UUID,
    "VaiTroXacThuc" VARCHAR(30) NOT NULL,
    "VaiTroToChuc" VARCHAR(20),
    "ThoiGian" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "DuLieuTruoc" JSONB,
    "DuLieuSau" JSONB,
    "GiaHienHanh" NUMERIC(15,2),
    "GiaThu" NUMERIC(15,2),
    "ThamSo" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "MaChan" VARCHAR(40),
    "LyDo" TEXT,
    CONSTRAINT "chk_nhatky_dinhgia_loai_hanh_dong" CHECK (
        "LoaiHanhDong" IN (
            'TAO_QUY_TAC',
            'CAP_NHAT_QUY_TAC',
            'HET_HIEU_LUC_DO_DOI_KHUNG',
            'CHAN_DE_XUAT'
        )
    ),
    CONSTRAINT "chk_nhatky_dinhgia_chan_de_xuat" CHECK (
        "LoaiHanhDong" <> 'CHAN_DE_XUAT'
        OR ("MaChan" IS NOT NULL AND BTRIM("MaChan") <> '')
    ),
    CONSTRAINT "chk_nhatky_dinhgia_het_hieu_luc" CHECK (
        "LoaiHanhDong" <> 'HET_HIEU_LUC_DO_DOI_KHUNG'
        OR (
            "DeXuatID" IS NOT NULL
            AND "KhuVucID" IS NOT NULL
            AND "DuLieuTruoc" IS NOT NULL
            AND "DuLieuSau" IS NOT NULL
            AND "LyDo" IS NOT NULL
            AND BTRIM("LyDo") <> ''
        )
    ),
    CONSTRAINT "chk_nhatky_dinhgia_quy_tac" CHECK (
        "LoaiHanhDong" NOT IN ('TAO_QUY_TAC', 'CAP_NHAT_QUY_TAC')
        OR (
            "KhuVucID" IS NOT NULL
            AND "SuKienID" IS NOT NULL
            AND "DuLieuSau" IS NOT NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS "idx_nhatky_dinhgia_sukien"
    ON public."NHAT_KY_DINH_GIA" ("SuKienID");

CREATE INDEX IF NOT EXISTS "idx_nhatky_dinhgia_khuvuc"
    ON public."NHAT_KY_DINH_GIA" ("KhuVucID");

CREATE INDEX IF NOT EXISTS "idx_nhatky_dinhgia_dexuat"
    ON public."NHAT_KY_DINH_GIA" ("DeXuatID");

ALTER TABLE public."NHAT_KY_DINH_GIA" ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public."NHAT_KY_DINH_GIA" FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public."NHAT_KY_DINH_GIA" FROM PUBLIC, anon;
GRANT SELECT ON public."NHAT_KY_DINH_GIA" TO authenticated;

-- Policy depends ONLY on verified SuKienID -> SU_KIEN -> la_thanh_vien_to_chuc;
-- deleting KHU_VUC or DE_XUAT_GIA never revokes member read access.
DROP POLICY IF EXISTS "Thanh vien to chuc doc nhat ky dinh gia" ON public."NHAT_KY_DINH_GIA";
CREATE POLICY "Thanh vien to chuc doc nhat ky dinh gia"
    ON public."NHAT_KY_DINH_GIA"
    FOR SELECT
    TO authenticated
    USING (
        "NHAT_KY_DINH_GIA"."SuKienID" IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public."SU_KIEN" sk
            WHERE sk."SuKienID" = "NHAT_KY_DINH_GIA"."SuKienID"
              AND public.la_thanh_vien_to_chuc(sk."ToChucID")
        )
    );

CREATE OR REPLACE FUNCTION public.chan_sua_xoa_nhat_ky_dinh_gia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'NHAT_KY_DINH_GIA la nhat ky bat bien: khong cho phep %', TG_OP
        USING ERRCODE = '42501',
              HINT = 'Ghi bo sung ban ghi moi thay vi sua/xoa';
END;
$$;

REVOKE ALL ON FUNCTION public.chan_sua_xoa_nhat_ky_dinh_gia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chan_sua_xoa_nhat_ky_dinh_gia ON public."NHAT_KY_DINH_GIA";
CREATE TRIGGER trg_chan_sua_xoa_nhat_ky_dinh_gia
    BEFORE UPDATE OR DELETE ON public."NHAT_KY_DINH_GIA"
    FOR EACH ROW
    EXECUTE FUNCTION public.chan_sua_xoa_nhat_ky_dinh_gia();

DROP TRIGGER IF EXISTS trg_chan_truncate_nhat_ky_dinh_gia ON public."NHAT_KY_DINH_GIA";
CREATE TRIGGER trg_chan_truncate_nhat_ky_dinh_gia
    BEFORE TRUNCATE ON public."NHAT_KY_DINH_GIA"
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.chan_sua_xoa_nhat_ky_dinh_gia();

-- ----------------------------------------------------------------------------
-- 2. Pricing Authorization Helper: public.co_quyen_dinh_gia(INT)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.co_quyen_dinh_gia(p_su_kien_id INT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(auth.role() = 'service_role', FALSE)
        OR (
            p_su_kien_id IS NOT NULL
            AND auth.uid() IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public."SU_KIEN" sk
                JOIN public."THANH_VIEN_TO_CHUC" tv ON tv."ToChucID" = sk."ToChucID"
                JOIN public."HO_SO_NGUOI_DUNG" hs ON hs."NguoiDungID" = tv."NguoiDungID"
                WHERE sk."SuKienID" = p_su_kien_id
                  AND tv."NguoiDungID" = auth.uid()
                  AND hs."LoaiTaiKhoan" IN ('ORGANIZER', 'ADMIN')
                  AND tv."VaiTro" IN ('CHU_SO_HUU', 'QUAN_TRI')
            )
        );
$$;

REVOKE ALL ON FUNCTION public.co_quyen_dinh_gia(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.co_quyen_dinh_gia(INT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Shared Open-for-Sale Helper: public.suat_dien_dang_mo_ban(INT, BIGINT)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suat_dien_dang_mo_ban(
    p_su_kien_id INT,
    p_suat_dien_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_open BOOLEAN;
BEGIN
    IF NOT COALESCE(public.co_quyen_dinh_gia(p_su_kien_id), FALSE) THEN
        RAISE EXCEPTION 'Khong co quyen truy cap du lieu dinh gia cua su kien'
            USING ERRCODE = '42501';
    END IF;

    IF p_su_kien_id IS NULL OR p_suat_dien_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT COALESCE(
        (
            (sk."TrangThaiCongBo" = 'CONG_KHAI')
            AND (sd."TrangThai" IS NOT NULL AND sd."TrangThai" NOT IN ('BAN_NHAP', 'HUY', 'DONG_BAN', 'DA_DIEN_RA', 'HET_VE'))
            AND (sd."ThoiGianMoBanVe" IS NOT NULL AND isfinite(sd."ThoiGianMoBanVe") AND now() >= sd."ThoiGianMoBanVe")
            AND (sd."ThoiGianDongBanVe" IS NULL OR (isfinite(sd."ThoiGianDongBanVe") AND sd."ThoiGianDongBanVe" > sd."ThoiGianMoBanVe" AND now() < sd."ThoiGianDongBanVe"))
        ),
        FALSE
    )
    INTO v_open
    FROM public."SUAT_DIEN" sd
    JOIN public."SU_KIEN" sk ON sk."SuKienID" = sd."SuKienID"
    WHERE sd."SuatDienID" = p_suat_dien_id
      AND sd."SuKienID" = p_su_kien_id;

    RETURN COALESCE(v_open, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.suat_dien_dang_mo_ban(INT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suat_dien_dang_mo_ban(INT, BIGINT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Pricing Metrics RPC: public.lay_so_lieu_dinh_gia(INT)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lay_so_lieu_dinh_gia(p_su_kien_id INT)
RETURNS TABLE (
    khu_vuc_id INT,
    suat_dien_id BIGINT,
    su_kien_id INT,
    ma_khu_vuc VARCHAR(50),
    ten_khu_vuc VARCHAR(150),
    trang_thai_suat VARCHAR(30),
    thoi_gian_mo_ban TIMESTAMPTZ,
    thoi_gian_dong_ban TIMESTAMPTZ,
    thoi_gian_bat_dau TIMESTAMPTZ,
    dang_mo_ban BOOLEAN,
    gia_hien_hanh NUMERIC(15,2),
    quy_tac_gia_id BIGINT,
    co_quy_tac BOOLEAN,
    kich_hoat BOOLEAN,
    gia_goc NUMERIC(12,2),
    gia_san NUMERIC(12,2),
    gia_tran NUMERIC(12,2),
    buoc_nhay NUMERIC(12,2),
    bien_do NUMERIC(5,4),
    nguong_thap NUMERIC(5,4),
    nguong_cao NUMERIC(5,4),
    trong_so_lap_day NUMERIC(5,4),
    trong_so_toc_do NUMERIC(5,4),
    trong_so_thoi_gian NUMERIC(5,4),
    n_total INT,
    n_sold INT,
    n_hold INT,
    so_ban_6h INT,
    v_actual NUMERIC,
    t_rem_gio NUMERIC,
    tong_gio_mo_ban NUMERIC,
    v_target NUMERIC,
    de_xuat_pending_id BIGINT,
    co_pending BOOLEAN,
    mo_phong BOOLEAN,
    thoi_diem_tinh TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
BEGIN
    IF NOT COALESCE(public.co_quyen_dinh_gia(p_su_kien_id), FALSE) THEN
        RAISE EXCEPTION 'Khong co quyen xem so lieu dinh gia cua su kien'
            USING ERRCODE = '42501';
    END IF;

    IF p_su_kien_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        kv."KhuVucID" AS khu_vuc_id,
        sd."SuatDienID" AS suat_dien_id,
        kv."SuKienID" AS su_kien_id,
        kv."MaKhuVuc" AS ma_khu_vuc,
        kv."TenKhuVuc" AS ten_khu_vuc,
        sd."TrangThai" AS trang_thai_suat,
        sd."ThoiGianMoBanVe" AS thoi_gian_mo_ban,
        sd."ThoiGianDongBanVe" AS thoi_gian_dong_ban,
        sd."ThoiGianBatDau" AS thoi_gian_bat_dau,
        public.suat_dien_dang_mo_ban(p_su_kien_id, sd."SuatDienID") AS dang_mo_ban,
        kv."GiaVeNiemYet" AS gia_hien_hanh,
        qt."QuyTacGiaID" AS quy_tac_gia_id,
        (qt."QuyTacGiaID" IS NOT NULL) AS co_quy_tac,
        COALESCE(qt."TrangThaiKichHoat", FALSE) AS kich_hoat,
        qt."GiaGoc" AS gia_goc,
        qt."GiaSan" AS gia_san,
        qt."GiaTran" AS gia_tran,
        qt."BuocNhayGia" AS buoc_nhay,
        qt."BienDoToiDaMoiChuKy" AS bien_do,
        qt."NguongLapDayThap" AS nguong_thap,
        qt."NguongLapDayCao" AS nguong_cao,
        qt."TrongSoLapDay" AS trong_so_lap_day,
        qt."TrongSoTocDoBan" AS trong_so_toc_do,
        qt."TrongSoThoiGian" AS trong_so_thoi_gian,
        kv."TongSoGhe" AS n_total,
        COALESCE(gs.n_sold, 0) AS n_sold,
        COALESCE(gh.n_hold, 0) AS n_hold,
        COALESCE(gs.so_ban_6h, 0) AS so_ban_6h,
        (COALESCE(gs.so_ban_6h, 0)::NUMERIC / 6.0) AS v_actual,
        CASE
            WHEN sd."ThoiGianBatDau" IS NOT NULL AND isfinite(sd."ThoiGianBatDau")
            THEN GREATEST(EXTRACT(EPOCH FROM (sd."ThoiGianBatDau" - v_now)) / 3600.0, 0)::NUMERIC
            ELSE NULL
        END AS t_rem_gio,
        CASE
            WHEN sd."ThoiGianMoBanVe" IS NOT NULL AND isfinite(sd."ThoiGianMoBanVe")
                 AND isfinite(COALESCE(sd."ThoiGianDongBanVe", sd."ThoiGianBatDau"))
                 AND COALESCE(sd."ThoiGianDongBanVe", sd."ThoiGianBatDau") > sd."ThoiGianMoBanVe"
            THEN (EXTRACT(EPOCH FROM (COALESCE(sd."ThoiGianDongBanVe", sd."ThoiGianBatDau") - sd."ThoiGianMoBanVe")) / 3600.0)::NUMERIC
            ELSE NULL
        END AS tong_gio_mo_ban,
        CASE
            WHEN sd."ThoiGianMoBanVe" IS NOT NULL AND isfinite(sd."ThoiGianMoBanVe")
                 AND isfinite(COALESCE(sd."ThoiGianDongBanVe", sd."ThoiGianBatDau"))
                 AND COALESCE(sd."ThoiGianDongBanVe", sd."ThoiGianBatDau") > sd."ThoiGianMoBanVe"
            THEN (
                kv."TongSoGhe"::NUMERIC
                / (EXTRACT(EPOCH FROM (COALESCE(sd."ThoiGianDongBanVe", sd."ThoiGianBatDau") - sd."ThoiGianMoBanVe")) / 3600.0)
            )::NUMERIC
            ELSE NULL
        END AS v_target,
        pd."DeXuatID" AS de_xuat_pending_id,
        (pd."DeXuatID" IS NOT NULL) AS co_pending,
        COALESCE(LOWER(ch."TuyChonMoRong"->>'moPhong') = 'true', FALSE) AS mo_phong,
        v_now AS thoi_diem_tinh
    FROM public."KHU_VUC" kv
    JOIN public."SUAT_DIEN" sd
      ON sd."SuatDienID" = kv."SuatDienID"
     AND sd."SuKienID" = kv."SuKienID"
    LEFT JOIN public."QUY_TAC_GIA" qt
      ON qt."KhuVucID" = kv."KhuVucID"
    LEFT JOIN public."CAU_HINH_SU_KIEN" ch
      ON ch."SuKienID" = kv."SuKienID"
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) FILTER (WHERE g."TrangThai" = 'DA_BAN')::INT AS n_sold,
            COUNT(*) FILTER (
                WHERE g."TrangThai" = 'DA_BAN'
                  AND g."NgayCapNhatTrangThai" IS NOT NULL
                  AND g."NgayCapNhatTrangThai" >= v_now - INTERVAL '6 hours'
                  AND g."NgayCapNhatTrangThai" <= v_now
            )::INT AS so_ban_6h
        FROM public."GHE" g
        WHERE g."KhuVucID" = kv."KhuVucID"
    ) gs ON TRUE
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(ct."SoLuong"), 0)::INT AS n_hold
        FROM public."CHI_TIET_GIU_CHO" ct
        JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID"
        WHERE ct."KhuVucID" = kv."KhuVucID"
          AND gc."SuKienID" = kv."SuKienID"
          AND gc."SuatDienID" = kv."SuatDienID"
          AND gc."TrangThai" = 'ACTIVE'
          AND gc."HetHanLuc" > v_now
    ) gh ON TRUE
    LEFT JOIN LATERAL (
        SELECT dx."DeXuatID"
        FROM public."DE_XUAT_GIA" dx
        WHERE dx."KhuVucID" = kv."KhuVucID"
          AND dx."TrangThaiDuyet" = 'PENDING'
        ORDER BY dx."ThoiGianDeXuat" DESC, dx."DeXuatID" DESC
        LIMIT 1
    ) pd ON TRUE
    WHERE kv."SuKienID" = p_su_kien_id
      AND sd."SuKienID" = p_su_kien_id
    ORDER BY sd."SuatDienID" ASC, kv."KhuVucID" ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.lay_so_lieu_dinh_gia(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lay_so_lieu_dinh_gia(INT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Pricing Rule Configuration RPC: public.luu_quy_tac_gia(...)
--    Returns JSONB:
--      { "quyTacGiaId": BIGINT, "khuVucId": INT, "suatDienId": BIGINT,
--        "suKienId": INT, "taoMoi": BOOLEAN,
--        "canhBao": [ { "ma": "GIA_HIEN_HANH_NGOAI_KHUNG", "giaHienHanh": NUMERIC,
--                       "giaSan": NUMERIC, "giaTran": NUMERIC } ]  (empty when in frame),
--        "deXuatHetHieuLuc": [ DeXuatID, ... ]  (ascending),
--        "nhatKyId": BIGINT }   -- NhatKyDinhGiaID of the TAO/CAP_NHAT row
--    Per field (in parameter order): NULL -> NaN/+-Infinity on the RAW value ->
--    ROUND to column scale (2 for prices, 4 for ratios/weights) -> precision ->
--    domain rules on the rounded values, so the validated value equals the stored one.
--    Bounds: prices < 1e10 (NUMERIC(12,2)); ratios/weights < 10 (NUMERIC(5,4)).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luu_quy_tac_gia(
    p_khu_vuc_id INT,
    p_gia_goc NUMERIC,
    p_gia_san NUMERIC,
    p_gia_tran NUMERIC,
    p_buoc_nhay_gia NUMERIC,
    p_bien_do_toi_da NUMERIC,
    p_nguong_lap_day_thap NUMERIC,
    p_nguong_lap_day_cao NUMERIC,
    p_trong_so_lap_day NUMERIC,
    p_trong_so_toc_do_ban NUMERIC,
    p_trong_so_thoi_gian NUMERIC,
    p_trang_thai_kich_hoat BOOLEAN
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
    v_is_service BOOLEAN := (auth.role() = 'service_role');
    v_su_kien_id INT;
    v_suat_dien_id BIGINT;
    v_gia_hien_hanh NUMERIC(15,2);
    v_vai_tro_to_chuc VARCHAR(20);

    v_field TEXT;
    v_raw NUMERIC;
    v_scale INT;
    v_val NUMERIC;
    v_max NUMERIC;

    v_gia_goc NUMERIC(12,2);
    v_gia_san NUMERIC(12,2);
    v_gia_tran NUMERIC(12,2);
    v_buoc NUMERIC(12,2);
    v_bien_do NUMERIC(5,4);
    v_ng_thap NUMERIC(5,4);
    v_ng_cao NUMERIC(5,4);
    v_ts_lap_day NUMERIC(5,4);
    v_ts_toc_do NUMERIC(5,4);
    v_ts_thoi_gian NUMERIC(5,4);

    v_old_found BOOLEAN := FALSE;
    v_old_json JSONB;
    v_old_san NUMERIC(12,2);
    v_old_tran NUMERIC(12,2);

    v_qt_id BIGINT;
    v_new_json JSONB;
    v_ids BIGINT[] := '{}';
    v_dx_id BIGINT;
    v_tham_so JSONB;
    v_nhat_ky_id BIGINT;
    v_canh_bao JSONB := '[]'::JSONB;
BEGIN
    -- Step 1 (unlocked): resolve the verified event, then check permission.
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
        RAISE EXCEPTION 'Khong co quyen cau hinh quy tac gia'
            USING ERRCODE = '42501';
    END IF;

    IF NOT COALESCE(public.co_quyen_dinh_gia(v_su_kien_id), FALSE) THEN
        RAISE EXCEPTION 'Khong co quyen cau hinh quy tac gia'
            USING ERRCODE = '42501';
    END IF;

    -- Validation: one 22023 per field, in parameter order. Per field the order is
    -- NULL -> non-finite (on the RAW value, before ROUND) -> ROUND to column scale
    -- -> column precision -> (below) domain rules on the rounded values.
    FOR v_field, v_raw, v_scale, v_max IN
        SELECT t.f, t.v, t.s, t.m
          FROM (VALUES
              (1, 'p_gia_goc',              p_gia_goc,              2, 10000000000::NUMERIC),
              (2, 'p_gia_san',              p_gia_san,              2, 10000000000::NUMERIC),
              (3, 'p_gia_tran',             p_gia_tran,             2, 10000000000::NUMERIC),
              (4, 'p_buoc_nhay_gia',        p_buoc_nhay_gia,        2, 10000000000::NUMERIC),
              (5, 'p_bien_do_toi_da',       p_bien_do_toi_da,       4, 10::NUMERIC),
              (6, 'p_nguong_lap_day_thap',  p_nguong_lap_day_thap,  4, 10::NUMERIC),
              (7, 'p_nguong_lap_day_cao',   p_nguong_lap_day_cao,   4, 10::NUMERIC),
              (8, 'p_trong_so_lap_day',     p_trong_so_lap_day,     4, 10::NUMERIC),
              (9, 'p_trong_so_toc_do_ban',  p_trong_so_toc_do_ban,  4, 10::NUMERIC),
              (10, 'p_trong_so_thoi_gian',  p_trong_so_thoi_gian,   4, 10::NUMERIC)
          ) AS t(n, f, v, s, m)
         ORDER BY t.n
    LOOP
        IF v_raw IS NULL THEN
            RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: %', v_field
                USING ERRCODE = '22023', DETAIL = format('Tham so %s khong duoc NULL', v_field);
        END IF;
        IF v_raw IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC) THEN
            RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: %', v_field
                USING ERRCODE = '22023', DETAIL = format('Tham so %s phai la so huu han', v_field);
        END IF;
        v_val := ROUND(v_raw, v_scale);
        IF ABS(v_val) >= v_max THEN
            RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: %', v_field
                USING ERRCODE = '22023', DETAIL = format('Tham so %s vuot do chinh xac cua cot', v_field);
        END IF;
    END LOOP;

    IF p_trang_thai_kich_hoat IS NULL THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_trang_thai_kich_hoat'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_trang_thai_kich_hoat khong duoc NULL';
    END IF;

    v_gia_goc := ROUND(p_gia_goc, 2);
    v_gia_san := ROUND(p_gia_san, 2);
    v_gia_tran := ROUND(p_gia_tran, 2);
    v_buoc := ROUND(p_buoc_nhay_gia, 2);
    v_bien_do := ROUND(p_bien_do_toi_da, 4);
    v_ng_thap := ROUND(p_nguong_lap_day_thap, 4);
    v_ng_cao := ROUND(p_nguong_lap_day_cao, 4);
    v_ts_lap_day := ROUND(p_trong_so_lap_day, 4);
    v_ts_toc_do := ROUND(p_trong_so_toc_do_ban, 4);
    v_ts_thoi_gian := ROUND(p_trong_so_thoi_gian, 4);

    IF v_gia_san <= 0 THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_gia_san'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_gia_san phai > 0';
    END IF;
    IF v_gia_goc < v_gia_san THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_gia_goc'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_gia_goc phai >= p_gia_san';
    END IF;
    IF v_gia_tran < v_gia_goc THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_gia_tran'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_gia_tran phai >= p_gia_goc';
    END IF;
    IF v_buoc <= 0 THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_buoc_nhay_gia'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_buoc_nhay_gia phai > 0';
    END IF;
    IF v_bien_do <= 0 OR v_bien_do > 1 THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_bien_do_toi_da'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_bien_do_toi_da phai thuoc (0, 1]';
    END IF;
    IF v_ng_thap < 0 OR v_ng_thap > 1 THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_nguong_lap_day_thap'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_nguong_lap_day_thap phai thuoc [0, 1]';
    END IF;
    IF v_ng_cao < 0 OR v_ng_cao > 1 THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_nguong_lap_day_cao'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_nguong_lap_day_cao phai thuoc [0, 1]';
    END IF;
    IF v_ng_thap >= v_ng_cao THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_nguong_lap_day_thap'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_nguong_lap_day_thap phai < p_nguong_lap_day_cao';
    END IF;
    IF v_ts_lap_day < 0 THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_trong_so_lap_day'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_trong_so_lap_day phai >= 0';
    END IF;
    IF v_ts_toc_do < 0 THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_trong_so_toc_do_ban'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_trong_so_toc_do_ban phai >= 0';
    END IF;
    IF v_ts_thoi_gian < 0 THEN
        RAISE EXCEPTION 'QUY_TAC_GIA_KHONG_HOP_LE: p_trong_so_thoi_gian'
            USING ERRCODE = '22023', DETAIL = 'Tham so p_trong_so_thoi_gian phai >= 0';
    END IF;

    -- Step 2a (locked): KHU_VUC FOR UPDATE, then re-verify the link under the lock.
    SELECT kv."GiaVeNiemYet"
      INTO v_gia_hien_hanh
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
        RAISE EXCEPTION 'Khong co quyen cau hinh quy tac gia'
            USING ERRCODE = '42501';
    END IF;

    -- Step 2b: QUY_TAC_GIA FOR UPDATE (if it exists); capture the old snapshot.
    SELECT TRUE, to_jsonb(qt.*), qt."GiaSan", qt."GiaTran"
      INTO v_old_found, v_old_json, v_old_san, v_old_tran
      FROM public."QUY_TAC_GIA" qt
     WHERE qt."KhuVucID" = p_khu_vuc_id
       FOR UPDATE;
    v_old_found := COALESCE(v_old_found, FALSE);

    -- Step 2c: PENDING proposals outside the NEW frame, FOR UPDATE ORDER BY DeXuatID.
    FOR v_dx_id IN
        SELECT dx."DeXuatID"
          FROM public."DE_XUAT_GIA" dx
         WHERE dx."KhuVucID" = p_khu_vuc_id
           AND dx."TrangThaiDuyet" = 'PENDING'
           AND (dx."GiaDeXuat" < v_gia_san OR dx."GiaDeXuat" > v_gia_tran)
         ORDER BY dx."DeXuatID"
           FOR UPDATE
    LOOP
        v_ids := v_ids || v_dx_id;
    END LOOP;

    -- Write the rule (the zone lock also serializes the very first creation).
    INSERT INTO public."QUY_TAC_GIA" AS qt (
        "KhuVucID", "GiaGoc", "GiaSan", "GiaTran", "BuocNhayGia",
        "BienDoToiDaMoiChuKy", "NguongLapDayThap", "NguongLapDayCao",
        "TrongSoLapDay", "TrongSoTocDoBan", "TrongSoThoiGian",
        "TrangThaiKichHoat", "NguoiCapNhatID", "NgayTao", "NgayCapNhat"
    ) VALUES (
        p_khu_vuc_id, v_gia_goc, v_gia_san, v_gia_tran, v_buoc,
        v_bien_do, v_ng_thap, v_ng_cao,
        v_ts_lap_day, v_ts_toc_do, v_ts_thoi_gian,
        p_trang_thai_kich_hoat, v_uid, now(), now()
    )
    ON CONFLICT ("KhuVucID") DO UPDATE SET
        "GiaGoc" = EXCLUDED."GiaGoc",
        "GiaSan" = EXCLUDED."GiaSan",
        "GiaTran" = EXCLUDED."GiaTran",
        "BuocNhayGia" = EXCLUDED."BuocNhayGia",
        "BienDoToiDaMoiChuKy" = EXCLUDED."BienDoToiDaMoiChuKy",
        "NguongLapDayThap" = EXCLUDED."NguongLapDayThap",
        "NguongLapDayCao" = EXCLUDED."NguongLapDayCao",
        "TrongSoLapDay" = EXCLUDED."TrongSoLapDay",
        "TrongSoTocDoBan" = EXCLUDED."TrongSoTocDoBan",
        "TrongSoThoiGian" = EXCLUDED."TrongSoThoiGian",
        "TrangThaiKichHoat" = EXCLUDED."TrangThaiKichHoat",
        "NguoiCapNhatID" = EXCLUDED."NguoiCapNhatID",
        "NgayCapNhat" = now()
    RETURNING qt."QuyTacGiaID", to_jsonb(qt.*)
         INTO v_qt_id, v_new_json;

    -- Narrowing: expire PENDING proposals outside the new frame (TTL ignored).
    IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
        UPDATE public."DE_XUAT_GIA" dx
           SET "TrangThaiDuyet" = 'EXPIRED',
               "GhiChuDuyet" = 'CAU_HINH_THU_HEP_KHUNG',
               "NguoiDuyetID" = NULL,
               "ThoiGianDuyet" = NULL
         WHERE dx."DeXuatID" = ANY (v_ids)
           AND dx."TrangThaiDuyet" = 'PENDING';
    END IF;

    IF v_gia_hien_hanh IS NOT NULL
       AND (v_gia_hien_hanh < v_gia_san OR v_gia_hien_hanh > v_gia_tran) THEN
        v_canh_bao := jsonb_build_array(jsonb_build_object(
            'ma', 'GIA_HIEN_HANH_NGOAI_KHUNG',
            'giaHienHanh', v_gia_hien_hanh,
            'giaSan', v_gia_san,
            'giaTran', v_gia_tran
        ));
    END IF;

    -- Audit (same transaction).
    IF v_uid IS NOT NULL THEN
        SELECT tv."VaiTro"
          INTO v_vai_tro_to_chuc
          FROM public."SU_KIEN" sk
          JOIN public."THANH_VIEN_TO_CHUC" tv ON tv."ToChucID" = sk."ToChucID"
         WHERE sk."SuKienID" = v_su_kien_id
           AND tv."NguoiDungID" = v_uid
         LIMIT 1;
    END IF;

    v_tham_so := jsonb_build_object(
        'giaGoc', v_gia_goc, 'giaSan', v_gia_san, 'giaTran', v_gia_tran,
        'buocNhayGia', v_buoc, 'bienDoToiDaMoiChuKy', v_bien_do,
        'nguongLapDayThap', v_ng_thap, 'nguongLapDayCao', v_ng_cao,
        'trongSoLapDay', v_ts_lap_day, 'trongSoTocDoBan', v_ts_toc_do,
        'trongSoThoiGian', v_ts_thoi_gian,
        'trangThaiKichHoat', p_trang_thai_kich_hoat
    );

    INSERT INTO public."NHAT_KY_DINH_GIA" (
        "LoaiHanhDong", "KhuVucID", "SuatDienID", "SuKienID", "QuyTacGiaID",
        "KhuVucIDDauVao", "NguoiThucHienID", "VaiTroXacThuc", "VaiTroToChuc",
        "DuLieuTruoc", "DuLieuSau", "GiaHienHanh", "ThamSo"
    ) VALUES (
        CASE WHEN v_old_found THEN 'CAP_NHAT_QUY_TAC' ELSE 'TAO_QUY_TAC' END,
        p_khu_vuc_id, v_suat_dien_id, v_su_kien_id, v_qt_id,
        p_khu_vuc_id, v_uid, v_role, v_vai_tro_to_chuc,
        CASE WHEN v_old_found THEN v_old_json ELSE NULL END,
        v_new_json, v_gia_hien_hanh, v_tham_so
    )
    RETURNING "NhatKyDinhGiaID" INTO v_nhat_ky_id;

    IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
        INSERT INTO public."NHAT_KY_DINH_GIA" (
            "LoaiHanhDong", "KhuVucID", "SuatDienID", "SuKienID", "QuyTacGiaID",
            "DeXuatID", "KhuVucIDDauVao", "DeXuatIDDauVao",
            "NguoiThucHienID", "VaiTroXacThuc", "VaiTroToChuc",
            "DuLieuTruoc", "DuLieuSau", "GiaHienHanh", "GiaThu", "ThamSo", "LyDo"
        )
        SELECT
            'HET_HIEU_LUC_DO_DOI_KHUNG',
            p_khu_vuc_id, v_suat_dien_id, v_su_kien_id, dx."QuyTacGiaID",
            dx."DeXuatID", p_khu_vuc_id, dx."DeXuatID",
            v_uid, v_role, v_vai_tro_to_chuc,
            jsonb_build_object(
                'trangThaiDuyet', 'PENDING',
                'giaDeXuat', dx."GiaDeXuat",
                'khungGia', jsonb_build_object('giaSan', v_old_san, 'giaTran', v_old_tran)
            ),
            jsonb_build_object(
                'trangThaiDuyet', dx."TrangThaiDuyet",
                'ghiChuDuyet', dx."GhiChuDuyet",
                'giaDeXuat', dx."GiaDeXuat",
                'khungGia', jsonb_build_object('giaSan', v_gia_san, 'giaTran', v_gia_tran)
            ),
            v_gia_hien_hanh, dx."GiaDeXuat", v_tham_so,
            'CAU_HINH_THU_HEP_KHUNG: GiaDeXuat nam ngoai khung gia moi ['
                || v_gia_san::TEXT || ', ' || v_gia_tran::TEXT || ']'
        FROM public."DE_XUAT_GIA" dx
        WHERE dx."DeXuatID" = ANY (v_ids)
        ORDER BY dx."DeXuatID";
    END IF;

    RETURN jsonb_build_object(
        'quyTacGiaId', v_qt_id,
        'khuVucId', p_khu_vuc_id,
        'suatDienId', v_suat_dien_id,
        'suKienId', v_su_kien_id,
        'taoMoi', NOT v_old_found,
        'canhBao', v_canh_bao,
        'deXuatHetHieuLuc', to_jsonb(v_ids),
        'nhatKyId', v_nhat_ky_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.luu_quy_tac_gia(
    INT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
    NUMERIC, NUMERIC, NUMERIC, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luu_quy_tac_gia(
    INT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
    NUMERIC, NUMERIC, NUMERIC, BOOLEAN
) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. End-of-file Assertions & Schema Cache Reload
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'NHAT_KY_DINH_GIA' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: NHAT_KY_DINH_GIA must have RLS enabled';
    END IF;

    IF has_table_privilege('authenticated', 'public."NHAT_KY_DINH_GIA"', 'INSERT')
       OR has_table_privilege('authenticated', 'public."NHAT_KY_DINH_GIA"', 'UPDATE')
       OR has_table_privilege('authenticated', 'public."NHAT_KY_DINH_GIA"', 'DELETE')
       OR has_table_privilege('authenticated', 'public."NHAT_KY_DINH_GIA"', 'TRUNCATE')
       OR has_table_privilege('anon', 'public."NHAT_KY_DINH_GIA"', 'INSERT')
       OR has_table_privilege('anon', 'public."NHAT_KY_DINH_GIA"', 'UPDATE')
       OR has_table_privilege('anon', 'public."NHAT_KY_DINH_GIA"', 'DELETE')
       OR has_table_privilege('anon', 'public."NHAT_KY_DINH_GIA"', 'TRUNCATE')
       OR has_table_privilege('anon', 'public."NHAT_KY_DINH_GIA"', 'SELECT') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: client roles have forbidden privileges on NHAT_KY_DINH_GIA';
    END IF;

    IF has_table_privilege('authenticated', 'public."GHE"', 'INSERT')
       OR has_table_privilege('authenticated', 'public."GHE"', 'UPDATE')
       OR has_table_privilege('authenticated', 'public."GHE"', 'DELETE')
       OR has_table_privilege('anon', 'public."GHE"', 'INSERT')
       OR has_table_privilege('anon', 'public."GHE"', 'UPDATE')
       OR has_table_privilege('anon', 'public."GHE"', 'DELETE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: authenticated/anon can write GHE directly';
    END IF;

    IF has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'INSERT')
       OR has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'UPDATE')
       OR has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'DELETE')
       OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'INSERT')
       OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'UPDATE')
       OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'DELETE')
       OR has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'INSERT')
       OR has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'UPDATE')
       OR has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'DELETE')
       OR has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'INSERT')
       OR has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'UPDATE')
       OR has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'DELETE')
       OR has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'INSERT')
       OR has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'UPDATE')
       OR has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'DELETE')
       OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'INSERT')
       OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'UPDATE')
       OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'DELETE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: client roles can write W1 pricing tables directly';
    END IF;

    IF has_function_privilege('anon', 'public.co_quyen_dinh_gia(integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.suat_dien_dang_mo_ban(integer, bigint)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.lay_so_lieu_dinh_gia(integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.luu_quy_tac_gia(integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: anon can execute pricing RPCs';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public."NHAT_KY_DINH_GIA"'::regclass
          AND contype = 'f'
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: NHAT_KY_DINH_GIA must not have foreign keys';
    END IF;

    IF NOT has_table_privilege('authenticated', 'public."NHAT_KY_DINH_GIA"', 'SELECT') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: authenticated must have SELECT on NHAT_KY_DINH_GIA';
    END IF;

    IF has_function_privilege('authenticated', 'public.chan_sua_xoa_nhat_ky_dinh_gia()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.chan_sua_xoa_nhat_ky_dinh_gia()', 'EXECUTE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: client roles can execute chan_sua_xoa_nhat_ky_dinh_gia';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'chan_sua_xoa_nhat_ky_dinh_gia'
          AND NOT p.prosecdef
    ) THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: chan_sua_xoa_nhat_ky_dinh_gia must be SECURITY INVOKER';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'co_quyen_dinh_gia',
              'suat_dien_dang_mo_ban',
              'lay_so_lieu_dinh_gia',
              'luu_quy_tac_gia'
          )
          AND p.prosecdef
    ) <> 4 THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: pricing RPCs/helpers must be SECURITY DEFINER';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.co_quyen_dinh_gia(integer)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.co_quyen_dinh_gia(integer)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.suat_dien_dang_mo_ban(integer, bigint)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.suat_dien_dang_mo_ban(integer, bigint)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.lay_so_lieu_dinh_gia(integer)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.lay_so_lieu_dinh_gia(integer)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.luu_quy_tac_gia(integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.luu_quy_tac_gia(integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: authenticated/service_role missing EXECUTE on pricing RPCs';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
