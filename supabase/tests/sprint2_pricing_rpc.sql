-- pgTAP acceptance test: Sprint 2 / T2 pricing RPCs and NHAT_KY_DINH_GIA audit log
-- Migration under test: 20261113090000_sprint2_pricing_rpc.sql
--
-- STATUS: authored; run with `npm run db:test` (`supabase test db`) against a migrated DB.
-- Every mutation is inside BEGIN ... ROLLBACK. `npm run check` does NOT run this file.
--
-- Sections:
--   A. (sonnet) write path: ACL, permission, validation, audit rows, narrowing,
--      immutability, zone deletion vs. audit.
--   B. (hydrogen) read path: suat_dien_dang_mo_ban / lay_so_lieu_dinh_gia.

BEGIN;

SELECT plan(122);

-- ============================================================================
-- Fixtures (IDs 997xxx are isolated from other test files)
-- ============================================================================
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('55555555-5555-5555-5555-555555555501', 'authenticated', 'authenticated', 't2rpc-owner@example.com'),
  ('55555555-5555-5555-5555-555555555502', 'authenticated', 'authenticated', 't2rpc-editor@example.com'),
  ('55555555-5555-5555-5555-555555555503', 'authenticated', 'authenticated', 't2rpc-outsider@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('55555555-5555-5555-5555-555555555501', 'RPC Owner', 'ORGANIZER'),
  ('55555555-5555-5555-5555-555555555502', 'RPC Editor', 'ORGANIZER'),
  ('55555555-5555-5555-5555-555555555503', 'RPC Outsider', 'ORGANIZER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES
  ('55555555-0000-0000-0000-000000000501', 'T2 RPC Org A', 't2rpc-org-a'),
  ('66666666-0000-0000-0000-000000000601', 'T2 RPC Org B', 't2rpc-org-b')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('55555555-0000-0000-0000-000000000501', '55555555-5555-5555-5555-555555555501', 'CHU_SO_HUU'),
  ('55555555-0000-0000-0000-000000000501', '55555555-5555-5555-5555-555555555502', 'BIEN_TAP'),
  ('66666666-0000-0000-0000-000000000601', '55555555-5555-5555-5555-555555555503', 'CHU_SO_HUU')
ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  997101, 'T2 RPC Event A', 't2rpc-event-a', '55555555-0000-0000-0000-000000000501',
  NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
  NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'Ha Noi', 'San A',
  'DANG_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES (
  997101, 997101, 't2rpc-suat-a', 'Suat A',
  NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
  NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'DANG_MO_BAN'
);

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (997101, 997101, 997101, 'T2RPC_Z1', 'Khu 1', 'DUNG_STAND', 200000, '#111111', 100),
  (997102, 997101, 997101, 'T2RPC_Z2', 'Khu 2', 'DUNG_STAND', 500000, '#222222', 100);

-- ============================================================================
-- A. SONNET SECTION: write path
-- ============================================================================

-- A1. Catalog: triggers, trigger function, RLS, no FK on the audit table
SELECT has_trigger('public', 'NHAT_KY_DINH_GIA', 'trg_chan_sua_xoa_nhat_ky_dinh_gia',
  'NHAT_KY_DINH_GIA has UPDATE/DELETE immutability trigger');
SELECT has_trigger('public', 'NHAT_KY_DINH_GIA', 'trg_chan_truncate_nhat_ky_dinh_gia',
  'NHAT_KY_DINH_GIA has TRUNCATE immutability trigger');
SELECT function_returns('public', 'chan_sua_xoa_nhat_ky_dinh_gia', ARRAY[]::text[], 'trigger',
  'chan_sua_xoa_nhat_ky_dinh_gia() returns trigger');
SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'chan_sua_xoa_nhat_ky_dinh_gia'),
  FALSE, 'trigger function is SECURITY INVOKER');
SELECT is(
  (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'NHAT_KY_DINH_GIA'),
  TRUE, 'NHAT_KY_DINH_GIA has RLS enabled');
SELECT is(
  (SELECT count(*)::int FROM pg_constraint
    WHERE conrelid = 'public."NHAT_KY_DINH_GIA"'::regclass AND contype = 'f'),
  0, 'NHAT_KY_DINH_GIA has no foreign keys (historical IDs only)');

-- A2. Grants / ACL
SELECT is(
  has_table_privilege('anon', 'public."NHAT_KY_DINH_GIA"', 'SELECT'),
  FALSE, 'anon cannot SELECT the audit log');
SELECT is(
  has_table_privilege('authenticated', 'public."NHAT_KY_DINH_GIA"', 'SELECT'),
  TRUE, 'authenticated can SELECT the audit log (RLS-filtered)');
