-- pgTAP acceptance test: pricing table access control + immutable NHAT_KY_GIA (Sprint 2 / T2)
-- Migration under test: 20261112110000_sprint2_pricing_security.sql
--
-- STATUS: authored; run with `npm run db:test` (`supabase test db`) against a migrated DB.
-- Every mutation is inside BEGIN ... ROLLBACK.

BEGIN;

SELECT plan(33);

-- 1-2. Trigger and function catalog checks
SELECT has_trigger(
  'public',
  'NHAT_KY_GIA',
  'chan_sua_xoa_nhat_ky_gia',
  'NHAT_KY_GIA has immutability trigger chan_sua_xoa_nhat_ky_gia'
);
SELECT function_returns(
  'public',
  'chan_sua_xoa_nhat_ky_gia',
  ARRAY[]::text[],
  'trigger',
  'chan_sua_xoa_nhat_ky_gia() returns trigger'
);

-- Isolated fixtures
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('11111111-1111-1111-1111-111111111101', 'authenticated', 'authenticated', 't2-org-a-owner@example.com'),
  ('11111111-1111-1111-1111-111111111102', 'authenticated', 'authenticated', 't2-org-a-scanner@example.com'),
  ('11111111-1111-1111-1111-111111111103', 'authenticated', 'authenticated', 't2-user-with-membership@example.com'),
  ('22222222-2222-2222-2222-222222222201', 'authenticated', 'authenticated', 't2-org-b-outsider@example.com'),
  ('33333333-3333-3333-3333-333333333301', 'authenticated', 'authenticated', 't2-audience-user@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('11111111-1111-1111-1111-111111111101', 'Org A Owner', 'ORGANIZER'),
  ('11111111-1111-1111-1111-111111111102', 'Org A Scanner', 'ORGANIZER'),
  ('11111111-1111-1111-1111-111111111103', 'Buyer With Membership Row', 'USER'),
  ('22222222-2222-2222-2222-222222222201', 'Org B Outsider', 'ORGANIZER'),
  ('33333333-3333-3333-3333-333333333301', 'Audience Buyer', 'USER')
ON CONFLICT ("NguoiDungID") DO UPDATE
SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES
  ('11111111-0000-0000-0000-000000000101', 'T2 Org A', 't2-org-a'),
  ('22222222-0000-0000-0000-000000000201', 'T2 Org B', 't2-org-b')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('11111111-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111101', 'CHU_SO_HUU'),
  ('11111111-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111102', 'SOAT_VE'),
  ('11111111-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111103', 'CHU_SO_HUU'),
  ('22222222-0000-0000-0000-000000000201', '22222222-2222-2222-2222-222222222201', 'CHU_SO_HUU')
ON CONFLICT DO NOTHING;

-- Org A & Org B events start as BAN_NHAP, then are published via cong_bo_su_kien after SUAT_DIEN + KHU_VUC exist
-- (direct INSERT with CONG_KHAI is blocked by trg_kiem_tra_cong_bo_su_kien). Public events still never leak pricing data.
INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES
  (
    998101, 'T2 Public Event A', 't2-public-event-a', '11111111-0000-0000-0000-000000000101',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'Ha Noi', 'San A',
    'DANG_MO_BAN', 'BAN_NHAP'
  ),
  (
    998201, 'T2 Public Event B', 't2-public-event-b', '22222222-0000-0000-0000-000000000201',
    NOW() + INTERVAL '12 days', NOW() + INTERVAL '12 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '11 days', 'Ha Noi', 'San B',
    'DANG_MO_BAN', 'BAN_NHAP'
  );

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  (
    998101, 998101, 't2-suat-a', 'Suat A',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'DANG_MO_BAN'
  ),
  (
    998201, 998201, 't2-suat-b', 'Suat B',
    NOW() + INTERVAL '12 days', NOW() + INTERVAL '12 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '11 days', 'DANG_MO_BAN'
  );

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (998101, 998101, 998101, 'T2_ZONE_A', 'Khu Vuc A', 'DUNG_STAND', 200000, '#111111', 100),
  (998201, 998201, 998201, 'T2_ZONE_B', 'Khu Vuc B', 'DUNG_STAND', 300000, '#222222', 100);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111101';
DO $$ BEGIN PERFORM public.cong_bo_su_kien(998101); END $$;
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222201';
DO $$ BEGIN PERFORM public.cong_bo_su_kien(998201); END $$;
RESET ROLE;

INSERT INTO public."QUY_TAC_GIA" ("QuyTacGiaID", "KhuVucID", "GiaGoc", "GiaSan", "GiaTran")
VALUES
  (998101, 998101, 200000, 150000, 350000),
  (998201, 998201, 300000, 200000, 500000);

INSERT INTO public."DE_XUAT_GIA" (
  "DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
  "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat"
) VALUES
  (998101, 998101, 998101, 0.5000, 5.00, 4.00, 48.00, 200000, 220000, 220000),
  (998201, 998201, 998201, 0.4000, 3.00, 4.00, 72.00, 300000, 290000, 290000);

INSERT INTO public."NHAT_KY_GIA" (
  "NhatKyGiaID", "KhuVucID", "DeXuatID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram", "LyDoThayDoi"
) VALUES
  (998101, 998101, 998101, 'KHOI_TAO', 200000, 200000, 0.00, 'Khoi tao gia A'),
  (998201, 998201, 998201, 'KHOI_TAO', 300000, 300000, 0.00, 'Khoi tao gia B');

-- 3-5. Org A ORGANIZER owner reads Org A rows only (never Org B rows)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111101';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  (SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" IN (998101, 998201)),
  1,
  'Org A ORGANIZER owner reads only Org A QUY_TAC_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" IN (998101, 998201)),
  1,
  'Org A ORGANIZER owner reads only Org A DE_XUAT_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" IN (998101, 998201)),
  1,
  'Org A ORGANIZER owner reads only Org A NHAT_KY_GIA'
);

