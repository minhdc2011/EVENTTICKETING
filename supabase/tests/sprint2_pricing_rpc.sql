-- pgTAP acceptance test: Sprint 2 pricing RPC contract (T2 + T3 + T4) and NHAT_KY_DINH_GIA audit log
-- Migrations under test: 20261113090000_sprint2_pricing_rpc.sql, 20261113093000_sprint2_pricing_guard.sql,
--   20261113100000_sprint2_demand_simulator.sql.
--
-- STATUS: authored; needs `npm run db:test` (`supabase test db`) against a migrated DB.
-- `npm run check` does NOT run pgTAP, so this file has NOT been shown to pass.
-- Every mutation is inside BEGIN ... ROLLBACK.
--
-- Sections:
--   A. (sonnet) write path: ACL, role matrix, validation, audit rows, narrowing,
--      immutability, audit reads, deletion of zones/shows/events vs. audit.
--   B. (hydrogen) read path, open-for-sale cross-check, metrics isolation,
--      PriceGuard, single-PENDING constraint, 120m TTL, demand simulator.
--
-- Fixture map (IDs 997xxx; UUIDs 5555.../6666...; slugs t2rpc-/t5-):
--   users  ...501 CHU_SO_HUU (org A)  ...502 BIEN_TAP (org A)  ...503 CHU_SO_HUU (org B)
--          ...504 QUAN_TRI (org A)    ...505 VAN_HANH (org A)  ...506 SOAT_VE (org A)
--          ...507 audience (LoaiTaiKhoan USER, no org)
--   orgs   5555...0501 = A, 6666...0601 = B
--   event 997101 (BAN_NHAP, org A) / show 997101; zones 997101 (rule+narrowing), 997102 (warning),
--          997103 (QUAN_TRI save), 997104 (PENDING = floor), 997105 (PENDING = ceiling),
--          997106 (PENDING above ceiling), 997107 (invalid-config no-op), 997108 (PENDING inside frame).
--          Proposals 997201-997208.
--   event 997301 + shows 997301-997317 + zones 997301-997305 (hydrogen: read path + B7 open-for-sale).
--   event 997302 (DA_AN, org A) + show 997312.
--   event 997401 (BAN_NHAP, org A) / shows 997401, 997402 / zones 997401-997404: organizer delete flow.
--          Proposals 997401, 997402. Temp table t5_audit_snapshot holds the audit rows of event 997401.
--   event 997402 (BAN_NHAP, org A) / show 997403 / zone 997405: event deletion vs. audit.
--   event 997501 (CONG_KHAI, org A) / shows 997501, 997502 / zones 997501-997503: B8 metrics isolation & 6h boundary.
--   event 997601 (CONG_KHAI, org A) / show 997601 / zones 997601-997606: B9 PriceGuard & B10 unique PENDING.
--   event 997701 (CONG_KHAI, org A) / show 997701 / zones 997701-997705 / proposals 997701-997707: B11 120m TTL.
--   event 997801 (CONG_KHAI, org A) / shows 997801-997804 / zones 997801-997804 / seats 997801-997850: B12 simulator.
--   Temp table t5_rpc_results captures JSONB return values of mutating RPC calls without double-executing them.

BEGIN;

SELECT plan(261);

-- ============================================================================
-- Fixtures (IDs 997xxx are isolated from other test files)
-- ============================================================================
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('55555555-5555-5555-5555-555555555501', 'authenticated', 'authenticated', 't2rpc-owner@example.com'),
  ('55555555-5555-5555-5555-555555555502', 'authenticated', 'authenticated', 't2rpc-editor@example.com'),
  ('55555555-5555-5555-5555-555555555503', 'authenticated', 'authenticated', 't2rpc-outsider@example.com'),
  ('55555555-5555-5555-5555-555555555504', 'authenticated', 'authenticated', 't2rpc-admin@example.com'),
  ('55555555-5555-5555-5555-555555555505', 'authenticated', 'authenticated', 't2rpc-ops@example.com'),
  ('55555555-5555-5555-5555-555555555506', 'authenticated', 'authenticated', 't2rpc-scanner@example.com'),
  ('55555555-5555-5555-5555-555555555507', 'authenticated', 'authenticated', 't2rpc-audience@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('55555555-5555-5555-5555-555555555501', 'RPC Owner', 'ORGANIZER'),
  ('55555555-5555-5555-5555-555555555502', 'RPC Editor', 'ORGANIZER'),
  ('55555555-5555-5555-5555-555555555503', 'RPC Outsider', 'ORGANIZER'),
  ('55555555-5555-5555-5555-555555555504', 'RPC Admin', 'ORGANIZER'),
  ('55555555-5555-5555-5555-555555555505', 'RPC Ops', 'ORGANIZER'),
  ('55555555-5555-5555-5555-555555555506', 'RPC Scanner', 'ORGANIZER'),
  ('55555555-5555-5555-5555-555555555507', 'RPC Audience', 'USER')
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
  ('66666666-0000-0000-0000-000000000601', '55555555-5555-5555-5555-555555555503', 'CHU_SO_HUU'),
  ('55555555-0000-0000-0000-000000000501', '55555555-5555-5555-5555-555555555504', 'QUAN_TRI'),
  ('55555555-0000-0000-0000-000000000501', '55555555-5555-5555-5555-555555555505', 'VAN_HANH'),
  ('55555555-0000-0000-0000-000000000501', '55555555-5555-5555-5555-555555555506', 'SOAT_VE')
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
  (997102, 997101, 997101, 'T2RPC_Z2', 'Khu 2', 'DUNG_STAND', 500000, '#222222', 100),
  (997103, 997101, 997101, 'T2RPC_Z3', 'Khu 3', 'DUNG_STAND', 200000, '#333333', 100),
  (997104, 997101, 997101, 'T2RPC_Z4', 'Khu 4', 'DUNG_STAND', 200000, '#444444', 100),
  (997105, 997101, 997101, 'T2RPC_Z5', 'Khu 5', 'DUNG_STAND', 200000, '#555555', 100),
  (997106, 997101, 997101, 'T2RPC_Z6', 'Khu 6', 'DUNG_STAND', 200000, '#666666', 100),
  (997107, 997101, 997101, 'T2RPC_Z7', 'Khu 7', 'DUNG_STAND', 200000, '#777777', 100),
  (997108, 997101, 997101, 'T2RPC_Z8', 'Khu 8', 'DUNG_STAND', 200000, '#888888', 100);

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
-- PUBLIC is a pseudo-role: it is grantee 0 in aclexplode, not a role name.
SELECT is(
  (SELECT count(*)::int FROM pg_class c
     CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE c.oid = 'public."NHAT_KY_DINH_GIA"'::regclass
      AND a.grantee = 0
      AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0, 'PUBLIC has no INSERT/UPDATE/DELETE/TRUNCATE on the audit log (relacl)');
SELECT is(
  (SELECT count(*)::int FROM pg_class c
     CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE c.oid = 'public."NHAT_KY_DINH_GIA"'::regclass
      AND a.grantee = 0
      AND a.privilege_type = 'SELECT'),
  0, 'PUBLIC has no SELECT on the audit log (relacl)');
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
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555504';
SELECT is(public.co_quyen_dinh_gia(997101), TRUE, 'QUAN_TRI of the owning org has pricing permission');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555505';
SELECT is(public.co_quyen_dinh_gia(997101), FALSE, 'VAN_HANH member has no pricing permission');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555506';
SELECT is(public.co_quyen_dinh_gia(997101), FALSE, 'SOAT_VE member has no pricing permission');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555507';
SELECT is(public.co_quyen_dinh_gia(997101), FALSE, 'audience account (no membership) has no pricing permission');
RESET ROLE;

SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.role" = 'anon';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok(
  $$ SELECT public.co_quyen_dinh_gia(997101) $$,
  '42501', NULL, 'anon cannot execute co_quyen_dinh_gia');
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
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555505';
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '42501', NULL, 'VAN_HANH member gets 42501');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555506';
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '42501', NULL, 'SOAT_VE member gets 42501');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555507';
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '42501', NULL, 'audience account gets 42501');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(999999999, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '42501', NULL, 'non-existent zone gives 42501 for non-service callers');
RESET ROLE;

SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.role" = 'anon';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997101, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '42501', NULL, 'anon cannot execute luu_quy_tac_gia');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 997101), 0,
  'rejected callers created no rule');

-- QUAN_TRI is allowed to save (zone 997103 keeps 997101's audit counts untouched)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555504';
SELECT lives_ok(
  $$ SELECT public.luu_quy_tac_gia(997103, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  'QUAN_TRI can save a pricing rule');
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "KhuVucID" = 997103 AND "LoaiHanhDong" = 'TAO_QUY_TAC'
      AND "NguoiThucHienID" = '55555555-5555-5555-5555-555555555504' AND "VaiTroToChuc" = 'QUAN_TRI'),
  1, 'QUAN_TRI save is audited with the QUAN_TRI role');

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

-- A7. Narrowing: only out-of-frame PENDING become EXPIRED (TTL ignored).
-- uq_de_xuat_gia_pending_khu_vuc allows ONE PENDING per zone, so each PENDING case has its own zone.
-- Zones 997104-997108 get the same wide rule as 997101 (floor 150000, ceiling 350000).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
DO $$
BEGIN
  PERFORM public.luu_quy_tac_gia(z, 200000, 150000, 350000, 20000, 0.2, 0.3, 0.6, 1, 1, 1, true)
     FROM unnest(ARRAY[997104, 997105, 997106, 997107, 997108]) AS z;
END $$;
RESET ROLE;

-- ThoiGianDeXuat defaults to now(): every proposal is brand new (well under 120 minutes).
INSERT INTO public."DE_XUAT_GIA" (
  "DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
  "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "TrangThaiDuyet"
)
SELECT v.id, qt."QuyTacGiaID", v.zone, 0.5, 5, 4, 48, 200000, v.gia, v.gia, v.st
  FROM public."QUY_TAC_GIA" qt
  JOIN (VALUES
         (997201, 997101, 160000, 'PENDING'),   -- below new floor: expires
         (997205, 997101, 160000, 'APPROVED'),  -- non-PENDING: stays
         (997206, 997101, 400000, 'REJECTED'),  -- non-PENDING: stays
         (997202, 997104, 170000, 'PENDING'),   -- equals new floor: stays
         (997203, 997105, 300000, 'PENDING'),   -- equals new ceiling: stays
         (997204, 997106, 310000, 'PENDING'),   -- above new ceiling: expires
         (997207, 997107, 160000, 'PENDING'),   -- out of the new frame, but only touched by invalid calls
         (997208, 997108, 220000, 'PENDING')    -- strictly inside new frame (170000 < 220000 < 300000): stays
       ) AS v(id, zone, gia, st) ON v.zone = qt."KhuVucID";