SELECT is(
  has_table_privilege('authenticated', 'public."NHAT_KY_DINH_GIA"', 'INSERT')
  OR has_table_privilege('authenticated', 'public."NHAT_KY_DINH_GIA"', 'UPDATE')
  OR has_table_privilege('authenticated', 'public."NHAT_KY_DINH_GIA"', 'DELETE')
  OR has_table_privilege('authenticated', 'public."NHAT_KY_DINH_GIA"', 'TRUNCATE')
  OR has_table_privilege('anon', 'public."NHAT_KY_DINH_GIA"', 'INSERT')
  OR has_table_privilege('anon', 'public."NHAT_KY_DINH_GIA"', 'UPDATE')
  OR has_table_privilege('anon', 'public."NHAT_KY_DINH_GIA"', 'DELETE')
  OR has_table_privilege('anon', 'public."NHAT_KY_DINH_GIA"', 'TRUNCATE'),
  FALSE, 'client roles have no write privileges on the audit log');
SELECT is(
  has_function_privilege('anon', 'public.co_quyen_dinh_gia(integer)', 'EXECUTE')
  OR has_function_privilege('anon', 'public.luu_quy_tac_gia(integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean)', 'EXECUTE'),
  FALSE, 'anon cannot execute co_quyen_dinh_gia / luu_quy_tac_gia');
SELECT is(
  has_function_privilege('authenticated', 'public.co_quyen_dinh_gia(integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.co_quyen_dinh_gia(integer)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.luu_quy_tac_gia(integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.luu_quy_tac_gia(integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean)', 'EXECUTE'),
  TRUE, 'authenticated and service_role can execute co_quyen_dinh_gia / luu_quy_tac_gia');
SELECT is(
  has_function_privilege('authenticated', 'public.chan_sua_xoa_nhat_ky_dinh_gia()', 'EXECUTE')
  OR has_function_privilege('anon', 'public.chan_sua_xoa_nhat_ky_dinh_gia()', 'EXECUTE'),
  FALSE, 'client roles cannot execute the audit trigger function');
SELECT is(
  (SELECT bool_and(p.prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('co_quyen_dinh_gia', 'luu_quy_tac_gia')),
  TRUE, 'co_quyen_dinh_gia and luu_quy_tac_gia are SECURITY DEFINER');

-- A3. co_quyen_dinh_gia: identity only from auth.uid() / auth.role()
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT is(public.co_quyen_dinh_gia(997101), TRUE, 'CHU_SO_HUU of the owning org has pricing permission');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555502';
SELECT is(public.co_quyen_dinh_gia(997101), FALSE, 'BIEN_TAP member has no pricing permission');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555503';
SELECT is(public.co_quyen_dinh_gia(997101), FALSE, 'member of another org has no pricing permission');
SELECT is(public.co_quyen_dinh_gia(NULL), FALSE, 'NULL event gives FALSE for a non-service caller');
RESET ROLE;

SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT is(public.co_quyen_dinh_gia(997101), TRUE, 'service_role has pricing permission');
RESET ROLE;

-- A4. luu_quy_tac_gia permission: non-owner and BIEN_TAP get 42501
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555503';
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '42501', NULL, 'non-owner organizer gets 42501');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555502';
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '42501', NULL, 'BIEN_TAP member gets 42501');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL) $$,
  '42501', NULL, 'permission is checked before validation (BIEN_TAP + invalid input still 42501)');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(999999999, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '42501', NULL, 'non-existent zone gives 42501 for non-service callers');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 997101), 0,
  'rejected callers created no rule');

-- A5. Validation: field-level 22023
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';

SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, NULL, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_gia_goc', 'NULL p_gia_goc');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 'NaN'::numeric, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_gia_san', 'NaN p_gia_san');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 'Infinity'::numeric, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_gia_tran', '+Infinity p_gia_tran');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, '-Infinity'::numeric, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_buoc_nhay_gia', '-Infinity p_buoc_nhay_gia');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 0, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_gia_san', 'p_gia_san must be > 0');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 100000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_gia_goc', 'p_gia_goc < p_gia_san');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 100000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_gia_tran', 'p_gia_tran < p_gia_goc');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 0, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_buoc_nhay_gia', 'S must be > 0');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_bien_do_toi_da', 'bien do = 0');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 1.5, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_bien_do_toi_da', 'bien do > 1');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.6, 0.3, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_nguong_lap_day_thap', 'low threshold >= high threshold');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 1.5, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_nguong_lap_day_cao', 'high threshold > 1');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, -1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_trong_so_toc_do_ban', 'negative weight');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 10000000000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_gia_goc', 'price beyond NUMERIC(12,2) precision');
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, NULL) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_trang_thai_kich_hoat', 'NULL activation flag');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 997101), 0,
  'invalid inputs created no rule');
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "KhuVucID" = 997101), 0,
  'invalid inputs wrote no audit row');

-- A6. First create + update audit rows
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT is(
  (public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) ->> 'taoMoi')::boolean,
  TRUE, 'first save reports taoMoi = true');
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "KhuVucID" = 997101 AND "LoaiHanhDong" = 'TAO_QUY_TAC'
      AND "SuKienID" = 997101 AND "SuatDienID" = 997101
      AND "NguoiThucHienID" = '55555555-5555-5555-5555-555555555501'
      AND "VaiTroToChuc" = 'CHU_SO_HUU' AND "DuLieuTruoc" IS NULL AND "DuLieuSau" IS NOT NULL),
  1, 'first save writes one TAO_QUY_TAC audit row with verified IDs and role');

