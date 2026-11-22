-- pgTAP acceptance tests: Sprint 2 purchase configuration (SoVeToiDaMoiDon, YeuCauXacMinhOTP)
-- with role gate and immutable audit (W4 T2/T4).
-- Migration under test: 20261115100000_sprint2_purchase_config.sql
--   public.luu_cau_hinh_mua_ve(INT, INT, BOOLEAN)
--   public."NHAT_KY_CAU_HINH_MUA_VE" (append-only audit, RLS)
--   triggers on CAU_HINH_SU_KIEN (every write path: RPC, direct DML, luu_su_kien_toan_dien)
--
-- All fixtures are created here (no dependency on supabase/seed.sql) and everything
-- runs inside BEGIN ... ROLLBACK. Fixture ids use 998xxx and UUIDs 99999999-...
--   Users (auth.users + HO_SO_NGUOI_DUNG):
--     ...0001 owner   ORGANIZER  CHU_SO_HUU of org A
--     ...0002 admin   ORGANIZER  QUAN_TRI   of org A
--     ...0003 editor  ORGANIZER  BIEN_TAP   of org A
--     ...0004 ops     ORGANIZER  VAN_HANH   of org A
--     ...0005 scanner ORGANIZER  SOAT_VE    of org A
--     ...0006 buyer   USER       (no membership)
--     ...0007 owner B ORGANIZER  CHU_SO_HUU of org B
--   Events: 998101 (org A, config 4/FALSE), 998102 (org A, NO config row), 998201 (org B)

BEGIN;

SELECT plan(62);