-- 6. Org A SOAT_VE (ORGANIZER) also reads Org A pricing rules via la_thanh_vien_to_chuc
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111102';
SELECT is(
  (SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" IN (998101, 998201)),
  1,
  'Org A SOAT_VE ORGANIZER member reads Org A QUY_TAC_GIA'
);

-- 7-9. USER account with THANH_VIEN_TO_CHUC row reads 0 rows even for CONG_KHAI event
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111103';
SELECT is(
  (SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 998101),
  0,
  'USER with membership row reads 0 rows from QUY_TAC_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 998101),
  0,
  'USER with membership row reads 0 rows from DE_XUAT_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 998101),
  0,
  'USER with membership row reads 0 rows from NHAT_KY_GIA'
);

-- 10-12. Outsider (Org B ORGANIZER) reads 0 rows from Org A even for CONG_KHAI event
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222201';
SELECT is(
  (SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 998101),
  0,
  'Outsider ORGANIZER reads 0 rows from Org A QUY_TAC_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 998101),
  0,
  'Outsider ORGANIZER reads 0 rows from Org A DE_XUAT_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 998101),
  0,
  'Outsider ORGANIZER reads 0 rows from Org A NHAT_KY_GIA'
);

-- 13-15. Non-member authenticated audience (USER) reads 0 rows even for CONG_KHAI event
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333301';
SELECT is(
  (SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 998101),
  0,
  'Non-member audience USER reads 0 rows from QUY_TAC_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 998101),
  0,
  'Non-member audience USER reads 0 rows from DE_XUAT_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 998101),
  0,
  'Non-member audience USER reads 0 rows from NHAT_KY_GIA'
);
RESET ROLE;

-- 16-18. anon cannot SELECT from any of the 3 pricing tables (REVOKE SELECT -> 42501)
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT count(*) FROM public."QUY_TAC_GIA" $$,
  '42501',
  NULL,
  'anon cannot SELECT from QUY_TAC_GIA'
);
SELECT throws_ok(
  $$ SELECT count(*) FROM public."DE_XUAT_GIA" $$,
  '42501',
  NULL,
  'anon cannot SELECT from DE_XUAT_GIA'
);
SELECT throws_ok(
  $$ SELECT count(*) FROM public."NHAT_KY_GIA" $$,
  '42501',
  NULL,
  'anon cannot SELECT from NHAT_KY_GIA'
);
RESET ROLE;