-- service_role update: auth.uid() is NULL in the audit row
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT is(
  (public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) ->> 'taoMoi')::boolean,
  FALSE, 'service_role second save reports taoMoi = false');
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "KhuVucID" = 997101 AND "LoaiHanhDong" = 'CAP_NHAT_QUY_TAC'
      AND "NguoiThucHienID" IS NULL AND "VaiTroXacThuc" = 'service_role'),
  1, 'service_role update audit row has NULL NguoiThucHienID');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT lives_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 20000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  'owner can update the rule again');
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "KhuVucID" = 997101 AND "LoaiHanhDong" = 'CAP_NHAT_QUY_TAC' AND "DuLieuTruoc" IS NOT NULL),
  2, 'each update writes a CAP_NHAT_QUY_TAC row with the previous snapshot');
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "KhuVucID" = 997101 AND "LoaiHanhDong" = 'TAO_QUY_TAC'),
  1, 'earlier audit rows are kept');

-- A7. Narrowing: only out-of-frame PENDING become EXPIRED (TTL ignored)
INSERT INTO public."DE_XUAT_GIA" (
  "DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
  "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "TrangThaiDuyet"
)
SELECT v.id, qt."QuyTacGiaID", 997101, 0.5, 5, 4, 48, 200000, v.gia, v.gia, v.st
  FROM public."QUY_TAC_GIA" qt,
       (VALUES
         (997201, 160000, 'PENDING'),   -- below new floor: expires
         (997202, 170000, 'PENDING'),   -- equals new floor: stays
         (997203, 300000, 'PENDING'),   -- equals new ceiling: stays
         (997204, 310000, 'PENDING'),   -- above new ceiling: expires
         (997205, 160000, 'APPROVED'),  -- non-PENDING: stays
         (997206, 400000, 'REJECTED')   -- non-PENDING: stays
       ) AS v(id, gia, st)
 WHERE qt."KhuVucID" = 997101;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT is(
  public.luu_quy_tac_gia(997101, 200000, 170000, 300000, 20000, 0.2, 0.3, 0.6, 1, 1, 1, true) -> 'deXuatHetHieuLuc',
  to_jsonb(ARRAY[997201, 997204]::bigint[]),
  'narrowing reports exactly the out-of-frame PENDING proposals (ascending)');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA"
    WHERE "DeXuatID" IN (997201, 997204) AND "TrangThaiDuyet" = 'EXPIRED'
      AND "GhiChuDuyet" = 'CAU_HINH_THU_HEP_KHUNG'
      AND "NguoiDuyetID" IS NULL AND "ThoiGianDuyet" IS NULL),
  2, 'out-of-frame PENDING are EXPIRED with CAU_HINH_THU_HEP_KHUNG and NULL approver/time');
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA"
    WHERE "DeXuatID" IN (997202, 997203) AND "TrangThaiDuyet" = 'PENDING'),
  2, 'PENDING equal to the new floor/ceiling stay PENDING');
SELECT is(
  (SELECT array_agg("TrangThaiDuyet" ORDER BY "DeXuatID") FROM public."DE_XUAT_GIA" WHERE "DeXuatID" IN (997205, 997206)),
  ARRAY['APPROVED', 'REJECTED']::varchar[], 'non-PENDING proposals are untouched');
SELECT is(
  (SELECT "GiaVeNiemYet" FROM public."KHU_VUC" WHERE "KhuVucID" = 997101),
  200000.00::numeric, 'narrowing does not change GiaVeNiemYet');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "LoaiHanhDong" = 'HET_HIEU_LUC_DO_DOI_KHUNG' AND "KhuVucID" = 997101
      AND "DeXuatID" IN (997201, 997204)
      AND "DuLieuTruoc" ->> 'trangThaiDuyet' = 'PENDING'
      AND "DuLieuSau" ->> 'trangThaiDuyet' = 'EXPIRED'
      AND ("DuLieuTruoc" -> 'khungGia' ->> 'giaSan')::numeric = 150000
      AND ("DuLieuSau" -> 'khungGia' ->> 'giaSan')::numeric = 170000
      AND ("DuLieuSau" -> 'khungGia' ->> 'giaTran')::numeric = 300000
      AND "LyDo" IS NOT NULL),
  2, 'one HET_HIEU_LUC_DO_DOI_KHUNG audit row per expired proposal with old/new frame');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "LoaiHanhDong" = 'HET_HIEU_LUC_DO_DOI_KHUNG' AND "DeXuatID" IN (997202, 997203, 997205, 997206)),
  0, 'no expiry audit rows for untouched proposals');

-- Warning when the current price is outside the new frame (zone 2 price = 500000)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT is(
  public.luu_quy_tac_gia(997102, 200000, 100000, 300000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) -> 'canhBao' -> 0 ->> 'ma',
  'GIA_HIEN_HANH_NGOAI_KHUNG', 'warning GIA_HIEN_HANH_NGOAI_KHUNG when price is outside the frame');
RESET ROLE;
SELECT is(
  (SELECT "GiaVeNiemYet" FROM public."KHU_VUC" WHERE "KhuVucID" = 997102),
  500000.00::numeric, 'GiaVeNiemYet unchanged after the warning');