-- ============================================================================
-- Fixtures (postgres; no JWT, so only writes equal to the 4/FALSE defaults are audited-free)
-- ============================================================================
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('99999999-9999-4999-8999-000000000001', 'authenticated', 'authenticated', 'pc-owner@example.com'),
  ('99999999-9999-4999-8999-000000000002', 'authenticated', 'authenticated', 'pc-admin@example.com'),
  ('99999999-9999-4999-8999-000000000003', 'authenticated', 'authenticated', 'pc-editor@example.com'),
  ('99999999-9999-4999-8999-000000000004', 'authenticated', 'authenticated', 'pc-ops@example.com'),
  ('99999999-9999-4999-8999-000000000005', 'authenticated', 'authenticated', 'pc-scanner@example.com'),
  ('99999999-9999-4999-8999-000000000006', 'authenticated', 'authenticated', 'pc-buyer@example.com'),
  ('99999999-9999-4999-8999-000000000007', 'authenticated', 'authenticated', 'pc-owner-b@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('99999999-9999-4999-8999-000000000001', 'PC Owner', 'ORGANIZER'),
  ('99999999-9999-4999-8999-000000000002', 'PC Admin', 'ORGANIZER'),
  ('99999999-9999-4999-8999-000000000003', 'PC Editor', 'ORGANIZER'),
  ('99999999-9999-4999-8999-000000000004', 'PC Ops', 'ORGANIZER'),
  ('99999999-9999-4999-8999-000000000005', 'PC Scanner', 'ORGANIZER'),
  ('99999999-9999-4999-8999-000000000006', 'PC Buyer', 'USER'),
  ('99999999-9999-4999-8999-000000000007', 'PC Owner B', 'ORGANIZER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES
  ('99999999-0000-4999-8999-0000000000a1', 'PC Org A', 'pc-org-a'),
  ('99999999-0000-4999-8999-0000000000b1', 'PC Org B', 'pc-org-b')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('99999999-0000-4999-8999-0000000000a1', '99999999-9999-4999-8999-000000000001', 'CHU_SO_HUU'),
  ('99999999-0000-4999-8999-0000000000a1', '99999999-9999-4999-8999-000000000002', 'QUAN_TRI'),
  ('99999999-0000-4999-8999-0000000000a1', '99999999-9999-4999-8999-000000000003', 'BIEN_TAP'),
  ('99999999-0000-4999-8999-0000000000a1', '99999999-9999-4999-8999-000000000004', 'VAN_HANH'),
  ('99999999-0000-4999-8999-0000000000a1', '99999999-9999-4999-8999-000000000005', 'SOAT_VE'),
  ('99999999-0000-4999-8999-0000000000b1', '99999999-9999-4999-8999-000000000007', 'CHU_SO_HUU')
ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES
  (998101, 'PC Event A1', 'pc-event-a1', '99999999-0000-4999-8999-0000000000a1',
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'Ha Noi', 'San PC 1', 'DANG_MO_BAN', 'BAN_NHAP'),
  (998102, 'PC Event A2 (no config row)', 'pc-event-a2', '99999999-0000-4999-8999-0000000000a1',
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'Ha Noi', 'San PC 2', 'DANG_MO_BAN', 'BAN_NHAP'),
  (998201, 'PC Event B1', 'pc-event-b1', '99999999-0000-4999-8999-0000000000b1',
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'Ha Noi', 'San PC 3', 'DANG_MO_BAN', 'BAN_NHAP');

-- Same as the defaults (4/FALSE): no audit and no JWT needed.
INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "SoVeToiDaMoiDon", "YeuCauXacMinhOTP")
VALUES (998101, 4, FALSE), (998201, 4, FALSE);

SELECT is(
  (SELECT COUNT(*)::int FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" IN (998101, 998102, 998201)),
  0,
  'Fixture rows equal to the 4/FALSE defaults write no audit row');

-- ============================================================================
-- 1. Owner saves a change: config updated, exactly one audit row with full detail
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000001';

SELECT is(
  (SELECT public.luu_cau_hinh_mua_ve(998101, 8, TRUE)),
  jsonb_build_object('suKienId', 998101, 'soVeToiDaMoiDon', 8, 'yeuCauXacMinhOtp', TRUE, 'daThayDoi', TRUE),
  'CHU_SO_HUU saves 8/TRUE and the RPC reports daThayDoi = true');

RESET ROLE;

SELECT is(
  (SELECT ROW("SoVeToiDaMoiDon", "YeuCauXacMinhOTP") FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = 998101),
  ROW(8, TRUE),
  'Config row now holds 8/TRUE');

SELECT is(
  (SELECT COUNT(*)::int FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998101),
  1,
  'Changing both parameters writes exactly ONE audit row');

SELECT is(
  (SELECT ROW("NguoiThucHienID", "VaiTroToChuc"::text, "SoVeToiDaCu", "SoVeToiDaMoi", "YeuCauOtpCu", "YeuCauOtpMoi")
     FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998101),
  ROW('99999999-9999-4999-8999-000000000001'::uuid, 'CHU_SO_HUU'::text, 4, 8, FALSE, TRUE),
  'Audit row records actor (auth.uid()), role, old/new max tickets and old/new OTP flag');

-- ============================================================================
-- 2. QUAN_TRI changes only the OTP flag: one more audit row with role QUAN_TRI
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000002';

SELECT is(
  (SELECT public.luu_cau_hinh_mua_ve(998101, 8, FALSE) ->> 'daThayDoi'),
  'true',
  'QUAN_TRI changing only the OTP flag is a change');

RESET ROLE;

SELECT is(
  (SELECT ROW("VaiTroToChuc"::text, "SoVeToiDaCu", "SoVeToiDaMoi", "YeuCauOtpCu", "YeuCauOtpMoi")
     FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998101 ORDER BY "NhatKyCauHinhMuaVeID" DESC LIMIT 1),
  ROW('QUAN_TRI'::text, 8, 8, TRUE, FALSE),
  'Second audit row: role QUAN_TRI, max unchanged, OTP TRUE -> FALSE');

SELECT is(
  (SELECT COUNT(*)::int FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998101),
  2,
  'Two changes produce two audit rows in total');

-- ============================================================================
-- 3. Saving identical values: no change, no audit
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000001';

SELECT is(
  (SELECT public.luu_cau_hinh_mua_ve(998101, 8, FALSE) ->> 'daThayDoi'),
  'false',
  'Saving identical values reports daThayDoi = false');

RESET ROLE;

SELECT is(
  (SELECT COUNT(*)::int FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998101),
  2,
  'Saving identical values adds no audit row');

-- ============================================================================
-- 4. Boundaries and invalid input
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000001';

SELECT lives_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 1, FALSE) $$, 'Lower bound 1 is valid');
SELECT lives_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 20, FALSE) $$, 'Upper bound 20 is valid');
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 0, FALSE) $$, '22023', NULL, '0 is rejected');
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 21, FALSE) $$, '22023', NULL, '21 is rejected');
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, NULL, FALSE) $$, '22023', NULL, 'NULL max tickets is rejected');
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 4, NULL) $$, '22023', NULL, 'NULL OTP flag is rejected');
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(NULL, 4, FALSE) $$, '22023', NULL, 'NULL event id is rejected');
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(999999, 4, FALSE) $$, 'P0002', 'SU_KIEN_KHONG_TON_TAI', 'Unknown event is reported clearly');