-- A7a. Invalid / unauthorised configuration must not change proposals or write audit rows
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997107, 200000, 170000, 300000, 0, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '22023', 'QUY_TAC_GIA_KHONG_HOP_LE: p_buoc_nhay_gia', 'invalid narrowing (step = 0) is rejected');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555502';
SELECT throws_ok(
  $$ SELECT public.luu_quy_tac_gia(997107, 200000, 170000, 300000, 20000, 0.2, 0.3, 0.6, 1, 1, 1, true) $$,
  '42501', NULL, 'unauthorised narrowing (BIEN_TAP) is rejected');
RESET ROLE;
SELECT is(
  (SELECT "TrangThaiDuyet" = 'PENDING' AND "GhiChuDuyet" IS NULL AND "NguoiDuyetID" IS NULL AND "ThoiGianDuyet" IS NULL
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 997207),
  TRUE, 'rejected configuration left the out-of-frame PENDING proposal untouched');
SELECT is(
  (SELECT array_agg("LoaiHanhDong" ORDER BY "NhatKyDinhGiaID") FROM public."NHAT_KY_DINH_GIA" WHERE "KhuVucID" = 997107),
  ARRAY['TAO_QUY_TAC']::varchar[], 'rejected configuration wrote no audit row (only the initial TAO_QUY_TAC exists)');

-- A7b. Valid narrowing to floor 170000 / ceiling 300000
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT is(
  public.luu_quy_tac_gia(997101, 200000, 170000, 300000, 20000, 0.2, 0.3, 0.6, 1, 1, 1, true) -> 'deXuatHetHieuLuc',
  to_jsonb(ARRAY[997201]::bigint[]),
  'narrowing reports exactly the out-of-frame PENDING proposal');
SELECT is(
  public.luu_quy_tac_gia(997106, 200000, 170000, 300000, 20000, 0.2, 0.3, 0.6, 1, 1, 1, true) -> 'deXuatHetHieuLuc',
  to_jsonb(ARRAY[997204]::bigint[]),
  'narrowing above the new ceiling reports the expired proposal');
SELECT is(
  public.luu_quy_tac_gia(997108, 200000, 170000, 300000, 20000, 0.2, 0.3, 0.6, 1, 1, 1, true) -> 'deXuatHetHieuLuc',
  '[]'::jsonb,
  'narrowing with strictly in-frame PENDING reports no expired proposals');
DO $$
BEGIN
  PERFORM public.luu_quy_tac_gia(z, 200000, 170000, 300000, 20000, 0.2, 0.3, 0.6, 1, 1, 1, true)
     FROM unnest(ARRAY[997104, 997105]) AS z;
END $$;
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA"
    WHERE "DeXuatID" IN (997201, 997204) AND "TrangThaiDuyet" = 'EXPIRED'
      AND "GhiChuDuyet" = 'CAU_HINH_THU_HEP_KHUNG'
      AND "NguoiDuyetID" IS NULL AND "ThoiGianDuyet" IS NULL),
  2, 'out-of-frame PENDING are EXPIRED with CAU_HINH_THU_HEP_KHUNG and NULL approver/time');
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA"
    WHERE "DeXuatID" = 997201 AND NOW() - "ThoiGianDeXuat" < INTERVAL '120 minutes'),
  1, 'the expired proposal was younger than 120 minutes (narrowing ignores the TTL)');
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA"
    WHERE "DeXuatID" IN (997202, 997203) AND "TrangThaiDuyet" = 'PENDING'),
  2, 'PENDING equal to the new floor/ceiling stay PENDING');
SELECT is(
  (SELECT "TrangThaiDuyet" = 'PENDING' AND "GhiChuDuyet" IS NULL AND "NguoiDuyetID" IS NULL AND "ThoiGianDuyet" IS NULL
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 997208),
  TRUE, 'PENDING strictly inside the new frame (220000 in [170000, 300000]) stays PENDING untouched');
SELECT is(
  (SELECT array_agg("TrangThaiDuyet" ORDER BY "DeXuatID") FROM public."DE_XUAT_GIA" WHERE "DeXuatID" IN (997205, 997206)),
  ARRAY['APPROVED', 'REJECTED']::varchar[], 'non-PENDING proposals are untouched');
SELECT is(
  (SELECT array_agg("GiaVeNiemYet" ORDER BY "KhuVucID") FROM public."KHU_VUC" WHERE "KhuVucID" IN (997101, 997104, 997105, 997106, 997108)),
  ARRAY[200000.00, 200000.00, 200000.00, 200000.00, 200000.00]::numeric[], 'narrowing does not change GiaVeNiemYet');
SELECT has_column('public', 'KHU_VUC', 'GiaVeNiemYet', 'KHU_VUC.GiaVeNiemYet still exists');
SELECT is(
  (SELECT count(*)::int FROM pg_constraint
    WHERE conrelid = 'public."DE_XUAT_GIA"'::regclass AND conname = 'chk_trang_thai_duyet'
      AND pg_get_constraintdef(oid) LIKE '%PENDING%' AND pg_get_constraintdef(oid) LIKE '%APPROVED%'
      AND pg_get_constraintdef(oid) LIKE '%REJECTED%' AND pg_get_constraintdef(oid) LIKE '%EXPIRED%'),
  1, 'chk_trang_thai_duyet still allows PENDING/APPROVED/REJECTED/EXPIRED');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "LoaiHanhDong" = 'HET_HIEU_LUC_DO_DOI_KHUNG' AND "KhuVucID" = 997101 AND "DeXuatID" = 997201
      AND "DuLieuTruoc" ->> 'trangThaiDuyet' = 'PENDING'
      AND ("DuLieuTruoc" ->> 'giaDeXuat')::numeric = 160000
      AND ("DuLieuTruoc" -> 'khungGia' ->> 'giaSan')::numeric = 150000
      AND ("DuLieuTruoc" -> 'khungGia' ->> 'giaTran')::numeric = 350000
      AND "DuLieuSau" ->> 'trangThaiDuyet' = 'EXPIRED'
      AND "DuLieuSau" ->> 'ghiChuDuyet' = 'CAU_HINH_THU_HEP_KHUNG'
      AND ("DuLieuSau" ->> 'giaDeXuat')::numeric = 160000
      AND ("DuLieuSau" -> 'khungGia' ->> 'giaSan')::numeric = 170000
      AND ("DuLieuSau" -> 'khungGia' ->> 'giaTran')::numeric = 300000
      AND "LyDo" IS NOT NULL AND BTRIM("LyDo") <> ''),
  1, 'DeXuatID 997201 has exactly 1 HET_HIEU_LUC_DO_DOI_KHUNG audit row with full old/new frame and status');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "LoaiHanhDong" = 'HET_HIEU_LUC_DO_DOI_KHUNG' AND "KhuVucID" = 997106 AND "DeXuatID" = 997204
      AND "DuLieuTruoc" ->> 'trangThaiDuyet' = 'PENDING'
      AND ("DuLieuTruoc" ->> 'giaDeXuat')::numeric = 310000
      AND ("DuLieuTruoc" -> 'khungGia' ->> 'giaSan')::numeric = 150000
      AND ("DuLieuTruoc" -> 'khungGia' ->> 'giaTran')::numeric = 350000
      AND "DuLieuSau" ->> 'trangThaiDuyet' = 'EXPIRED'
      AND "DuLieuSau" ->> 'ghiChuDuyet' = 'CAU_HINH_THU_HEP_KHUNG'
      AND ("DuLieuSau" ->> 'giaDeXuat')::numeric = 310000
      AND ("DuLieuSau" -> 'khungGia' ->> 'giaSan')::numeric = 170000
      AND ("DuLieuSau" -> 'khungGia' ->> 'giaTran')::numeric = 300000
      AND "LyDo" IS NOT NULL AND BTRIM("LyDo") <> ''),
  1, 'DeXuatID 997204 has exactly 1 HET_HIEU_LUC_DO_DOI_KHUNG audit row with full old/new frame and status');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "LoaiHanhDong" = 'HET_HIEU_LUC_DO_DOI_KHUNG' AND "DeXuatID" IN (997202, 997203, 997205, 997206, 997207, 997208)),
  0, 'no expiry audit rows for untouched proposals (including strictly in-frame 997208)');

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
SELECT is(
  has_table_privilege('service_role', 'public."NHAT_KY_DINH_GIA"', 'UPDATE')
  AND has_table_privilege('service_role', 'public."NHAT_KY_DINH_GIA"', 'DELETE'),
  TRUE, 'service_role has UPDATE and DELETE table privileges on NHAT_KY_DINH_GIA (blocked by trigger, not ACL)');
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_DINH_GIA" SET "LyDo" = 'tamper' WHERE "KhuVucID" = 997101 $$,
  '42501', 'NHAT_KY_DINH_GIA la nhat ky bat bien: khong cho phep UPDATE',
  'service_role UPDATE on the audit log is rejected by the immutability trigger');
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_DINH_GIA" WHERE "KhuVucID" = 997101 $$,
  '42501', 'NHAT_KY_DINH_GIA la nhat ky bat bien: khong cho phep DELETE',
  'service_role DELETE on the audit log is rejected by the immutability trigger');
RESET ROLE;

-- A8b. Audit reads (RLS by SuKienID -> organisation membership)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT is((SELECT count(*) > 0 FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997101),
  TRUE, 'CHU_SO_HUU reads the audit rows of its event');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555504';
SELECT is((SELECT count(*) > 0 FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997101),
  TRUE, 'QUAN_TRI reads the audit rows of its event');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555502';
SELECT is((SELECT count(*) > 0 FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997101),
  TRUE, 'BIEN_TAP reads the audit rows of its event');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555505';