-- A8. Immutability: UPDATE / DELETE / TRUNCATE rejected, even for service_role / superuser
SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_DINH_GIA" SET "LyDo" = 'tamper' WHERE "KhuVucID" = 997101 $$,
  '42501', 'NHAT_KY_DINH_GIA la nhat ky bat bien: khong cho phep UPDATE',
  'UPDATE on the audit log is rejected by the trigger');
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_DINH_GIA" WHERE "KhuVucID" = 997101 $$,
  '42501', 'NHAT_KY_DINH_GIA la nhat ky bat bien: khong cho phep DELETE',
  'DELETE on the audit log is rejected by the trigger');
SELECT throws_ok(
  $$ TRUNCATE public."NHAT_KY_DINH_GIA" $$,
  '42501', 'NHAT_KY_DINH_GIA la nhat ky bat bien: khong cho phep TRUNCATE',
  'TRUNCATE on the audit log is rejected by the trigger');
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_DINH_GIA" SET "LyDo" = 'tamper' WHERE "KhuVucID" = 997101 $$,
  '42501', NULL, 'service_role cannot UPDATE the audit log');
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_DINH_GIA" WHERE "KhuVucID" = 997101 $$,
  '42501', NULL, 'service_role cannot DELETE from the audit log');
RESET ROLE;

-- A9. Deleting a zone after saving a rule succeeds; audit stays and stays readable
SELECT lives_ok(
  $$ DELETE FROM public."KHU_VUC" WHERE "KhuVucID" = 997102 $$,
  'zone with a saved rule can be deleted (audit has no FK)');
SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 997102), 0,
  'W1 cascade removed the rule of the deleted zone');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "KhuVucID" = 997102 AND "LoaiHanhDong" = 'TAO_QUY_TAC'),
  1, 'audit row of the deleted zone is preserved');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "KhuVucID" = 997102),
  1, 'org member can still read the audit of the deleted zone');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555503';
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997101),
  0, 'member of another org reads no audit rows of this event');
RESET ROLE;

-- ============================================================================
-- B. HYDROGEN SECTION: read path (suat_dien_dang_mo_ban & lay_so_lieu_dinh_gia)
-- ============================================================================

-- B1. Catalog & ACL for suat_dien_dang_mo_ban and lay_so_lieu_dinh_gia
SELECT is(
  has_function_privilege('anon', 'public.suat_dien_dang_mo_ban(integer, bigint)', 'EXECUTE')
  OR has_function_privilege('anon', 'public.lay_so_lieu_dinh_gia(integer)', 'EXECUTE'),
  FALSE, 'anon cannot execute suat_dien_dang_mo_ban or lay_so_lieu_dinh_gia');
SELECT is(
  has_function_privilege('authenticated', 'public.suat_dien_dang_mo_ban(integer, bigint)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.suat_dien_dang_mo_ban(integer, bigint)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.lay_so_lieu_dinh_gia(integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.lay_so_lieu_dinh_gia(integer)', 'EXECUTE'),
  TRUE, 'authenticated and service_role can execute suat_dien_dang_mo_ban and lay_so_lieu_dinh_gia');