RESET ROLE;

SELECT is(
  (SELECT ROW("SoVeToiDaMoiDon", "YeuCauXacMinhOTP") FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = 998101),
  ROW(20, FALSE),
  'Rejected calls changed nothing; last valid save (20/FALSE) stays');

-- ============================================================================
-- 5. Event without a config row: created with defaults, audited only when it differs
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000001';

SELECT is(
  (SELECT public.luu_cau_hinh_mua_ve(998102, 4, FALSE) ->> 'daThayDoi'),
  'false',
  'Event without a row: saving the defaults (4/FALSE) is not a change');

RESET ROLE;

SELECT is(
  (SELECT COUNT(*)::int FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = 998102),
  1,
  'The missing config row was created');

SELECT is(
  (SELECT COUNT(*)::int FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998102),
  0,
  'Creating the row with defaults writes no audit');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000001';
SELECT lives_ok($$ SELECT public.luu_cau_hinh_mua_ve(998102, 6, FALSE) $$, 'Owner then sets 6 on that event');
RESET ROLE;

SELECT is(
  (SELECT ROW("SoVeToiDaCu", "SoVeToiDaMoi") FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998102),
  ROW(4, 6),
  'Audit shows old 4 (default) and new 6');

-- ============================================================================
-- 6. Roles that must NOT change the two parameters
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000003';
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 5, FALSE) $$, '42501', 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN', 'BIEN_TAP cannot call the RPC');
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000004';
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 5, FALSE) $$, '42501', 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN', 'VAN_HANH cannot call the RPC');
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000005';
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 5, FALSE) $$, '42501', 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN', 'SOAT_VE cannot call the RPC');
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000006';
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 5, FALSE) $$, '42501', 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN', 'Audience account cannot call the RPC');
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000007';
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 5, FALSE) $$, '42501', 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN', 'Owner of ANOTHER organization cannot call the RPC');

RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 5, FALSE) $$, '42501', NULL, 'anon cannot execute the RPC');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.luu_cau_hinh_mua_ve(998101, 5, FALSE) $$, '42501', NULL, 'service_role cannot execute the RPC (no bypass)');
RESET ROLE;

SELECT is(
  (SELECT ROW("SoVeToiDaMoiDon", "YeuCauXacMinhOTP") FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = 998101),
  ROW(20, FALSE),
  'Every rejected role left the config untouched');

-- ============================================================================
-- 7. Direct DML on CAU_HINH_SU_KIEN cannot dodge the role check or the audit
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000003';

SELECT throws_ok(
  $$ UPDATE public."CAU_HINH_SU_KIEN" SET "SoVeToiDaMoiDon" = 9 WHERE "SuKienID" = 998101 $$,
  '42501', 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN',
  'BIEN_TAP cannot change SoVeToiDaMoiDon by direct UPDATE');
SELECT throws_ok(
  $$ UPDATE public."CAU_HINH_SU_KIEN" SET "YeuCauXacMinhOTP" = TRUE WHERE "SuKienID" = 998101 $$,
  '42501', 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN',
  'BIEN_TAP cannot change YeuCauXacMinhOTP by direct UPDATE');