SELECT is((SELECT count(*) > 0 FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997101),
  TRUE, 'VAN_HANH member reads the audit rows of its event');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555506';
SELECT is((SELECT count(*) > 0 FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997101),
  TRUE, 'SOAT_VE member reads the audit rows of its event');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555507';
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997101),
  0, 'audience account reads no audit rows');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555503';
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997101),
  0, 'member of another org reads no audit rows of this event');
RESET ROLE;

SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.role" = 'anon';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok(
  $$ SELECT count(*) FROM public."NHAT_KY_DINH_GIA" $$,
  '42501', NULL, 'anon cannot SELECT the audit log');
RESET ROLE;

-- A9. Real organizer flow (luu_su_kien_toan_dien) removing zones / shows that own a pricing rule,
-- a proposal and audit rows. The W1 cascade (KHU_VUC -> QUY_TAC_GIA/DE_XUAT_GIA) must not be blocked
-- by the audit log, and no audit row may change. W1 constraints are NOT touched by this test.
-- Fixture event 997401: show 997401 {zones 997401, 997402}, show 997402 {zones 997403, 997404};
-- no GHE, GIU_CHO or NHAT_KY_GIA rows exist for it.
INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES
  (997401, 'T5 Delete Flow Event', 't5-xoa-khu-su-kien', '55555555-0000-0000-0000-000000000501',
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '11 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 days', 'Ha Noi', 'San T5',
   'DANG_MO_BAN', 'BAN_NHAP'),
  (997402, 'T5 Delete Event', 't5-xoa-su-kien', '55555555-0000-0000-0000-000000000501',
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'Ha Noi', 'San T5',
   'DANG_MO_BAN', 'BAN_NHAP');

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  (997401, 997401, 't5-show-1', 'T5 Show 1', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'BAN_NHAP'),
  (997402, 997401, 't5-show-2', 'T5 Show 2', NOW() + INTERVAL '11 days', NOW() + INTERVAL '11 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 days', 'BAN_NHAP'),
  (997403, 997402, 't5-show-del', 'T5 Show Del', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'BAN_NHAP');

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (997401, 997401, 997401, 'T5_S1_A', 'Khu 1A', 'DUNG_STAND', 100000, '#111111', 50),
  (997402, 997401, 997401, 'T5_S1_B', 'Khu 1B', 'DUNG_STAND', 200000, '#222222', 50),
  (997403, 997401, 997402, 'T5_S2_A', 'Khu 2A', 'DUNG_STAND', 150000, '#333333', 50),
  (997404, 997401, 997402, 'T5_S2_B', 'Khu 2B', 'DUNG_STAND', 250000, '#444444', 50),
  (997405, 997402, 997403, 'T5_DEL_A', 'Khu Del', 'DUNG_STAND', 120000, '#555555', 50);

-- Rules, then proposals, then a narrowing that expires them and writes HET_HIEU_LUC_DO_DOI_KHUNG
-- audit rows that reference the proposals (DeXuatID).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
DO $$
BEGIN
  PERFORM public.luu_quy_tac_gia(997401, 100000, 80000, 200000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true);
  PERFORM public.luu_quy_tac_gia(997402, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true);
  PERFORM public.luu_quy_tac_gia(997403, 150000, 100000, 300000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true);
  PERFORM public.luu_quy_tac_gia(997404, 250000, 150000, 400000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true);
  PERFORM public.luu_quy_tac_gia(997405, 120000, 100000, 300000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true);
END $$;
RESET ROLE;

INSERT INTO public."DE_XUAT_GIA" (
  "DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
  "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "TrangThaiDuyet"
)
SELECT v.id, qt."QuyTacGiaID", v.zone, 0.5, 5, 4, 48, v.hien_tai, v.gia, v.gia, 'PENDING'
  FROM public."QUY_TAC_GIA" qt
  JOIN (VALUES (997401, 997402, 200000, 160000), (997402, 997403, 150000, 110000)) AS v(id, zone, hien_tai, gia)
    ON v.zone = qt."KhuVucID";

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
DO $$
BEGIN
  PERFORM public.luu_quy_tac_gia(997402, 200000, 170000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true);
  PERFORM public.luu_quy_tac_gia(997403, 150000, 120000, 300000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true);
END $$;
RESET ROLE;

CREATE TEMP TABLE t5_audit_snapshot AS
SELECT *
  FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401;
GRANT SELECT ON t5_audit_snapshot TO authenticated;

SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "SuKienID" = 997401 AND "LoaiHanhDong" = 'HET_HIEU_LUC_DO_DOI_KHUNG' AND "DeXuatID" IN (997401, 997402)),
  2, 'fixture: audit rows referencing the proposals exist before the deletion');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" IN (997401, 997402, 997403, 997404)),
  0, 'fixture: the zones have no NHAT_KY_GIA rows');
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "KhuVucID" IN (997401, 997402, 997403, 997404))
  + (SELECT count(*)::int FROM public."CHI_TIET_GIU_CHO" WHERE "KhuVucID" IN (997401, 997402, 997403, 997404))
  + (SELECT count(*)::int FROM public."GIU_CHO" WHERE "SuKienID" = 997401),
  0, 'fixture: the event has no seats or holds');

-- A9(i). Drop one zone (997402) from show 997401
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT lives_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
       'eventId', 997401, 'organizationId', '55555555-0000-0000-0000-000000000501',
       'name', 'T5 Delete Flow Event', 'slug', 't5-xoa-khu-su-kien', 'category', 'AM_NHAC', 'locationMode', 'OFFLINE',
       'shows', jsonb_build_array(
         jsonb_build_object('showId', 997401, 'slug', 't5-show-1', 'name', 'T5 Show 1',
           'startsAt', NOW() + INTERVAL '10 days', 'endsAt', NOW() + INTERVAL '10 days 3 hours',
           'saleStartsAt', NOW() - INTERVAL '1 day', 'saleEndsAt', NOW() + INTERVAL '9 days',
           'ticketTiers', jsonb_build_array(
             jsonb_build_object('tierId', 997401, 'code', 'T5_S1_A', 'name', 'Khu 1A', 'type', 'DUNG_STAND',
               'price', 100000, 'capacity', 50, 'color', '#111111'))),
         jsonb_build_object('showId', 997402, 'slug', 't5-show-2', 'name', 'T5 Show 2',
           'startsAt', NOW() + INTERVAL '11 days', 'endsAt', NOW() + INTERVAL '11 days 3 hours',
           'saleStartsAt', NOW() - INTERVAL '1 day', 'saleEndsAt', NOW() + INTERVAL '10 days',
           'ticketTiers', jsonb_build_array(
             jsonb_build_object('tierId', 997403, 'code', 'T5_S2_A', 'name', 'Khu 2A', 'type', 'DUNG_STAND',
               'price', 150000, 'capacity', 50, 'color', '#333333'),
             jsonb_build_object('tierId', 997404, 'code', 'T5_S2_B', 'name', 'Khu 2B', 'type', 'DUNG_STAND',
               'price', 250000, 'capacity', 50, 'color', '#444444')))
       ))) $$,
  'organizer RPC drops a zone that has a rule, a proposal and audit rows');
RESET ROLE;

SELECT is((SELECT count(*)::int FROM public."KHU_VUC" WHERE "KhuVucID" = 997402), 0,
  'A9(i): the omitted zone was deleted');
SELECT is((SELECT count(*)::int FROM public."KHU_VUC" WHERE "KhuVucID" IN (997401, 997403, 997404)), 3,
  'A9(i): the retained zones still exist');
SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 997402), 0,
  'A9(i): W1 cascade removed the rule of the deleted zone');
SELECT is((SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 997401), 0,
  'A9(i): W1 cascade removed the proposal of the deleted zone');
SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" IN (997401, 997403, 997404)), 3,
  'A9(i): rules of retained zones are untouched');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401),
  (SELECT count(*)::int FROM t5_audit_snapshot),
  'A9(i): no audit row was added or removed');
SELECT is(
  (SELECT array_agg("NhatKyDinhGiaID" ORDER BY "NhatKyDinhGiaID") FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401),
  (SELECT array_agg("NhatKyDinhGiaID" ORDER BY "NhatKyDinhGiaID") FROM t5_audit_snapshot),
  'A9(i): all audit history IDs are unchanged');
SELECT is(
  (SELECT array_agg(coalesce("DeXuatID"::text, '-') || ':' || coalesce("KhuVucID"::text, '-') ORDER BY "NhatKyDinhGiaID")
     FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401),
  (SELECT array_agg(coalesce("DeXuatID"::text, '-') || ':' || coalesce("KhuVucID"::text, '-') ORDER BY "NhatKyDinhGiaID")
     FROM t5_audit_snapshot),
  'A9(i): audit DeXuatID/KhuVucID references are unchanged');
SELECT is(
  (SELECT jsonb_agg(to_jsonb(nk.*) ORDER BY nk."NhatKyDinhGiaID")
     FROM public."NHAT_KY_DINH_GIA" nk WHERE nk."SuKienID" = 997401),
  (SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s."NhatKyDinhGiaID")
     FROM t5_audit_snapshot s),
  'A9(i): full audit rows (every column including SuatDienID and QuyTacGiaID) match snapshot');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401),
  (SELECT count(*)::int FROM t5_audit_snapshot),
  'A9(i): org member still reads all audit rows through SuKienID');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555503';
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401),
  0, 'A9(i): member of another org reads none of them');
RESET ROLE;

-- A9(ii). Drop the whole show 997402 (zones 997403 and 997404 with rule, proposal and audit rows)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT lives_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
       'eventId', 997401, 'organizationId', '55555555-0000-0000-0000-000000000501',
       'name', 'T5 Delete Flow Event', 'slug', 't5-xoa-khu-su-kien', 'category', 'AM_NHAC', 'locationMode', 'OFFLINE',
       'shows', jsonb_build_array(
         jsonb_build_object('showId', 997401, 'slug', 't5-show-1', 'name', 'T5 Show 1',
           'startsAt', NOW() + INTERVAL '10 days', 'endsAt', NOW() + INTERVAL '10 days 3 hours',
           'saleStartsAt', NOW() - INTERVAL '1 day', 'saleEndsAt', NOW() + INTERVAL '9 days',
           'ticketTiers', jsonb_build_array(
             jsonb_build_object('tierId', 997401, 'code', 'T5_S1_A', 'name', 'Khu 1A', 'type', 'DUNG_STAND',
               'price', 100000, 'capacity', 50, 'color', '#111111')))
       ))) $$,
  'organizer RPC drops a whole show whose zones have rules, proposals and audit rows');