SELECT is(
  (SELECT bool_and(p.prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('suat_dien_dang_mo_ban', 'lay_so_lieu_dinh_gia')),
  TRUE, 'suat_dien_dang_mo_ban and lay_so_lieu_dinh_gia are SECURITY DEFINER');

-- B2. Permission & cross-event access: non-owner / BIEN_TAP / non-existent -> 42501
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555503';
SELECT throws_ok(
  $$ SELECT public.suat_dien_dang_mo_ban(997101, 997101) $$,
  '42501', NULL, 'cross-org user gets 42501 on suat_dien_dang_mo_ban');
SELECT throws_ok(
  $$ SELECT * FROM public.lay_so_lieu_dinh_gia(997101) $$,
  '42501', NULL, 'cross-org user gets 42501 on lay_so_lieu_dinh_gia');

SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555502';
SELECT throws_ok(
  $$ SELECT public.suat_dien_dang_mo_ban(997101, 997101) $$,
  '42501', NULL, 'BIEN_TAP member gets 42501 on suat_dien_dang_mo_ban');
SELECT throws_ok(
  $$ SELECT * FROM public.lay_so_lieu_dinh_gia(997101) $$,
  '42501', NULL, 'BIEN_TAP member gets 42501 on lay_so_lieu_dinh_gia');

SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT throws_ok(
  $$ SELECT public.suat_dien_dang_mo_ban(999999999, 997101) $$,
  '42501', NULL, 'non-existent event gives 42501 on suat_dien_dang_mo_ban for non-service caller');
SELECT throws_ok(
  $$ SELECT * FROM public.lay_so_lieu_dinh_gia(999999999) $$,
  '42501', NULL, 'non-existent event gives 42501 on lay_so_lieu_dinh_gia for non-service caller');
RESET ROLE;

-- B3. Fixtures for open-for-sale matrix and pricing metrics (event 997301, shows 997301-997312)
INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES
  (
    997301, 'T2 RPC Event Published', 't2rpc-event-pub', '55555555-0000-0000-0000-000000000501',
    NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
    NOW() - INTERVAL '10 hours', NOW() + INTERVAL '90 hours', 'Ha Noi', 'San Pub',
    'DONG_BAN', 'BAN_NHAP'
  ),
  (
    997302, 'T2 RPC Event Hidden', 't2rpc-event-hidden', '55555555-0000-0000-0000-000000000501',
    NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
    NOW() - INTERVAL '10 hours', NOW() + INTERVAL '90 hours', 'Ha Noi', 'San Hidden',
    'DANG_MO_BAN', 'DA_AN'
  );

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  -- Open DANG_MO_BAN inside 100h window
  (997301, 997301, 's-open-dang', 'Open DANG_MO_BAN', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '10 hours', NOW() + INTERVAL '90 hours', 'DANG_MO_BAN'),
  -- Will be moved to past + invalid window after cong_bo_su_kien(997301)
  (997310, 997301, 's-da-dien-ra', 'Excluded DA_DIEN_RA', NOW() + INTERVAL '2 hours', NOW() + INTERVAL '4 hours', NOW() - INTERVAL '10 hours', NOW() + INTERVAL '1 hour', 'DA_DIEN_RA'),
  -- Show on DA_AN event
  (997312, 997302, 's-hidden-event', 'Hidden Event Show', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 hours', 'DANG_MO_BAN');

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (997301, 997301, 997301, 'Z_SEAT', 'Seated Zone', 'GHE_NGOI', 250000, '#112233', 100),
  (997302, 997301, 997301, 'Z_STAND', 'Standing Zone', 'DUNG_STAND', 150000, '#223344', 200),
  (997303, 997301, 997310, 'Z_PAST', 'Past Show Invalid Window', 'GHE_NGOI', 180000, '#334455', 50);

-- Publish event 997301 via cong_bo_su_kien while its initial shows have zones and MoBan < BatDau,
-- then move show 997310 to an invalid window (ThoiGianDongBanVe IS NULL & BatDau < MoBan)
-- and add the remaining open-for-sale matrix shows (without zones so lay_so_lieu_dinh_gia
-- continues to return only the 3 fixture zones).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
DO $$ BEGIN PERFORM public.cong_bo_su_kien(997301); END $$;
RESET ROLE;

UPDATE public."SUAT_DIEN"
   SET "ThoiGianBatDau" = NOW() - INTERVAL '3 hours',
       "ThoiGianKetThuc" = NOW() - INTERVAL '1 hour',
       "ThoiGianMoBanVe" = NOW() - INTERVAL '1 hour',
       "ThoiGianDongBanVe" = NULL
 WHERE "SuatDienID" = 997310;

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  -- Open SAP_MO_BAN inside window (must count as open)
  (997302, 997301, 's-open-sap', 'Open SAP_MO_BAN', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 hours', 'SAP_MO_BAN'),
  -- Open DANG_MO_BAN with NULL close time (must count as open when now >= open)
  (997303, 997301, 's-open-null-close', 'Open NULL Close', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '1 hour', NULL, 'DANG_MO_BAN'),
  -- Before open window
  (997304, 997301, 's-before-open', 'Before Open', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() + INTERVAL '1 hour', NOW() + INTERVAL '10 hours', 'DANG_MO_BAN'),
  -- At close time (ThoiGianDongBanVe = NOW())
  (997305, 997301, 's-at-close', 'At Close', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '5 hours', NOW(), 'DANG_MO_BAN'),
  -- After close time
  (997306, 997301, 's-after-close', 'After Close', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '1 minute', 'DANG_MO_BAN'),
  -- Excluded statuses inside an open window
  (997307, 997301, 's-ban-nhap', 'Excluded BAN_NHAP', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 hours', 'BAN_NHAP'),
  (997308, 997301, 's-huy', 'Excluded HUY', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 hours', 'HUY'),
  (997309, 997301, 's-dong-ban', 'Excluded DONG_BAN', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 hours', 'DONG_BAN'),
  (997311, 997301, 's-het-ve', 'Excluded HET_VE', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 hours', 'HET_VE'),
  -- Infinite sale-window timestamps (DANG_MO_BAN, valid KetThuc > BatDau)
  (997313, 997301, 's-inf-mo-neg-dong-fin', 'Infinite -Mo with Finite Dong', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', '-infinity'::timestamptz, NOW() + INTERVAL '5 hours', 'DANG_MO_BAN'),
  (997314, 997301, 's-inf-mo-neg-dong-null', 'Infinite -Mo with NULL Dong', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', '-infinity'::timestamptz, NULL, 'DANG_MO_BAN'),
  (997315, 997301, 's-inf-dong-pos', 'Finite Mo with Infinite +Dong', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '1 hour', 'infinity'::timestamptz, 'DANG_MO_BAN'),
  (997316, 997301, 's-inf-mo-pos-dong-null', 'Infinite +Mo with NULL Dong', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', 'infinity'::timestamptz, NULL, 'DANG_MO_BAN');

-- B4. suat_dien_dang_mo_ban predicate coverage
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';

SELECT is(public.suat_dien_dang_mo_ban(997101, 997101), FALSE,
  'BAN_NHAP event is NOT open even if SU_KIEN.TrangThaiMoBan and SUAT_DIEN.TrangThai are DANG_MO_BAN');
SELECT is(public.suat_dien_dang_mo_ban(997302, 997312), FALSE,
  'DA_AN event is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997301), TRUE,
  'CONG_KHAI + DANG_MO_BAN inside window is open (ignores SU_KIEN.TrangThaiMoBan = DONG_BAN)');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997302), TRUE,
  'SAP_MO_BAN inside sale window counts as open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997303), TRUE,
  'ThoiGianDongBanVe IS NULL with now() >= ThoiGianMoBanVe is open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997304), FALSE,
  'before ThoiGianMoBanVe is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997305), FALSE,
  'at ThoiGianDongBanVe (now() = close) is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997306), FALSE,
  'after ThoiGianDongBanVe is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997307), FALSE,
  'excluded status BAN_NHAP is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997308), FALSE,
  'excluded status HUY is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997309), FALSE,
  'excluded status DONG_BAN is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997310), FALSE,
  'excluded status DA_DIEN_RA is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997311), FALSE,
  'excluded status HET_VE is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997101), FALSE,
  'show belonging to another event returns FALSE');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997313), FALSE,
  'Mo = -infinity with finite future Dong and DANG_MO_BAN is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997314), FALSE,
  'Mo = -infinity with NULL Dong and DANG_MO_BAN is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997315), FALSE,
  'finite past Mo with Dong = infinity and DANG_MO_BAN is NOT open');
SELECT is(public.suat_dien_dang_mo_ban(997301, 997316), FALSE,
  'Mo = infinity with NULL Dong and DANG_MO_BAN is NOT open');
RESET ROLE;

-- B5. lay_so_lieu_dinh_gia metrics: multiple seats + holds (no fan-out), NULL timestamps, mo_phong, invalid window
INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "TuyChonMoRong")
VALUES (997301, '{"moPhong": true}'::jsonb);

-- Seats on zone 997301:
--   2 DA_BAN within last 6h (counted in n_sold and so_ban_6h)
--   1 DA_BAN 7h ago (counted in n_sold, NOT in so_ban_6h)
--   1 DA_BAN with NULL NgayCapNhatTrangThai (counted in n_sold, NOT in so_ban_6h)
--   1 TRONG (not counted)
INSERT INTO public."GHE" (
  "GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai", "NgayCapNhatTrangThai"
) VALUES
  (997301, 997301, 'A', '01', 'Z_SEAT-A-01', 'DA_BAN', NOW() - INTERVAL '1 hour'),
  (997302, 997301, 'A', '02', 'Z_SEAT-A-02', 'DA_BAN', NOW() - INTERVAL '5 hours 59 minutes'),
  (997303, 997301, 'A', '03', 'Z_SEAT-A-03', 'DA_BAN', NOW() - INTERVAL '7 hours'),
  (997304, 997301, 'A', '04', 'Z_SEAT-A-04', 'DA_BAN', NULL),
  (997305, 997301, 'A', '05', 'Z_SEAT-A-05', 'TRONG',  NOW() - INTERVAL '30 minutes');

-- Multiple holds (ACTIVE unexpired, expired, RELEASED, plus standing hold with GheID NULL)
INSERT INTO public."GIU_CHO" (
  "GiuChoID", "SuKienID", "SuatDienID", "PhienNguoiDung", "TrangThai", "HetHanLuc"
) VALUES
  ('99730000-0000-0000-0000-000000000001', 997301, 997301, '99730000-0000-0000-0000-0000000000a1', 'ACTIVE',   NOW() + INTERVAL '4 minutes'),
  ('99730000-0000-0000-0000-000000000002', 997301, 997301, '99730000-0000-0000-0000-0000000000a2', 'ACTIVE',   NOW() + INTERVAL '4 minutes'),
  ('99730000-0000-0000-0000-000000000003', 997301, 997301, '99730000-0000-0000-0000-0000000000a3', 'ACTIVE',   NOW() - INTERVAL '1 minute'),
  ('99730000-0000-0000-0000-000000000004', 997301, 997301, '99730000-0000-0000-0000-0000000000a4', 'RELEASED', NOW() + INTERVAL '4 minutes');

INSERT INTO public."CHI_TIET_GIU_CHO" ("GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong")
VALUES
  ('99730000-0000-0000-0000-000000000001', 997301, 997305, 'Z_SEAT-A-05', 1),
  ('99730000-0000-0000-0000-000000000001', 997301, NULL,   'Z_SEAT-H-1',  1),
  ('99730000-0000-0000-0000-000000000002', 997301, NULL,   'Z_SEAT-H-2',  2),
  ('99730000-0000-0000-0000-000000000003', 997301, NULL,   'Z_SEAT-EXP',  3),
  ('99730000-0000-0000-0000-000000000004', 997301, NULL,   'Z_SEAT-REL',  2),
  ('99730000-0000-0000-0000-000000000001', 997302, NULL,   'Z_STAND-1',   3);

-- Rule + PENDING proposal for zone 997301
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT lives_ok(
  $$ SELECT public.luu_quy_tac_gia(997301, 250000, 180000, 400000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  'owner saves rule on zone 997301');
RESET ROLE;

INSERT INTO public."DE_XUAT_GIA" (
  "DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
  "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "TrangThaiDuyet"
)
SELECT 997301, qt."QuyTacGiaID", 997301, 0.06, 0.33, 1.0, 90.0, 250000, 260000, 260000, 'PENDING'
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997301;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';

SELECT is(
  (SELECT count(*)::int FROM public.lay_so_lieu_dinh_gia(997301)),
  3, 'lay_so_lieu_dinh_gia returns only the 3 zones of event 997301 (no cross-event leak)');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, dang_mo_ban, co_quy_tac, kich_hoat, co_pending, de_xuat_pending_id, mo_phong)
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997301),
  ROW(100, 4, 4, 2, TRUE, TRUE, TRUE, TRUE, 997301::bigint, TRUE),
  'zone 997301 has exact n_total/n_sold/n_hold/so_ban_6h (no JOIN fan-out, NULL timestamp excluded from 6h)');
SELECT is(
  (SELECT ROUND(v_actual, 4) FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997301),
  ROUND(2.0 / 6.0, 4),
  'v_actual equals so_ban_6h / 6 (excludes NULL-timestamp DA_BAN seat)');
SELECT is(
  (SELECT ROUND(tong_gio_mo_ban, 2) FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997301),
  100.00::numeric,
  'tong_gio_mo_ban equals 100 hours');
SELECT is(
  (SELECT ROUND(v_target, 4) FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997301),
  1.0000::numeric,
  'v_target equals n_total / tong_gio_mo_ban');
SELECT is(
  (SELECT ROUND(t_rem_gio, 2) FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997301),
  90.00::numeric,
  't_rem_gio equals hours until show start');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, dang_mo_ban, co_quy_tac, kich_hoat, co_pending)
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997302),
  ROW(200, 0, 3, 0, TRUE, FALSE, FALSE, FALSE),
  'standing zone 997302 counts GheID NULL holds and reports co_quy_tac = FALSE');