SELECT lives_ok(
  $$ UPDATE public."CAU_HINH_SU_KIEN" SET "ThoiGianGiuChoPhut" = 10 WHERE "SuKienID" = 998101 $$,
  'BIEN_TAP can still edit unrelated configuration (hold minutes)');
SELECT throws_ok(
  $$ DELETE FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = 998101 $$,
  '42501', NULL,
  'Editors cannot DELETE the config row to reset it and dodge the audit');
SELECT throws_ok(
  $$ UPDATE public."CAU_HINH_SU_KIEN" SET "SuKienID" = 998102 WHERE "SuKienID" = 998101 $$,
  '42501', NULL,
  'The SuKienID of a config row cannot be re-pointed');

RESET ROLE;

SET LOCAL "request.jwt.claim.sub" = '';  -- service_role call with no user behind it
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ UPDATE public."CAU_HINH_SU_KIEN" SET "SoVeToiDaMoiDon" = 9 WHERE "SuKienID" = 998101 $$,
  '42501', 'CAU_HINH_MUA_VE_CAN_DANG_NHAP',
  'service_role without a user cannot change the limit by direct UPDATE');
RESET ROLE;

SELECT is(
  (SELECT "ThoiGianGiuChoPhut" FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = 998101),
  10,
  'The unrelated edit by BIEN_TAP was saved');

-- Direct UPDATE by an owner is allowed and audited exactly once
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000001';
SELECT lives_ok(
  $$ UPDATE public."CAU_HINH_SU_KIEN" SET "SoVeToiDaMoiDon" = 12 WHERE "SuKienID" = 998101 $$,
  'CHU_SO_HUU may change the limit by direct UPDATE');
RESET ROLE;

SELECT is(
  (SELECT ROW("SoVeToiDaCu", "SoVeToiDaMoi", "VaiTroToChuc"::text)
     FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998101 ORDER BY "NhatKyCauHinhMuaVeID" DESC LIMIT 1),
  ROW(20, 12, 'CHU_SO_HUU'::text),
  'The direct UPDATE by the owner was audited (20 -> 12)');

-- ============================================================================
-- 8. luu_su_kien_toan_dien shares the same check and audit
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000003';

SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
       'eventId', 998101, 'organizationId', '99999999-0000-4999-8999-0000000000a1',
       'name', 'PC Event A1', 'slug', 'pc-event-a1', 'category', 'AM_NHAC',
       'configuration', jsonb_build_object('maxTicketsPerOrder', 15))) $$,
  '42501', 'CAU_HINH_MUA_VE_KHONG_CO_QUYEN',
  'BIEN_TAP cannot change the limit through luu_su_kien_toan_dien');

SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000001';
SELECT lives_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
       'eventId', 998101, 'organizationId', '99999999-0000-4999-8999-0000000000a1',
       'name', 'PC Event A1', 'slug', 'pc-event-a1', 'category', 'AM_NHAC',
       'configuration', jsonb_build_object('maxTicketsPerOrder', 15))) $$,
  'CHU_SO_HUU can change the limit through luu_su_kien_toan_dien');
RESET ROLE;

SELECT is(
  (SELECT ROW("SoVeToiDaCu", "SoVeToiDaMoi") FROM public."NHAT_KY_CAU_HINH_MUA_VE"
     WHERE "SuKienID" = 998101 ORDER BY "NhatKyCauHinhMuaVeID" DESC LIMIT 1),
  ROW(12, 15),
  'The luu_su_kien_toan_dien change was audited exactly once (12 -> 15)');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000003';
SELECT lives_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
       'eventId', 998101, 'organizationId', '99999999-0000-4999-8999-0000000000a1',
       'name', 'PC Event A1 renamed', 'slug', 'pc-event-a1', 'category', 'AM_NHAC')) $$,
  'BIEN_TAP can still save the event without touching the limit (no configuration sent)');