RESET ROLE;

SELECT is((SELECT count(*)::int FROM public."SUAT_DIEN" WHERE "SuatDienID" = 997402), 0,
  'A9(ii): the omitted show was deleted');
SELECT is((SELECT count(*)::int FROM public."KHU_VUC" WHERE "KhuVucID" IN (997403, 997404)), 0,
  'A9(ii): the zones of the deleted show were deleted');
SELECT is((SELECT count(*)::int FROM public."KHU_VUC" WHERE "KhuVucID" = 997401), 1,
  'A9(ii): the zone of the retained show still exists');
SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" IN (997403, 997404)), 0,
  'A9(ii): W1 cascade removed the rules of the deleted show zones');
SELECT is((SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 997402), 0,
  'A9(ii): W1 cascade removed the proposal of the deleted show zone');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401),
  (SELECT count(*)::int FROM t5_audit_snapshot),
  'A9(ii): no audit row was added or removed');
SELECT is(
  (SELECT array_agg("NhatKyDinhGiaID" ORDER BY "NhatKyDinhGiaID") FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401),
  (SELECT array_agg("NhatKyDinhGiaID" ORDER BY "NhatKyDinhGiaID") FROM t5_audit_snapshot),
  'A9(ii): all audit history IDs are unchanged');
SELECT is(
  (SELECT array_agg(coalesce("DeXuatID"::text, '-') || ':' || coalesce("KhuVucID"::text, '-') ORDER BY "NhatKyDinhGiaID")
     FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401),
  (SELECT array_agg(coalesce("DeXuatID"::text, '-') || ':' || coalesce("KhuVucID"::text, '-') ORDER BY "NhatKyDinhGiaID")
     FROM t5_audit_snapshot),
  'A9(ii): audit DeXuatID/KhuVucID references are unchanged');
SELECT is(
  (SELECT jsonb_agg(to_jsonb(nk.*) ORDER BY nk."NhatKyDinhGiaID")
     FROM public."NHAT_KY_DINH_GIA" nk WHERE nk."SuKienID" = 997401),
  (SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s."NhatKyDinhGiaID")
     FROM t5_audit_snapshot s),
  'A9(ii): full audit rows (every column including SuatDienID and QuyTacGiaID) match snapshot');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401),
  (SELECT count(*)::int FROM t5_audit_snapshot),
  'A9(ii): org member still reads all audit rows through SuKienID');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555503';
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997401),
  0, 'A9(ii): member of another org reads none of them');
RESET ROLE;

-- A9(iii). Deleting the event itself (event 997402 / zone 997405): the audit rows stay in the table
-- but no authenticated user can read them any more (policy joins SU_KIEN).
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997402),
  1, 'fixture: event 997402 has its TAO_QUY_TAC audit row');
SELECT lives_ok(
  $$ DELETE FROM public."SU_KIEN" WHERE "SuKienID" = 997402 $$,
  'the event with a priced zone can be deleted (audit has no FK)');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997402),
  1, 'the audit row of the deleted event still exists');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA" WHERE "SuKienID" = 997402),
  0, 'authenticated cannot read the audit row of a deleted event');
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

-- Shared temp table to capture single-execution JSONB outputs from mutating RPCs
CREATE TEMP TABLE t5_rpc_results (step TEXT PRIMARY KEY, res JSONB NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON t5_rpc_results TO authenticated;

-- ============================================================================
-- B7. Open-for-sale contract extension: at-open boundary, SAP_MO_BAN save,
--     SUAT_DIEN_KHONG_MO_BAN blocks, and cross-check across helpers
-- ============================================================================
INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES (
  997317, 997301, 's-at-open', 'At Open',
  NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
  NOW(), NOW() + INTERVAL '5 hours', 'DANG_MO_BAN'
);

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (997304, 997301, 997302, 'T5_B7_SAP',   'SAP_MO_BAN Zone',  'DUNG_STAND', 220000, '#334466', 100),
  (997305, 997301, 997304, 'T5_B7_EARLY', 'Before Open Zone', 'DUNG_STAND', 220000, '#445577', 100);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';

SELECT is(public.suat_dien_dang_mo_ban(997301, 997317), TRUE,
  'B7: exact ThoiGianMoBanVe = NOW() counts as open');

DO $$
BEGIN
  PERFORM public.luu_quy_tac_gia(997303, 180000, 120000, 300000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true);
  PERFORM public.luu_quy_tac_gia(997304, 220000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true);
  PERFORM public.luu_quy_tac_gia(997305, 220000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true);
END $$;

-- SAP_MO_BAN inside open window can save a valid proposal through luu_de_xuat_gia
INSERT INTO t5_rpc_results (step, res)
SELECT 'b7_sap_save',
       public.luu_de_xuat_gia(997304, qt."QuyTacGiaID", qt."NgayCapNhat", 240000, 238000, 'SAP_MO_BAN open window')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997304;

-- Blocked with SUAT_DIEN_KHONG_MO_BAN on excluded show (997310 DA_DIEN_RA), before-open (997304),
-- and BAN_NHAP event (997101, even though legacy TrangThaiMoBan = DANG_MO_BAN)
INSERT INTO t5_rpc_results (step, res)
SELECT 'b7_closed_show',
       public.luu_de_xuat_gia(997303, qt."QuyTacGiaID", qt."NgayCapNhat", 190000, 190000, 'Excluded show DA_DIEN_RA')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997303;

INSERT INTO t5_rpc_results (step, res)
SELECT 'b7_before_open',
       public.luu_de_xuat_gia(997305, qt."QuyTacGiaID", qt."NgayCapNhat", 230000, 230000, 'Before sale open')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997305;

INSERT INTO t5_rpc_results (step, res)
SELECT 'b7_draft_event',
       public.luu_de_xuat_gia(997103, qt."QuyTacGiaID", qt."NgayCapNhat", 210000, 210000, 'BAN_NHAP event')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997103;

SELECT is(
  (SELECT ROW(res->>'ketQua', (res->>'giaDeXuat')::numeric, (res->>'moPhong')::boolean)
     FROM t5_rpc_results WHERE step = 'b7_sap_save'),
  ROW('DA_LUU'::text, 240000::numeric, TRUE),
  'B7: SAP_MO_BAN zone inside sale window saves proposal (DA_LUU)');
SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b7_closed_show'),
  ROW('BI_CHAN'::text, 'SUAT_DIEN_KHONG_MO_BAN'::text),
  'B7: excluded show status (DA_DIEN_RA) blocks proposal with SUAT_DIEN_KHONG_MO_BAN');
SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b7_before_open'),
  ROW('BI_CHAN'::text, 'SUAT_DIEN_KHONG_MO_BAN'::text),
  'B7: before ThoiGianMoBanVe blocks proposal with SUAT_DIEN_KHONG_MO_BAN');
SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b7_draft_event'),
  ROW('BI_CHAN'::text, 'SUAT_DIEN_KHONG_MO_BAN'::text),
  'B7: BAN_NHAP event blocks proposal with SUAT_DIEN_KHONG_MO_BAN (ignores legacy TrangThaiMoBan)');

-- lay_so_lieu_dinh_gia.dang_mo_ban agrees with suat_dien_dang_mo_ban on every zone of 997301 and 997101
SELECT is(
  (SELECT count(*)::int || ':' || bool_and(m.dang_mo_ban = public.suat_dien_dang_mo_ban(m.su_kien_id, m.suat_dien_id))::text
     FROM public.lay_so_lieu_dinh_gia(997301) m),
  '5:true',
  'B7: lay_so_lieu_dinh_gia.dang_mo_ban matches suat_dien_dang_mo_ban across all 5 zones of event 997301');
SELECT is(
  (SELECT bool_and(NOT m.dang_mo_ban AND m.dang_mo_ban = public.suat_dien_dang_mo_ban(m.su_kien_id, m.suat_dien_id))
     FROM public.lay_so_lieu_dinh_gia(997101) m),
  TRUE,
  'B7: lay_so_lieu_dinh_gia.dang_mo_ban is FALSE and matches suat_dien_dang_mo_ban on BAN_NHAP event 997101');
RESET ROLE;

-- ============================================================================
-- B8. Metrics isolation across multiple shows/zones & exact 6h boundary
-- ============================================================================
INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  997501, 'T5 B8 Metrics Event', 't5-b8-metrics-event', '55555555-0000-0000-0000-000000000501',
  NOW() + INTERVAL '90 hours', NOW() + INTERVAL '95 hours',
  NOW() - INTERVAL '10 hours', NOW() + INTERVAL '90 hours', 'Ha Noi', 'San B8',
  'DANG_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  (997501, 997501, 't5-b8-show-1', 'B8 Show 1', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '10 hours', NOW() + INTERVAL '90 hours', 'DANG_MO_BAN'),
  (997502, 997501, 't5-b8-show-2', 'B8 Show 2', NOW() + INTERVAL '45 hours', NOW() + INTERVAL '48 hours', NOW() - INTERVAL '8 hours',  NOW() + INTERVAL '42 hours', 'DANG_MO_BAN');

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (997501, 997501, 997501, 'T5_B8_S1A', 'B8 S1 Zone A', 'GHE_NGOI',   250000, '#111111', 40),
  (997502, 997501, 997501, 'T5_B8_S1B', 'B8 S1 Zone B', 'DUNG_STAND', 150000, '#222222', 80),
  (997503, 997501, 997502, 'T5_B8_S2A', 'B8 S2 Zone A', 'GHE_NGOI',   300000, '#333333', 60);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
DO $$ BEGIN PERFORM public.cong_bo_su_kien(997501); END $$;
RESET ROLE;