SELECT is(
  (SELECT ROW(dang_mo_ban, t_rem_gio, tong_gio_mo_ban, v_target)
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997303),
  ROW(FALSE, 0::numeric, NULL::numeric, NULL::numeric),
  'past show with invalid window clamps t_rem_gio at 0 and returns NULL tong_gio_mo_ban / v_target');
RESET ROLE;

-- B6. Infinite timestamps on show 997310 (zone 997303): no interval error, NULL dependent metrics, other zones untouched
-- Case 1: Mo = '-infinity' (BatDau finite in past, Dong NULL)
UPDATE public."SUAT_DIEN"
   SET "ThoiGianMoBanVe" = '-infinity'::timestamptz,
       "ThoiGianDongBanVe" = NULL,
       "ThoiGianBatDau" = NOW() - INTERVAL '3 hours',
       "ThoiGianKetThuc" = NOW() - INTERVAL '1 hour'
 WHERE "SuatDienID" = 997310;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT lives_ok(
  $$ SELECT * FROM public.lay_so_lieu_dinh_gia(997301) $$,
  'lay_so_lieu_dinh_gia does not error when Mo = -infinity');
SELECT is(
  (SELECT count(*)::int FROM public.lay_so_lieu_dinh_gia(997301)),
  3, 'Mo = -infinity keeps 3 zones');