RESET ROLE;

SELECT is(
  (SELECT "SoVeToiDaMoiDon" FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = 998101),
  15,
  'Saving without a configuration keeps the stored limit (no silent reset to 4)');

-- ============================================================================
-- 9. Audit table: read access and immutability
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000004';
SELECT ok(
  (SELECT COUNT(*) FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998101) >= 4,
  'A member of the organization (VAN_HANH) reads its audit rows');

SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000007';
SELECT is(
  (SELECT COUNT(*)::int FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998101),
  0,
  'A member of ANOTHER organization sees none of those rows (RLS)');

SET LOCAL "request.jwt.claim.sub" = '99999999-9999-4999-8999-000000000006';
SELECT is(
  (SELECT COUNT(*)::int FROM public."NHAT_KY_CAU_HINH_MUA_VE"),
  0,
  'An audience account sees no audit rows');

SELECT throws_ok(
  $$ INSERT INTO public."NHAT_KY_CAU_HINH_MUA_VE" ("SuKienID", "NguoiThucHienID", "VaiTroToChuc", "SoVeToiDaCu", "SoVeToiDaMoi", "YeuCauOtpCu", "YeuCauOtpMoi")
     VALUES (998101, '99999999-9999-4999-8999-000000000006', 'CHU_SO_HUU', 4, 5, FALSE, FALSE) $$,
  '42501', NULL,
  'authenticated cannot insert audit rows directly');
SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_CAU_HINH_MUA_VE" SET "SoVeToiDaMoi" = 1 $$,
  '42501', NULL,
  'authenticated cannot update audit rows');
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_CAU_HINH_MUA_VE" $$,
  '42501', NULL,
  'authenticated cannot delete audit rows');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT * FROM public."NHAT_KY_CAU_HINH_MUA_VE" $$, '42501', NULL, 'anon cannot read the audit table');
RESET ROLE;

SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_CAU_HINH_MUA_VE" SET "SoVeToiDaMoi" = 1 $$,
  '42501', NULL,
  'Even the table owner (postgres) cannot update audit rows: trigger blocks it');
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_CAU_HINH_MUA_VE" $$,
  '42501', NULL,
  'Even the table owner cannot delete audit rows');
SELECT throws_ok(
  $$ TRUNCATE public."NHAT_KY_CAU_HINH_MUA_VE" $$,
  '42501', NULL,
  'Even the table owner cannot truncate the audit table');

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_CAU_HINH_MUA_VE" SET "SoVeToiDaMoi" = 1 $$,
  '42501', NULL,
  'service_role cannot update audit rows either (no bypass)');
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_CAU_HINH_MUA_VE" $$,
  '42501', NULL,
  'service_role cannot delete audit rows either (no bypass)');
RESET ROLE;

SELECT is(
  (SELECT COUNT(*)::int FROM public."NHAT_KY_CAU_HINH_MUA_VE" WHERE "SuKienID" = 998101),
  6,
  'Audit of event 998101 is intact: 6 rows (4->8/TRUE, OTP off, ->1, ->20, owner direct 20->12, wrapper 12->15)');

-- ============================================================================
-- 10. ACL and structure
-- ============================================================================
SELECT ok(
  has_function_privilege('authenticated', 'public.luu_cau_hinh_mua_ve(integer, integer, boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.luu_cau_hinh_mua_ve(integer, integer, boolean)', 'EXECUTE'),
  'luu_cau_hinh_mua_ve: EXECUTE for authenticated only (not anon)');

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.kiem_soat_cau_hinh_mua_ve()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.khoa_cau_hinh_mua_ve()', 'EXECUTE'),
  'Trigger functions are not executable by clients');

SELECT is(
  (SELECT COUNT(*)::int FROM pg_constraint
    WHERE conrelid = 'public."NHAT_KY_CAU_HINH_MUA_VE"'::regclass AND contype = 'f'),
  0,
  'Audit table has no foreign keys (historical ids stay valid)');

SELECT * FROM finish();
ROLLBACK;