-- 19-27. authenticated (even Org A owner) cannot INSERT/UPDATE/DELETE any pricing table or execute trigger function
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111101';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran") VALUES (998101, 200000, 150000, 300000) $$,
  '42501',
  NULL,
  'authenticated cannot INSERT into QUY_TAC_GIA'
);
SELECT throws_ok(
  $$ UPDATE public."QUY_TAC_GIA" SET "GiaGoc" = 250000 WHERE "KhuVucID" = 998101 $$,
  '42501',
  NULL,
  'authenticated cannot UPDATE QUY_TAC_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 998101 $$,
  '42501',
  NULL,
  'authenticated cannot DELETE from QUY_TAC_GIA'
);

SELECT throws_ok(
  $$ INSERT INTO public."DE_XUAT_GIA" ("QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong", "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat") VALUES (998101, 998101, 0.5, 1.0, 1.0, 10, 200000, 210000, 210000) $$,
  '42501',
  NULL,
  'authenticated cannot INSERT into DE_XUAT_GIA'
);
SELECT throws_ok(
  $$ UPDATE public."DE_XUAT_GIA" SET "TrangThaiDuyet" = 'APPROVED' WHERE "KhuVucID" = 998101 $$,
  '42501',
  NULL,
  'authenticated cannot UPDATE DE_XUAT_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 998101 $$,
  '42501',
  NULL,
  'authenticated cannot DELETE from DE_XUAT_GIA'
);

SELECT throws_ok(
  $$ INSERT INTO public."NHAT_KY_GIA" ("KhuVucID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram", "LyDoThayDoi") VALUES (998101, 'KHOI_TAO', 200000, 200000, 0, 'test') $$,
  '42501',
  NULL,
  'authenticated cannot INSERT into NHAT_KY_GIA'
);
SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_GIA" SET "LyDoThayDoi" = 'tamper' WHERE "KhuVucID" = 998101 $$,
  '42501',
  NULL,
  'authenticated cannot UPDATE NHAT_KY_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 998101 $$,
  '42501',
  NULL,
  'authenticated cannot DELETE from NHAT_KY_GIA'
);

RESET ROLE;

-- 28-29. Trigger function EXECUTE: PUBLIC checked via proacl (PUBLIC is not a role), anon/authenticated via has_function_privilege
SELECT is((SELECT count(*)::int FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid = 'public.chan_sua_xoa_nhat_ky_gia()'::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'), 0, 'PUBLIC has no EXECUTE on chan_sua_xoa_nhat_ky_gia() (proacl)');
SELECT is(
  has_function_privilege('anon', 'public.chan_sua_xoa_nhat_ky_gia()', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.chan_sua_xoa_nhat_ky_gia()', 'EXECUTE'),
  false,
  'anon and authenticated do not have EXECUTE privilege on chan_sua_xoa_nhat_ky_gia()'
);

-- 30-31. service_role UPDATE and DELETE on NHAT_KY_GIA are blocked by immutability trigger (no bypass)
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';

SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_GIA" SET "LyDoThayDoi" = 'tamper service_role' WHERE "NhatKyGiaID" = 998101 $$,
  '42501',
  'NHAT_KY_GIA la nhat ky bat bien: khong cho phep UPDATE',
  'service_role cannot UPDATE NHAT_KY_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_GIA" WHERE "NhatKyGiaID" = 998101 $$,
  '42501',
  'NHAT_KY_GIA la nhat ky bat bien: khong cho phep DELETE',
  'service_role cannot DELETE from NHAT_KY_GIA'
);
RESET ROLE;

-- 32-33. postgres (table owner) UPDATE and DELETE on NHAT_KY_GIA are also blocked by immutability trigger
SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_GIA" SET "LyDoThayDoi" = 'tamper postgres' WHERE "NhatKyGiaID" = 998101 $$,
  '42501',
  'NHAT_KY_GIA la nhat ky bat bien: khong cho phep UPDATE',
  'postgres cannot UPDATE NHAT_KY_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_GIA" WHERE "NhatKyGiaID" = 998101 $$,
  '42501',
  'NHAT_KY_GIA la nhat ky bat bien: khong cho phep DELETE',
  'postgres cannot DELETE from NHAT_KY_GIA'
);

SELECT * FROM finish();
ROLLBACK;