-- Exact 6h boundary (NOW() - 6h included, NOW() - 6h 1s excluded, NULL excluded)
INSERT INTO public."GHE" (
  "GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai", "NgayCapNhatTrangThai"
) VALUES
  (997501, 997501, 'A', '01', 'T5_B8_S1A-A-01', 'DA_BAN', NOW() - INTERVAL '6 hours'),
  (997502, 997501, 'A', '02', 'T5_B8_S1A-A-02', 'DA_BAN', NOW() - INTERVAL '6 hours 1 second'),
  (997503, 997501, 'A', '03', 'T5_B8_S1A-A-03', 'DA_BAN', NULL),
  (997504, 997501, 'A', '04', 'T5_B8_S1A-A-04', 'TRONG',  NOW() - INTERVAL '1 hour'),
  (997511, 997503, 'A', '01', 'T5_B8_S2A-A-01', 'DA_BAN', NOW()),
  (997512, 997503, 'A', '02', 'T5_B8_S2A-A-02', 'DA_BAN', NOW() - INTERVAL '2 hours');

INSERT INTO public."GIU_CHO" (
  "GiuChoID", "SuKienID", "SuatDienID", "PhienNguoiDung", "TrangThai", "HetHanLuc"
) VALUES
  ('99750000-0000-0000-0000-000000000001', 997501, 997501, '99750000-0000-0000-0000-0000000000a1', 'ACTIVE',  NOW() + INTERVAL '5 minutes'),
  ('99750000-0000-0000-0000-000000000002', 997501, 997501, '99750000-0000-0000-0000-0000000000a2', 'ACTIVE',  NOW() - INTERVAL '1 second'),
  ('99750000-0000-0000-0000-000000000003', 997501, 997501, '99750000-0000-0000-0000-0000000000a3', 'EXPIRED', NOW() + INTERVAL '5 minutes'),
  ('99750000-0000-0000-0000-000000000004', 997501, 997502, '99750000-0000-0000-0000-0000000000a4', 'ACTIVE',  NOW() + INTERVAL '5 minutes');

INSERT INTO public."CHI_TIET_GIU_CHO" ("GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong")
VALUES
  ('99750000-0000-0000-0000-000000000001', 997501, 997504, 'T5_B8_S1A-A-04', 1),
  ('99750000-0000-0000-0000-000000000001', 997501, NULL,   'T5_B8_S1A-H1',   2),
  ('99750000-0000-0000-0000-000000000002', 997501, NULL,   'T5_B8_S1A-EXP',  3),
  ('99750000-0000-0000-0000-000000000003', 997501, NULL,   'T5_B8_S1A-STA',  2),
  ('99750000-0000-0000-0000-000000000001', 997502, NULL,   'T5_B8_S1B-H1',   4),
  ('99750000-0000-0000-0000-000000000004', 997503, NULL,   'T5_B8_S2A-H1',   1),
  -- Mismatched show hold (Show 1 GIU_CHO linked to Show 2 zone 997503): must NOT be counted
  ('99750000-0000-0000-0000-000000000001', 997503, NULL,   'T5_B8_CROSS',    2);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';

SELECT is(
  (SELECT count(*)::int FROM public.lay_so_lieu_dinh_gia(997501)),
  3, 'B8: lay_so_lieu_dinh_gia returns exact 3 zones for event 997501');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, ROUND(v_actual, 4), ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997501) WHERE khu_vuc_id = 997501),
  ROW(40, 3, 3, 1, ROUND(1.0 / 6.0, 4), 100.00::numeric, 0.4000::numeric),
  'B8: zone 997501 counts exact NOW()-6h in so_ban_6h, excludes 6h+1s and NULL timestamp, excludes expired/non-ACTIVE holds');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997501) WHERE khu_vuc_id = 997502),
  ROW(80, 0, 4, 0, 100.00::numeric, 0.8000::numeric),
  'B8: zone 997502 on same show keeps separate hold/sold counts (no cross-zone leak)');
SELECT is(
  (SELECT ROW(n_total, n_sold, n_hold, so_ban_6h, ROUND(v_actual, 4), ROUND(tong_gio_mo_ban, 2), ROUND(v_target, 4))
     FROM public.lay_so_lieu_dinh_gia(997501) WHERE khu_vuc_id = 997503),
  ROW(60, 2, 1, 2, ROUND(2.0 / 6.0, 4), 50.00::numeric, 1.2000::numeric),
  'B8: zone 997503 on show 2 keeps separate show counts and ignores cross-show hold');
RESET ROLE;

-- ============================================================================
-- B9. PriceGuard (luu_de_xuat_gia): catalog/ACL, block codes, boundaries,
--     audit persistence, and zero mutation of GiaVeNiemYet / NHAT_KY_GIA
-- ============================================================================
SELECT is(
  has_function_privilege('anon', 'public.luu_de_xuat_gia(integer, bigint, timestamp with time zone, numeric, numeric, text)', 'EXECUTE'),
  FALSE, 'B9: anon cannot execute luu_de_xuat_gia');
SELECT is(
  has_function_privilege('authenticated', 'public.luu_de_xuat_gia(integer, bigint, timestamp with time zone, numeric, numeric, text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.luu_de_xuat_gia(integer, bigint, timestamp with time zone, numeric, numeric, text)', 'EXECUTE'),
  TRUE, 'B9: authenticated and service_role can execute luu_de_xuat_gia');
SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'luu_de_xuat_gia'),
  TRUE, 'B9: luu_de_xuat_gia is SECURITY DEFINER');

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  997601, 'T5 B9 PriceGuard Event', 't5-b9-guard-event', '55555555-0000-0000-0000-000000000501',
  NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
  NOW() - INTERVAL '10 hours', NOW() + INTERVAL '90 hours', 'Ha Noi', 'San B9',
  'DANG_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES (
  997601, 997601, 't5-b9-show-1', 'B9 Show 1',
  NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
  NOW() - INTERVAL '10 hours', NOW() + INTERVAL '90 hours', 'DANG_MO_BAN'
);

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (997601, 997601, 997601, 'T5_B9_Z1', 'Guard Main',        'DUNG_STAND', 200000, '#111111', 100),
  (997602, 997601, 997601, 'T5_B9_Z2', 'Guard Swing Bound', 'DUNG_STAND', 200000, '#222222', 100),
  (997603, 997601, 997601, 'T5_B9_Z3', 'Guard Floor Bound', 'DUNG_STAND', 200000, '#333333', 100),
  (997604, 997601, 997601, 'T5_B9_Z4', 'Guard Ceil Bound',  'DUNG_STAND', 200000, '#444444', 100),
  (997605, 997601, 997601, 'T5_B9_Z5', 'Guard No Rule',     'DUNG_STAND', 200000, '#555555', 100),
  (997606, 997601, 997601, 'T5_B9_Z6', 'Guard Disabled',    'DUNG_STAND', 200000, '#666666', 100);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
DO $$
BEGIN
  PERFORM public.cong_bo_su_kien(997601);
  -- Z1 & Z2: frame [140000, 260000], step 10000, swing 20% (= 40000 on 200000) -> swing narrower than frame
  PERFORM public.luu_quy_tac_gia(997601, 200000, 140000, 260000, 10000, 0.20, 0.3, 0.6, 1, 1, 1, true);
  PERFORM public.luu_quy_tac_gia(997602, 200000, 140000, 260000, 10000, 0.20, 0.3, 0.6, 1, 1, 1, true);
  -- Z3 & Z4: swing 30% (= 60000) >= frame deltas so exact floor (160000) & ceiling (250000) pass swing check
  PERFORM public.luu_quy_tac_gia(997603, 200000, 160000, 250000, 10000, 0.30, 0.3, 0.6, 1, 1, 1, true);
  PERFORM public.luu_quy_tac_gia(997604, 200000, 150000, 250000, 10000, 0.30, 0.3, 0.6, 1, 1, 1, true);
  -- Z6: disabled rule
  PERFORM public.luu_quy_tac_gia(997606, 200000, 150000, 250000, 10000, 0.20, 0.3, 0.6, 1, 1, 1, false);
END $$;

-- Permission checks on luu_de_xuat_gia (42501 and NO audit row)
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555502';
SELECT throws_ok(
  $$ SELECT public.luu_de_xuat_gia(997601, 1, NOW(), 210000, 210000, 'BIEN_TAP denied') $$,
  '42501', NULL, 'B9: BIEN_TAP gets 42501 on luu_de_xuat_gia');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555505';
SELECT throws_ok(
  $$ SELECT public.luu_de_xuat_gia(997601, 1, NOW(), 210000, 210000, 'VAN_HANH denied') $$,
  '42501', NULL, 'B9: VAN_HANH gets 42501 on luu_de_xuat_gia');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555503';
SELECT throws_ok(
  $$ SELECT public.luu_de_xuat_gia(997601, 1, NOW(), 210000, 210000, 'Org B denied') $$,
  '42501', NULL, 'B9: cross-org caller gets 42501 on luu_de_xuat_gia');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555507';
SELECT throws_ok(
  $$ SELECT public.luu_de_xuat_gia(997601, 1, NOW(), 210000, 210000, 'Audience denied') $$,
  '42501', NULL, 'B9: audience gets 42501 on luu_de_xuat_gia');
RESET ROLE;

SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.role" = 'anon';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok(
  $$ SELECT public.luu_de_xuat_gia(997601, 1, NOW(), 210000, 210000, 'anon denied') $$,
  '42501', NULL, 'B9: anon gets 42501 on luu_de_xuat_gia');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "SuKienID" = 997601 AND "LoaiHanhDong" = 'CHAN_DE_XUAT'),
  0, 'B9: 42501 permission rejections write no CHAN_DE_XUAT audit rows');

-- Run all PriceGuard block & boundary cases as CHU_SO_HUU (using real QuyTacGiaID & NgayCapNhat)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';

-- 1. Missing rule (zone 997605)
INSERT INTO t5_rpc_results (step, res)
VALUES ('b9_no_rule', public.luu_de_xuat_gia(997605, 1, NOW(), 210000, 210000, 'No rule'));

-- 2. Mismatched rule ID (zone 997601 passed zone 997602 rule ID)
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_wrong_link',
       public.luu_de_xuat_gia(997601, qt2."QuyTacGiaID", qt1."NgayCapNhat", 210000, 210000, 'Wrong link')
  FROM public."QUY_TAC_GIA" qt1, public."QUY_TAC_GIA" qt2
 WHERE qt1."KhuVucID" = 997601 AND qt2."KhuVucID" = 997602;