SELECT is(
  (SELECT ROW(dang_mo_ban, t_rem_gio, tong_gio_mo_ban, v_target)
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997303),
  ROW(FALSE, 0::numeric, NULL::numeric, NULL::numeric),
  'Mo = -infinity returns dang_mo_ban = FALSE, finite t_rem_gio, NULL tong_gio_mo_ban and v_target');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, dang_mo_ban, ROUND(v_actual, 4), ROUND(t_rem_gio, 2), ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997301),
  ROW(100, 4, 4, 2, TRUE, ROUND(2.0 / 6.0, 4), 90.00::numeric, 100.00::numeric, 1.0000::numeric),
  'Mo = -infinity leaves zone 997301 unchanged');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, dang_mo_ban, ROUND(t_rem_gio, 2), ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997302),
  ROW(200, 0, 3, 0, TRUE, 90.00::numeric, 100.00::numeric, 2.0000::numeric),
  'Mo = -infinity leaves zone 997302 unchanged');
RESET ROLE;

-- Case 2: Dong = 'infinity' (Mo finite in past, BatDau finite in past — must NOT fall back to BatDau)
UPDATE public."SUAT_DIEN"
   SET "ThoiGianMoBanVe" = NOW() - INTERVAL '1 hour',
       "ThoiGianDongBanVe" = 'infinity'::timestamptz,
       "ThoiGianBatDau" = NOW() - INTERVAL '3 hours',
       "ThoiGianKetThuc" = NOW() - INTERVAL '1 hour'
 WHERE "SuatDienID" = 997310;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT lives_ok(
  $$ SELECT * FROM public.lay_so_lieu_dinh_gia(997301) $$,
  'lay_so_lieu_dinh_gia does not error when Dong = infinity');
SELECT is(
  (SELECT count(*)::int FROM public.lay_so_lieu_dinh_gia(997301)),
  3, 'Dong = infinity keeps 3 zones');