-- 3. Stale rule NgayCapNhat -> QUY_TAC_DA_THAY_DOI
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_stale_rule',
       public.luu_de_xuat_gia(997601, qt."QuyTacGiaID", qt."NgayCapNhat" - INTERVAL '1 second', 210000, 210000, 'Stale rule')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997601;

-- 4. Disabled rule -> QUY_TAC_TAT (zone 997606)
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_disabled_rule',
       public.luu_de_xuat_gia(997606, qt."QuyTacGiaID", qt."NgayCapNhat", 210000, 210000, 'Disabled rule')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997606;

-- 5. Below floor (139000 < 140000) -> NGOAI_KHUNG_GIA
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_below_floor',
       public.luu_de_xuat_gia(997601, qt."QuyTacGiaID", qt."NgayCapNhat", 139000, 139000, 'Below floor')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997601;

-- 6. Above ceiling (261000 > 260000) -> NGOAI_KHUNG_GIA
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_above_ceil',
       public.luu_de_xuat_gia(997601, qt."QuyTacGiaID", qt."NgayCapNhat", 261000, 261000, 'Above ceil')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997601;

-- 7. Exceeds swing (241000: |241000-200000| = 41000 > 40000, inside [140000, 260000]) -> VUOT_BIEN_DO
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_over_swing',
       public.luu_de_xuat_gia(997601, qt."QuyTacGiaID", qt."NgayCapNhat", 241000, 241000, 'Over swing')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997601;

-- 8. Below step / deadband (209000: |209000-200000| = 9000 < 10000) -> DUOI_BUOC_NHAY
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_under_step',
       public.luu_de_xuat_gia(997601, qt."QuyTacGiaID", qt."NgayCapNhat", 209000, 209000, 'Under step')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997601;

-- 9. Exact step boundary (210000: |210000-200000| = 10000 = step) -> DA_LUU (strips spoofed [MÔ PHỎNG] prefix)
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_exact_step',
       public.luu_de_xuat_gia(997601, qt."QuyTacGiaID", qt."NgayCapNhat", 210000, 210000, '[MÔ PHỎNG] Exact step')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997601;

-- 10. Duplicate PENDING on zone 997601 (220000 valid, but 997601 now has PENDING) -> DA_CO_PENDING
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_dup_pending',
       public.luu_de_xuat_gia(997601, qt."QuyTacGiaID", qt."NgayCapNhat", 220000, 220000, 'Dup pending')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997601;

-- 11. Exact swing boundary (240000: |240000-200000| = 40000 = 20% swing) -> DA_LUU on zone 997602
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_exact_swing',
       public.luu_de_xuat_gia(997602, qt."QuyTacGiaID", qt."NgayCapNhat", 240000, 240000, 'Exact swing')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997602;

-- 12. Exact floor boundary (160000 = GiaSan) -> DA_LUU with CHAM_GIA_SAN on zone 997603
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_exact_floor',
       public.luu_de_xuat_gia(997603, qt."QuyTacGiaID", qt."NgayCapNhat", 160000, 155000, 'Exact floor')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997603;

-- 13. Exact ceiling boundary (250000 = GiaTran) -> DA_LUU with CHAM_GIA_TRAN on zone 997604
INSERT INTO t5_rpc_results (step, res)
SELECT 'b9_exact_ceil',
       public.luu_de_xuat_gia(997604, qt."QuyTacGiaID", qt."NgayCapNhat", 250000, 260000, 'Exact ceiling')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997604;
RESET ROLE;

-- Assert every blocked code
SELECT is((SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b9_no_rule'),
  ROW('BI_CHAN'::text, 'QUY_TAC_KHONG_TON_TAI'::text), 'B9: missing rule -> BI_CHAN QUY_TAC_KHONG_TON_TAI');
SELECT is((SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b9_wrong_link'),
  ROW('BI_CHAN'::text, 'LIEN_KET_KHONG_HOP_LE'::text), 'B9: mismatched rule ID -> BI_CHAN LIEN_KET_KHONG_HOP_LE');
SELECT is((SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b9_stale_rule'),
  ROW('BI_CHAN'::text, 'QUY_TAC_DA_THAY_DOI'::text), 'B9: stale NgayCapNhat -> BI_CHAN QUY_TAC_DA_THAY_DOI');
SELECT is((SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b9_disabled_rule'),
  ROW('BI_CHAN'::text, 'QUY_TAC_TAT'::text), 'B9: disabled rule -> BI_CHAN QUY_TAC_TAT');
SELECT is((SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b9_below_floor'),
  ROW('BI_CHAN'::text, 'NGOAI_KHUNG_GIA'::text), 'B9: below floor -> BI_CHAN NGOAI_KHUNG_GIA');
SELECT is((SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b9_above_ceil'),
  ROW('BI_CHAN'::text, 'NGOAI_KHUNG_GIA'::text), 'B9: above ceiling -> BI_CHAN NGOAI_KHUNG_GIA');
SELECT is((SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b9_over_swing'),
  ROW('BI_CHAN'::text, 'VUOT_BIEN_DO'::text), 'B9: exceeds max swing -> BI_CHAN VUOT_BIEN_DO');
SELECT is((SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b9_under_step'),
  ROW('BI_CHAN'::text, 'DUOI_BUOC_NHAY'::text), 'B9: below deadband step -> BI_CHAN DUOI_BUOC_NHAY');
SELECT is((SELECT ROW(res->>'ketQua', res->>'maChan') FROM t5_rpc_results WHERE step = 'b9_dup_pending'),
  ROW('BI_CHAN'::text, 'DA_CO_PENDING'::text), 'B9: existing PENDING -> BI_CHAN DA_CO_PENDING');

-- Assert boundary saves
SELECT is(
  (SELECT ROW(res->>'ketQua', (res->>'giaDeXuat')::numeric, res->>'loaiCanhBao', (res->>'moPhong')::boolean)
     FROM t5_rpc_results WHERE step = 'b9_exact_step'),
  ROW('DA_LUU'::text, 210000::numeric, 'BINH_THUONG'::text, FALSE),
  'B9: exact step boundary (210000) saves as BINH_THUONG with moPhong=false');
SELECT is(
  (SELECT "LyDoDeXuat" FROM public."DE_XUAT_GIA"
    WHERE "DeXuatID" = (SELECT (res->>'deXuatId')::bigint FROM t5_rpc_results WHERE step = 'b9_exact_step')),
  'Exact step',
  'B9: non-simulated event strips client-spoofed [MÔ PHỎNG] prefix from LyDoDeXuat');
SELECT is(
  (SELECT ROW(res->>'ketQua', (res->>'giaDeXuat')::numeric, res->>'loaiCanhBao')
     FROM t5_rpc_results WHERE step = 'b9_exact_swing'),
  ROW('DA_LUU'::text, 240000::numeric, 'BINH_THUONG'::text),
  'B9: exact max swing boundary (240000) is saved');
SELECT is(
  (SELECT ROW(res->>'ketQua', (res->>'giaDeXuat')::numeric, res->>'loaiCanhBao')
     FROM t5_rpc_results WHERE step = 'b9_exact_floor'),
  ROW('DA_LUU'::text, 160000::numeric, 'CHAM_GIA_SAN'::text),
  'B9: exact floor boundary (160000) saves with CHAM_GIA_SAN');
SELECT is(
  (SELECT ROW(res->>'ketQua', (res->>'giaDeXuat')::numeric, res->>'loaiCanhBao')
     FROM t5_rpc_results WHERE step = 'b9_exact_ceil'),
  ROW('DA_LUU'::text, 250000::numeric, 'CHAM_GIA_TRAN'::text),
  'B9: exact ceiling boundary (250000) saves with CHAM_GIA_TRAN');

-- Verify audit rows for every blocked call (including multiple blocks on zone 997601),
-- unchanged GiaVeNiemYet, zero NHAT_KY_GIA rows, and only 1 DE_XUAT_GIA row on 997601
SELECT is(
  (SELECT count(*)::int
     FROM t5_rpc_results r
     JOIN public."NHAT_KY_DINH_GIA" nk ON nk."NhatKyDinhGiaID" = (r.res->>'nhatKyId')::bigint
    WHERE r.step LIKE 'b9_%'
      AND r.res->>'ketQua' = 'BI_CHAN'
      AND nk."LoaiHanhDong" = 'CHAN_DE_XUAT'
      AND nk."MaChan" = r.res->>'maChan'
      AND nk."SuKienID" = 997601),
  9, 'B9: all 9 blocked PriceGuard calls wrote matching CHAN_DE_XUAT audit rows with nhatKyId');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "KhuVucID" = 997601 AND "LoaiHanhDong" = 'CHAN_DE_XUAT'),
  7, 'B9: multiple blocked attempts on zone 997601 each write their own audit row (7 rows)');
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 997601),
  1, 'B9: blocked calls created no extra DE_XUAT_GIA rows on zone 997601');
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" IN (997605, 997606)),
  0, 'B9: blocked calls on zones 997605/997606 created zero DE_XUAT_GIA rows');
SELECT is(
  (SELECT count(*)::int FROM public."KHU_VUC" WHERE "SuKienID" = 997601 AND "GiaVeNiemYet" <> 200000.00),
  0, 'B9: PriceGuard never mutates KHU_VUC.GiaVeNiemYet');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" BETWEEN 997601 AND 997606),
  0, 'B9: PriceGuard never writes fake price-application entries into NHAT_KY_GIA');

-- ============================================================================
-- B10. Single-PENDING partial unique index & duplicate prevention
-- NOTE: pgTAP runs inside one transaction and tests sequential duplicate
-- rejection plus the partial unique index definition; it does NOT claim to
-- test concurrent race execution across parallel database sessions.
-- ============================================================================
SELECT has_index('public', 'DE_XUAT_GIA', 'uq_de_xuat_gia_pending_khu_vuc',
  'B10: DE_XUAT_GIA has partial unique index uq_de_xuat_gia_pending_khu_vuc');
SELECT is(
  (SELECT i.indisunique AND i.indpred IS NOT NULL
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%PENDING%'
     FROM pg_index i
     JOIN pg_class ic ON ic.oid = i.indexrelid
     JOIN pg_class tc ON tc.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = tc.relnamespace
    WHERE n.nspname = 'public'
      AND tc.relname = 'DE_XUAT_GIA'
      AND ic.relname = 'uq_de_xuat_gia_pending_khu_vuc'),
  TRUE, 'B10: uq_de_xuat_gia_pending_khu_vuc is UNIQUE and partial on TrangThaiDuyet = PENDING');
SELECT throws_ok(
  $$ INSERT INTO public."DE_XUAT_GIA" (
       "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
       "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "TrangThaiDuyet"
     )
     SELECT qt."QuyTacGiaID", 997601, 0.5, 1.0, 1.0, 20, 200000, 220000, 220000, 'PENDING'
       FROM public."QUY_TAC_GIA" qt WHERE qt."KhuVucID" = 997601 $$,
  '23505', NULL, 'B10: second PENDING row on same zone raises 23505');
SELECT lives_ok(
  $$ INSERT INTO public."DE_XUAT_GIA" (
       "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
       "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "TrangThaiDuyet"
     )
     SELECT qt."QuyTacGiaID", 997601, 0.5, 1.0, 1.0, 20, 200000, 220000, 220000, 'APPROVED'
       FROM public."QUY_TAC_GIA" qt WHERE qt."KhuVucID" = 997601 $$,
  'B10: non-PENDING (APPROVED) row on same zone is allowed by partial index');

-- ============================================================================
-- B11. TTL 120 minutes: het_han_de_xuat_gia & luu_de_xuat_gia pre-check expiry
-- ============================================================================
SELECT is(
  has_function_privilege('anon', 'public.het_han_de_xuat_gia(integer)', 'EXECUTE'),
  FALSE, 'B11: anon cannot execute het_han_de_xuat_gia');
SELECT is(
  has_function_privilege('authenticated', 'public.het_han_de_xuat_gia(integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.het_han_de_xuat_gia(integer)', 'EXECUTE'),
  TRUE, 'B11: authenticated and service_role can execute het_han_de_xuat_gia');
SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'het_han_de_xuat_gia'),
  TRUE, 'B11: het_han_de_xuat_gia is SECURITY DEFINER');

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  997701, 'T5 B11 TTL Event', 't5-b11-ttl-event', '55555555-0000-0000-0000-000000000501',
  NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
  NOW() - INTERVAL '10 hours', NOW() + INTERVAL '90 hours', 'Ha Noi', 'San B11',
  'DANG_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES (
  997701, 997701, 't5-b11-show-1', 'B11 Show 1',
  NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
  NOW() - INTERVAL '10 hours', NOW() + INTERVAL '90 hours', 'DANG_MO_BAN'
);

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (997701, 997701, 997701, 'T5_B11_Z1', 'TTL 119m + non-PENDING', 'DUNG_STAND', 200000, '#111111', 100),
  (997702, 997701, 997701, 'T5_B11_Z2', 'TTL exact 120m',       'DUNG_STAND', 200000, '#222222', 100),
  (997703, 997701, 997701, 'T5_B11_Z3', 'TTL 120m1s',           'DUNG_STAND', 200000, '#333333', 100),
  (997704, 997701, 997701, 'T5_B11_Z4', 'TTL 121m guard expire',  'DUNG_STAND', 200000, '#444444', 100),
  (997705, 997701, 997701, 'T5_B11_Z5', 'TTL 121m rpc expire',    'DUNG_STAND', 200000, '#555555', 100);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
DO $$
BEGIN
  PERFORM public.cong_bo_su_kien(997701);
  PERFORM public.luu_quy_tac_gia(z, 200000, 150000, 350000, 10000, 0.2, 0.3, 0.6, 1, 1, 1, true)
     FROM unnest(ARRAY[997701, 997702, 997703, 997704, 997705]) AS z;
END $$;
RESET ROLE;

INSERT INTO public."DE_XUAT_GIA" (
  "DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
  "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "TrangThaiDuyet", "ThoiGianDeXuat"
)
SELECT v.id, qt."QuyTacGiaID", v.zone, 0.5, 5, 4, 48, 200000, 210000, 210000, v.st, NOW() - v.age
  FROM public."QUY_TAC_GIA" qt
  JOIN (VALUES
         (997701, 997701, 'PENDING',  INTERVAL '119 minutes'),
         (997706, 997701, 'APPROVED', INTERVAL '180 minutes'),
         (997707, 997701, 'REJECTED', INTERVAL '180 minutes'),
         (997702, 997702, 'PENDING',  INTERVAL '120 minutes'),
         (997703, 997703, 'PENDING',  INTERVAL '120 minutes 1 second'),
         (997704, 997704, 'PENDING',  INTERVAL '121 minutes'),
         (997705, 997705, 'PENDING',  INTERVAL '121 minutes')
       ) AS v(id, zone, st, age) ON v.zone = qt."KhuVucID";

-- Permission checks on het_han_de_xuat_gia (42501)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555502';
SELECT throws_ok($$ SELECT public.het_han_de_xuat_gia(997701) $$,
  '42501', NULL, 'B11: BIEN_TAP gets 42501 on het_han_de_xuat_gia');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555505';
SELECT throws_ok($$ SELECT public.het_han_de_xuat_gia(997701) $$,
  '42501', NULL, 'B11: VAN_HANH gets 42501 on het_han_de_xuat_gia');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555503';
SELECT throws_ok($$ SELECT public.het_han_de_xuat_gia(997701) $$,
  '42501', NULL, 'B11: cross-org caller gets 42501 on het_han_de_xuat_gia');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555507';
SELECT throws_ok($$ SELECT public.het_han_de_xuat_gia(997701) $$,
  '42501', NULL, 'B11: audience gets 42501 on het_han_de_xuat_gia');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT throws_ok($$ SELECT public.het_han_de_xuat_gia(NULL) $$,
  '42501', NULL, 'B11: NULL event gets 42501 on het_han_de_xuat_gia');
RESET ROLE;

SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.role" = 'anon';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok($$ SELECT public.het_han_de_xuat_gia(997701) $$,
  '42501', NULL, 'B11: anon gets 42501 on het_han_de_xuat_gia');
RESET ROLE;

-- First test luu_de_xuat_gia expiring overdue PENDING (997704 at 121m) BEFORE duplicate check,
-- while exact 120m (997702) stays PENDING and blocks new proposal with DA_CO_PENDING.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';

INSERT INTO t5_rpc_results (step, res)
SELECT 'b11_guard_121m',
       public.luu_de_xuat_gia(997704, qt."QuyTacGiaID", qt."NgayCapNhat", 220000, 220000, 'After 121m TTL')
  FROM public."QUY_TAC_GIA" qt WHERE qt."KhuVucID" = 997704;

INSERT INTO t5_rpc_results (step, res)
SELECT 'b11_guard_exact_120m',
       public.luu_de_xuat_gia(997702, qt."QuyTacGiaID", qt."NgayCapNhat", 220000, 220000, 'At exact 120m')
  FROM public."QUY_TAC_GIA" qt WHERE qt."KhuVucID" = 997702;

INSERT INTO t5_rpc_results (step, res)
VALUES ('b11_het_han_rpc', public.het_han_de_xuat_gia(997701));
RESET ROLE;

SELECT is(
  (SELECT ROW(res->>'ketQua', res->'deXuatHetHan') FROM t5_rpc_results WHERE step = 'b11_guard_121m'),
  ROW('DA_LUU'::text, to_jsonb(ARRAY[997704]::bigint[])),
  'B11: luu_de_xuat_gia expires 121m PENDING before duplicate check and saves new proposal');
SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'maChan', res->'deXuatHetHan') FROM t5_rpc_results WHERE step = 'b11_guard_exact_120m'),
  ROW('BI_CHAN'::text, 'DA_CO_PENDING'::text, '[]'::jsonb),
  'B11: exact 120m PENDING does NOT expire and still triggers DA_CO_PENDING');
SELECT is(
  (SELECT ROW((res->>'suKienId')::int, (res->>'soLuong')::int, res->'deXuatHetHan')
     FROM t5_rpc_results WHERE step = 'b11_het_han_rpc'),
  ROW(997701, 2, to_jsonb(ARRAY[997703, 997705]::bigint[])),
  'B11: het_han_de_xuat_gia expires 120m1s (997703) and 121m (997705) only');
SELECT is(
  (SELECT array_agg("TrangThaiDuyet" ORDER BY "DeXuatID")
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" IN (997701, 997702, 997706, 997707)),
  ARRAY['PENDING', 'PENDING', 'APPROVED', 'REJECTED']::varchar[],
  'B11: 119m PENDING, exact 120m PENDING, and overdue APPROVED/REJECTED stay untouched');
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA"
    WHERE "DeXuatID" IN (997703, 997704, 997705)
      AND "TrangThaiDuyet" = 'EXPIRED'
      AND "GhiChuDuyet" = 'HET_HAN_TTL_120_PHUT'
      AND "NguoiDuyetID" IS NULL AND "ThoiGianDuyet" IS NULL),
  3, 'B11: overdue PENDING rows become EXPIRED with HET_HAN_TTL_120_PHUT and NULL approver/time');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_DINH_GIA"
    WHERE "SuKienID" = 997701 AND "LoaiHanhDong" = 'HET_HIEU_LUC_DO_DOI_KHUNG'),
  0, 'B11: TTL expiry writes no HET_HIEU_LUC_DO_DOI_KHUNG audit rows');

-- ============================================================================
-- B12. Demand simulator (mo_phong_nhu_cau): gates, open-show scope,
--      3 scenarios preserving simulated NgayCapNhatTrangThai, [MÔ PHỎNG] tag
-- ============================================================================
SELECT is(
  has_function_privilege('anon', 'public.mo_phong_nhu_cau(integer, text)', 'EXECUTE'),
  FALSE, 'B12: anon cannot execute mo_phong_nhu_cau');