SELECT is(
  (SELECT ROW(dang_mo_ban, t_rem_gio, tong_gio_mo_ban, v_target)
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997303),
  ROW(FALSE, 0::numeric, NULL::numeric, NULL::numeric),
  'Dong = infinity returns dang_mo_ban = FALSE, finite t_rem_gio, NULL tong_gio_mo_ban and v_target without BatDau fallback');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, dang_mo_ban, ROUND(v_actual, 4), ROUND(t_rem_gio, 2), ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997301),
  ROW(100, 4, 4, 2, TRUE, ROUND(2.0 / 6.0, 4), 90.00::numeric, 100.00::numeric, 1.0000::numeric),
  'Dong = infinity leaves zone 997301 unchanged');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, dang_mo_ban, ROUND(t_rem_gio, 2), ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997302),
  ROW(200, 0, 3, 0, TRUE, 90.00::numeric, 100.00::numeric, 2.0000::numeric),
  'Dong = infinity leaves zone 997302 unchanged');
RESET ROLE;

-- Case 3a: BatDau = '-infinity' with finite KetThuc and NULL Dong (COALESCE falls back to BatDau -> all 3 time metrics NULL)
UPDATE public."SUAT_DIEN"
   SET "ThoiGianMoBanVe" = NOW() - INTERVAL '1 hour',
       "ThoiGianDongBanVe" = NULL,
       "ThoiGianBatDau" = '-infinity'::timestamptz,
       "ThoiGianKetThuc" = NOW() - INTERVAL '1 hour'
 WHERE "SuatDienID" = 997310;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT lives_ok(
  $$ SELECT * FROM public.lay_so_lieu_dinh_gia(997301) $$,
  'lay_so_lieu_dinh_gia does not error when BatDau = -infinity and Dong is NULL');
SELECT is(
  (SELECT count(*)::int FROM public.lay_so_lieu_dinh_gia(997301)),
  3, 'BatDau = -infinity (Dong NULL) keeps 3 zones');
SELECT is(
  (SELECT ROW(dang_mo_ban, t_rem_gio, tong_gio_mo_ban, v_target)
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997303),
  ROW(FALSE, NULL::numeric, NULL::numeric, NULL::numeric),
  'BatDau = -infinity with NULL Dong returns dang_mo_ban = FALSE and NULL t_rem_gio, tong_gio_mo_ban, v_target');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, dang_mo_ban, ROUND(v_actual, 4), ROUND(t_rem_gio, 2), ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997301),
  ROW(100, 4, 4, 2, TRUE, ROUND(2.0 / 6.0, 4), 90.00::numeric, 100.00::numeric, 1.0000::numeric),
  'BatDau = -infinity (Dong NULL) leaves zone 997301 unchanged');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, dang_mo_ban, ROUND(t_rem_gio, 2), ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997302),
  ROW(200, 0, 3, 0, TRUE, 90.00::numeric, 100.00::numeric, 2.0000::numeric),
  'BatDau = -infinity (Dong NULL) leaves zone 997302 unchanged');
RESET ROLE;

-- Case 3b: BatDau = '-infinity' with finite KetThuc and finite Dong (t_rem_gio NULL, tong_gio_mo_ban/v_target finite from Dong - Mo)
UPDATE public."SUAT_DIEN"
   SET "ThoiGianMoBanVe" = NOW() - INTERVAL '1 hour',
       "ThoiGianDongBanVe" = NOW() + INTERVAL '9 hours',
       "ThoiGianBatDau" = '-infinity'::timestamptz,
       "ThoiGianKetThuc" = NOW() - INTERVAL '1 hour'
 WHERE "SuatDienID" = 997310;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT lives_ok(
  $$ SELECT * FROM public.lay_so_lieu_dinh_gia(997301) $$,
  'lay_so_lieu_dinh_gia does not error when BatDau = -infinity and Dong is finite');
SELECT is(
  (SELECT count(*)::int FROM public.lay_so_lieu_dinh_gia(997301)),
  3, 'BatDau = -infinity (Dong finite) keeps 3 zones');
SELECT is(
  (SELECT ROW(dang_mo_ban, t_rem_gio, ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997303),
  ROW(FALSE, NULL::numeric, 10.00::numeric, 5.0000::numeric),
  'BatDau = -infinity with finite Dong returns dang_mo_ban = FALSE, NULL t_rem_gio, finite tong_gio_mo_ban and v_target');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, dang_mo_ban, ROUND(v_actual, 4), ROUND(t_rem_gio, 2), ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997301),
  ROW(100, 4, 4, 2, TRUE, ROUND(2.0 / 6.0, 4), 90.00::numeric, 100.00::numeric, 1.0000::numeric),
  'BatDau = -infinity (Dong finite) leaves zone 997301 unchanged');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, dang_mo_ban, ROUND(t_rem_gio, 2), ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997301) WHERE khu_vuc_id = 997302),
  ROW(200, 0, 3, 0, TRUE, 90.00::numeric, 100.00::numeric, 2.0000::numeric),
  'BatDau = -infinity (Dong finite) leaves zone 997302 unchanged');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