SELECT is(
  has_function_privilege('authenticated', 'public.mo_phong_nhu_cau(integer, text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.mo_phong_nhu_cau(integer, text)', 'EXECUTE'),
  TRUE, 'B12: authenticated and service_role can execute mo_phong_nhu_cau');

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  997801, 'T5 B12 Simulator Event', 't5-b12-sim-event', '55555555-0000-0000-0000-000000000501',
  NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
  NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'Ha Noi', 'San B12',
  'DANG_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  (997801, 997801, 't5-b12-open-dang', 'B12 Open DANG_MO_BAN', NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'DANG_MO_BAN'),
  (997802, 997801, 't5-b12-open-sap',  'B12 Open SAP_MO_BAN',  NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'SAP_MO_BAN'),
  (997803, 997801, 't5-b12-closed',    'B12 Closed',          NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'DONG_BAN'),
  (997804, 997801, 't5-b12-early',     'B12 Before Open',     NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours', NOW() + INTERVAL '2 hours',  NOW() + INTERVAL '80 hours', 'DANG_MO_BAN');

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (997801, 997801, 997801, 'T5_B12_Z1', 'B12 Open Seated',     'GHE_NGOI', 300000, '#111111', 20),
  (997802, 997801, 997802, 'T5_B12_Z2', 'B12 SAP Open Seated', 'GHE_NGOI', 250000, '#222222', 10),
  (997803, 997801, 997803, 'T5_B12_Z3', 'B12 Closed Seated',   'GHE_NGOI', 200000, '#333333', 10),
  (997804, 997801, 997804, 'T5_B12_Z4', 'B12 Early Seated',    'GHE_NGOI', 200000, '#444444', 10);

INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 997800 + n, 997801, 'A', lpad(n::text, 2, '0'), 'T5_B12_Z1-A-' || lpad(n::text, 2, '0'), 'TRONG'
  FROM generate_series(1, 20) AS n;
INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 997820 + n, 997802, 'A', lpad(n::text, 2, '0'), 'T5_B12_Z2-A-' || lpad(n::text, 2, '0'), 'TRONG'
  FROM generate_series(1, 10) AS n;
INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 997830 + n, 997803, 'A', lpad(n::text, 2, '0'), 'T5_B12_Z3-A-' || lpad(n::text, 2, '0'), 'TRONG'
  FROM generate_series(1, 10) AS n;
INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 997840 + n, 997804, 'A', lpad(n::text, 2, '0'), 'T5_B12_Z4-A-' || lpad(n::text, 2, '0'), 'TRONG'
  FROM generate_series(1, 10) AS n;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
DO $$
BEGIN
  PERFORM public.cong_bo_su_kien(997801);
  PERFORM public.luu_quy_tac_gia(997801, 300000, 200000, 450000, 10000, 0.25, 0.3, 0.6, 1, 1, 1, true);
END $$;

-- Simulator gate rejections (missing CAU_HINH_SU_KIEN, bad/NULL scenario, wrong roles, moPhong=false)
SELECT throws_ok($$ SELECT public.mo_phong_nhu_cau(997801, 'sai_kich_ban') $$,
  '22023', 'KICH_BAN_KHONG_HOP_LE', 'B12: invalid scenario rejected with 22023');
SELECT throws_ok($$ SELECT public.mo_phong_nhu_cau(997801, NULL) $$,
  '22023', 'KICH_BAN_KHONG_HOP_LE', 'B12: NULL scenario rejected with 22023');
SELECT throws_ok($$ SELECT public.mo_phong_nhu_cau(997801, 'ban_nhanh') $$,
  '55000', 'MO_PHONG_CHUA_BAT', 'B12: missing CAU_HINH_SU_KIEN rejected with 55000');

SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555502';
SELECT throws_ok($$ SELECT public.mo_phong_nhu_cau(997801, 'ban_nhanh') $$,
  '42501', NULL, 'B12: BIEN_TAP rejected with 42501');
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555503';
SELECT throws_ok($$ SELECT public.mo_phong_nhu_cau(997801, 'ban_nhanh') $$,
  '42501', NULL, 'B12: cross-org owner rejected with 42501');
RESET ROLE;

SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.role" = 'anon';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok($$ SELECT public.mo_phong_nhu_cau(997801, 'ban_nhanh') $$,
  '42501', NULL, 'B12: anon rejected with 42501');
RESET ROLE;

INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "TuyChonMoRong")
VALUES (997801, '{"moPhong": false}'::jsonb);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
SELECT throws_ok($$ SELECT public.mo_phong_nhu_cau(997801, 'ban_nhanh') $$,
  '55000', 'MO_PHONG_CHUA_BAT', 'B12: moPhong=false rejected with 55000');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" BETWEEN 997801 AND 997850 AND "TrangThai" = 'DA_BAN'),
  0, 'B12: simulator rejections leave all seats TRONG');

-- Enable moPhong=true and execute all 3 scenarios
UPDATE public."CAU_HINH_SU_KIEN"
   SET "TuyChonMoRong" = '{"moPhong": true}'::jsonb
 WHERE "SuKienID" = 997801;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
INSERT INTO t5_rpc_results (step, res)
VALUES ('b12_ban_nhanh', public.mo_phong_nhu_cau(997801, 'ban_nhanh'));
SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'nhan', (res->>'moPhong')::boolean, res->>'kichBan', res->'suatDaMoPhong')
     FROM t5_rpc_results WHERE step = 'b12_ban_nhanh'),
  ROW('DA_MO_PHONG'::text, 'MO_PHONG'::text, TRUE, 'ban_nhanh'::text, to_jsonb(ARRAY[997801, 997802]::bigint[])),
  'B12: ban_nhanh returns DA_MO_PHONG, MO_PHONG, and simulates only open shows (DANG_MO_BAN + SAP_MO_BAN)');
SELECT is(
  (SELECT ROW(n_sold, so_ban_6h, mo_phong)
     FROM public.lay_so_lieu_dinh_gia(997801) WHERE khu_vuc_id = 997801),
  ROW(14, 14, TRUE),
  'B12: ban_nhanh sells 14/20 seats in zone 997801 within 6h');
RESET ROLE;
SELECT is(
  (SELECT bool_and(g."NgayCapNhatTrangThai" = m."ThoiDiemGiaLap")
      AND MIN(g."NgayCapNhatTrangThai") < NOW() - INTERVAL '3 hours'
     FROM public."GHE" g
     JOIN public."MO_PHONG_GHE" m ON m."GheID" = g."GheID"
    WHERE g."KhuVucID" = 997801 AND g."TrangThai" = 'DA_BAN'),
  TRUE, 'B12: ban_nhanh timestamps equal simulated ThoiDiemGiaLap (not overwritten with now())');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555504';
INSERT INTO t5_rpc_results (step, res)
VALUES ('b12_ban_cham', public.mo_phong_nhu_cau(997801, 'ban_cham'));
SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'nhan', (res->>'moPhong')::boolean, res->>'kichBan')
     FROM t5_rpc_results WHERE step = 'b12_ban_cham'),
  ROW('DA_MO_PHONG'::text, 'MO_PHONG'::text, TRUE, 'ban_cham'::text),
  'B12: ban_cham (run by QUAN_TRI) returns DA_MO_PHONG and MO_PHONG');
SELECT is(
  (SELECT ROW(n_sold, so_ban_6h)
     FROM public.lay_so_lieu_dinh_gia(997801) WHERE khu_vuc_id = 997801),
  ROW(2, 0),
  'B12: ban_cham sells 2/20 seats outside 6h window');
RESET ROLE;
SELECT is(
  (SELECT bool_and(g."NgayCapNhatTrangThai" = m."ThoiDiemGiaLap")
      AND MAX(g."NgayCapNhatTrangThai") < NOW() - INTERVAL '6 hours'
     FROM public."GHE" g
     JOIN public."MO_PHONG_GHE" m ON m."GheID" = g."GheID"
    WHERE g."KhuVucID" = 997801 AND g."TrangThai" = 'DA_BAN'),
  TRUE, 'B12: ban_cham timestamps equal simulated ThoiDiemGiaLap (< NOW() - 6h)');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
INSERT INTO t5_rpc_results (step, res)
VALUES ('b12_ban_deu', public.mo_phong_nhu_cau(997801, 'ban_deu'));
SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'nhan', (res->>'moPhong')::boolean, res->>'kichBan')
     FROM t5_rpc_results WHERE step = 'b12_ban_deu'),
  ROW('DA_MO_PHONG'::text, 'MO_PHONG'::text, TRUE, 'ban_deu'::text),
  'B12: ban_deu returns DA_MO_PHONG and MO_PHONG');
SELECT is(
  (SELECT ROW(n_sold, so_ban_6h)
     FROM public.lay_so_lieu_dinh_gia(997801) WHERE khu_vuc_id = 997801),
  ROW(7, 2),
  'B12: ban_deu sells 7/20 seats over 20h window (so_ban_6h=2)');
RESET ROLE;
SELECT is(
  (SELECT bool_and(g."NgayCapNhatTrangThai" = m."ThoiDiemGiaLap")
      AND MIN(g."NgayCapNhatTrangThai") < NOW() - INTERVAL '10 hours'
     FROM public."GHE" g
     JOIN public."MO_PHONG_GHE" m ON m."GheID" = g."GheID"
    WHERE g."KhuVucID" = 997801 AND g."TrangThai" = 'DA_BAN'),
  TRUE, 'B12: ban_deu timestamps equal simulated ThoiDiemGiaLap (not overwritten with now())');

SELECT is(
  (SELECT count(*)::int FROM public."GHE"
    WHERE "KhuVucID" IN (997803, 997804) AND "TrangThai" <> 'TRONG'),
  0, 'B12: simulator never writes to closed (DONG_BAN) or before-open shows');

-- Proposal created on simulated event gets [MÔ PHỎNG] prefix
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555501';
INSERT INTO t5_rpc_results (step, res)
SELECT 'b12_sim_proposal',
       public.luu_de_xuat_gia(997801, qt."QuyTacGiaID", qt."NgayCapNhat", 320000, 318000, 'Tang gia sau mo phong')
  FROM public."QUY_TAC_GIA" qt
 WHERE qt."KhuVucID" = 997801;
RESET ROLE;

SELECT is(
  (SELECT (r.res->>'ketQua') = 'DA_LUU'
      AND (r.res->>'moPhong')::boolean
      AND dx."LyDoDeXuat" LIKE '[MÔ PHỎNG]%'
     FROM t5_rpc_results r
     JOIN public."DE_XUAT_GIA" dx ON dx."DeXuatID" = (r.res->>'deXuatId')::bigint
    WHERE r.step = 'b12_sim_proposal'),
  TRUE, 'B12: proposal created on simulated event has moPhong=true and LyDoDeXuat LIKE [MÔ PHỎNG]%');

SELECT * FROM finish();
ROLLBACK;
