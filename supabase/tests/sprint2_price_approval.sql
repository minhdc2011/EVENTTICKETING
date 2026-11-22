-- pgTAP acceptance test: Sprint 2 safe price approval RPCs (T1 contract)
-- Migration under test: 20261114090000_sprint2_price_approval.sql
--   public.duyet_de_xuat_gia(bigint, text, numeric DEFAULT NULL) RETURNS jsonb
--   public.tu_choi_de_xuat_gia(bigint, text) RETURNS jsonb
--
-- STATUS: authored, NOT run in the gate. `npm run check` does not execute pgTAP;
-- this file needs `npm run db:test` (`supabase test db`) on a migrated database.
-- Nothing here has been shown to pass until that command is run.
--
-- CONCURRENCY: every call is sequential inside ONE session. The 40001 cases
-- (GIA_DA_THAY_DOI, DE_XUAT_DA_XU_LY) prove the guard predicates only, NOT behaviour
-- under real concurrent sessions. A true two-session race test (parallel approve of
-- the same proposal, approve vs. price edit) is a post-merge acceptance step.
--
-- Every mutation is inside BEGIN ... ROLLBACK. The file builds all of its own
-- fixtures and does not depend on supabase/seed.sql.
--
-- Sections:
--   A. (sonnet)   business path: normal/adjusted approve, frame edges, reject,
--                 TTL boundary and expiry.
--   B. (hydrogen) 40001 (price changed / replay), role matrix, log-failure
--                 rollback, ACL and catalog checks.
--
-- Fixture map (IDs 9965xx/9966xx/9967xx; slugs t3dg-):
--   users  77777777-7777-7777-7777-7777777777NN, all auth.users + HO_SO_NGUOI_DUNG:
--          01 CHU_SO_HUU (org A)  02 QUAN_TRI (org A)  03 BIEN_TAP (org A)
--          04 VAN_HANH (org A)    05 SOAT_VE (org A)   (all ORGANIZER)
--          06 audience (USER, no membership)
--          07 CHU_SO_HUU of org B (ORGANIZER)
--   orgs   77777777-0000-0000-0000-0000000000A1 = A, ...00B1 = B
--   event 996501 (org A) / show 996501.
--   zones 996501..996513 (GiaVeNiemYet 200000), one per proposal (a zone allows only
--          ONE PENDING proposal: uq_de_xuat_gia_pending_khu_vuc).
--   rules 996701..996713 (GiaGoc 200000, GiaSan 150000, GiaTran 300000), inserted directly
--          so NHAT_KY_DINH_GIA stays empty.
--   proposals 996601..996613 -> zone/rule 9965nn/9967nn, PENDING, GiaHienTai 200000,
--          LyDoDeXuat 'AI tang gia', GiaDeXuat 220000 (P01) or 210000 (others).
--          P07/P10: ThoiGianDeXuat = now() - 120 minutes (still valid).
--          P08/P09: ThoiGianDeXuat = now() - 120 minutes 1 microsecond (expired).
--   Use of proposals:
--     A: P01 approve, P02 adjust floor, P03 adjust ceiling (QUAN_TRI), P04 failing validation,
--        P05/P06 reject, P07 approve at TTL edge, P10 reject at TTL edge,
--        P08 approve expired, P09 reject expired.
--     B: P11 (price changed 40001), P12 (role matrix), P13 (log-failure rollback).
--   now() is constant within the test transaction, so TTL edges are deterministic.
--   Temp table t3_res captures JSONB results of mutating RPCs so each is called once.

BEGIN;

SELECT plan(77);

-- ============================================================================
-- Fixtures (shared by sections A and B)
-- ============================================================================
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('77777777-7777-7777-7777-777777777701', 'authenticated', 'authenticated', 't3dg-owner@example.com'),
  ('77777777-7777-7777-7777-777777777702', 'authenticated', 'authenticated', 't3dg-admin@example.com'),
  ('77777777-7777-7777-7777-777777777703', 'authenticated', 'authenticated', 't3dg-editor@example.com'),
  ('77777777-7777-7777-7777-777777777704', 'authenticated', 'authenticated', 't3dg-ops@example.com'),
  ('77777777-7777-7777-7777-777777777705', 'authenticated', 'authenticated', 't3dg-scanner@example.com'),
  ('77777777-7777-7777-7777-777777777706', 'authenticated', 'authenticated', 't3dg-audience@example.com'),
  ('77777777-7777-7777-7777-777777777707', 'authenticated', 'authenticated', 't3dg-ownerb@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('77777777-7777-7777-7777-777777777701', 'T3 Owner', 'ORGANIZER'),
  ('77777777-7777-7777-7777-777777777702', 'T3 Admin', 'ORGANIZER'),
  ('77777777-7777-7777-7777-777777777703', 'T3 Editor', 'ORGANIZER'),
  ('77777777-7777-7777-7777-777777777704', 'T3 Ops', 'ORGANIZER'),
  ('77777777-7777-7777-7777-777777777705', 'T3 Scanner', 'ORGANIZER'),
  ('77777777-7777-7777-7777-777777777706', 'T3 Audience', 'USER'),
  ('77777777-7777-7777-7777-777777777707', 'T3 Owner B', 'ORGANIZER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES
  ('77777777-0000-0000-0000-0000000000a1', 'T3 DG Org A', 't3dg-org-a'),
  ('77777777-0000-0000-0000-0000000000b1', 'T3 DG Org B', 't3dg-org-b')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('77777777-0000-0000-0000-0000000000a1', '77777777-7777-7777-7777-777777777701', 'CHU_SO_HUU'),
  ('77777777-0000-0000-0000-0000000000a1', '77777777-7777-7777-7777-777777777702', 'QUAN_TRI'),
  ('77777777-0000-0000-0000-0000000000a1', '77777777-7777-7777-7777-777777777703', 'BIEN_TAP'),
  ('77777777-0000-0000-0000-0000000000a1', '77777777-7777-7777-7777-777777777704', 'VAN_HANH'),
  ('77777777-0000-0000-0000-0000000000a1', '77777777-7777-7777-7777-777777777705', 'SOAT_VE'),
  ('77777777-0000-0000-0000-0000000000b1', '77777777-7777-7777-7777-777777777707', 'CHU_SO_HUU')
ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  996501, 'T3 DG Event', 't3dg-event', '77777777-0000-0000-0000-0000000000a1',
  NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
  NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'Ha Noi', 'San T3',
  'DANG_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES (
  996501, 996501, 't3dg-suat', 'T3 Suat',
  NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
  NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'DANG_MO_BAN'
);

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
)
SELECT 996500 + g, 996501, 996501, 'T3DG_Z' || g, 'Khu ' || g, 'DUNG_STAND', 200000, '#123456', 100
  FROM generate_series(1, 13) AS g;

INSERT INTO public."QUY_TAC_GIA" ("QuyTacGiaID", "KhuVucID", "GiaGoc", "GiaSan", "GiaTran")
SELECT 996700 + g, 996500 + g, 200000, 150000, 300000
  FROM generate_series(1, 13) AS g;

INSERT INTO public."DE_XUAT_GIA" (
  "DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
  "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "TrangThaiDuyet",
  "LyDoDeXuat", "ThoiGianDeXuat"
)
SELECT 996600 + g, 996700 + g, 996500 + g, 0.5, 5, 4, 48, 200000,
       CASE WHEN g = 1 THEN 220000 ELSE 210000 END,
       CASE WHEN g = 1 THEN 220000 ELSE 210000 END,
       'PENDING', 'AI tang gia',
       CASE
         WHEN g IN (7, 10) THEN now() - INTERVAL '120 minutes'
         WHEN g IN (8, 9) THEN now() - INTERVAL '120 minutes 1 microsecond'
         ELSE now()
       END
  FROM generate_series(1, 13) AS g;

-- Shared temp table: capture JSONB results so each mutating RPC runs exactly once.
CREATE TEMP TABLE t3_res (step TEXT PRIMARY KEY, res JSONB NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON t3_res TO authenticated;

-- ============================================================================
-- A. SONNET SECTION: business path
-- ============================================================================

-- A1. P01: normal approve by CHU_SO_HUU, NULL note, proposed price 220000
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
INSERT INTO t3_res SELECT 'p01', public.duyet_de_xuat_gia(996601, NULL);
RESET ROLE;

SELECT is(
  (SELECT ROW(res->>'ketQua', (res->>'giaCu')::numeric, (res->>'giaMoi')::numeric,
              (res->>'tyLeThayDoiPhanTram')::numeric, res->>'loaiBienDong',
              (res->>'nguoiDuyetId')::uuid, (res->>'thoiGianDuyet')::timestamptz,
              (res->>'deXuatId')::bigint, (res->>'khuVucId')::int, (res->>'suKienId')::int)
     FROM t3_res WHERE step = 'p01'),
  ROW('DA_DUYET'::text, 200000::numeric, 220000::numeric, 10.00::numeric, 'DUYET_DE_XUAT_AI'::text,
      '77777777-7777-7777-7777-777777777701'::uuid, now(), 996601::bigint, 996501, 996501),
  'P01 normal approve returns the full DA_DUYET payload');
SELECT is(
  (SELECT "GiaVeNiemYet"::numeric FROM public."KHU_VUC" WHERE "KhuVucID" = 996501),
  220000::numeric, 'P01 zone price is now 220000');
SELECT is(
  (SELECT ROW("TrangThaiDuyet"::text, "NguoiDuyetID"::text, "ThoiGianDuyet", "GhiChuDuyet"::text)
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996601),
  ROW('APPROVED'::text, '77777777-7777-7777-7777-777777777701'::text, now(), NULL::text),
  'P01 proposal is APPROVED with approver, now() and NULL note');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 996501),
  1, 'P01 wrote exactly one NHAT_KY_GIA row');
SELECT is(
  (SELECT ROW(nk."KhuVucID"::text, nk."DeXuatID"::text, nk."LoaiBienDong"::text,
              nk."GiaCu"::numeric, nk."GiaMoi"::numeric, nk."TyLeThayDoiPhanTram"::numeric,
              nk."LyDoThayDoi"::text, nk."NguoiThucHienID"::text, nk."ThoiGianApDung",
              nk."NhatKyGiaID"::text)
     FROM public."NHAT_KY_GIA" nk WHERE nk."DeXuatID" = 996601),
  ROW('996501'::text, '996601'::text, 'DUYET_DE_XUAT_AI'::text,
      200000::numeric, 220000::numeric, 10.00::numeric,
      'AI tang gia'::text, '77777777-7777-7777-7777-777777777701'::text, now(),
      (SELECT res->>'nhatKyGiaId' FROM t3_res WHERE step = 'p01')),
  'P01 log row: every column (reason falls back to LyDoDeXuat)');

-- A2. P02: adjusted approve at exactly the floor (150000) with a note
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
INSERT INTO t3_res SELECT 'p02', public.duyet_de_xuat_gia(996602, 'Dieu chinh ve san', 150000);
RESET ROLE;

SELECT is(
  (SELECT ROW(res->>'ketQua', (res->>'giaCu')::numeric, (res->>'giaMoi')::numeric,
              (res->>'tyLeThayDoiPhanTram')::numeric, res->>'loaiBienDong',
              (res->>'nguoiDuyetId')::uuid, (res->>'thoiGianDuyet')::timestamptz)
     FROM t3_res WHERE step = 'p02'),
  ROW('DA_DUYET'::text, 200000::numeric, 150000::numeric, (-25.00)::numeric, 'DIEU_CHINH_THU_CONG'::text,
      '77777777-7777-7777-7777-777777777701'::uuid, now()),
  'P02 adjusted approve at the floor returns DIEU_CHINH_THU_CONG, -25.00');
SELECT is(
  (SELECT "GiaVeNiemYet"::numeric FROM public."KHU_VUC" WHERE "KhuVucID" = 996502),
  150000::numeric, 'P02 zone price is exactly the floor 150000');
SELECT is(
  (SELECT ROW("TrangThaiDuyet"::text, "NguoiDuyetID"::text, "ThoiGianDuyet", "GhiChuDuyet"::text)
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996602),
  ROW('APPROVED'::text, '77777777-7777-7777-7777-777777777701'::text, now(), 'Dieu chinh ve san'::text),
  'P02 proposal is APPROVED with the note stored in GhiChuDuyet');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 996502),
  1, 'P02 wrote exactly one NHAT_KY_GIA row');
SELECT is(
  (SELECT ROW(nk."KhuVucID"::text, nk."DeXuatID"::text, nk."LoaiBienDong"::text,
              nk."GiaCu"::numeric, nk."GiaMoi"::numeric, nk."TyLeThayDoiPhanTram"::numeric,
              nk."LyDoThayDoi"::text, nk."NguoiThucHienID"::text, nk."ThoiGianApDung",
              nk."NhatKyGiaID"::text)
     FROM public."NHAT_KY_GIA" nk WHERE nk."DeXuatID" = 996602),
  ROW('996502'::text, '996602'::text, 'DIEU_CHINH_THU_CONG'::text,
      200000::numeric, 150000::numeric, (-25.00)::numeric,
      'Dieu chinh ve san'::text, '77777777-7777-7777-7777-777777777701'::text, now(),
      (SELECT res->>'nhatKyGiaId' FROM t3_res WHERE step = 'p02')),
  'P02 log row: every column (reason is the note)');

-- A3. P03: adjusted approve at exactly the ceiling (300000) by QUAN_TRI
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777702';
INSERT INTO t3_res SELECT 'p03', public.duyet_de_xuat_gia(996603, 'Dieu chinh len tran', 300000);
RESET ROLE;

SELECT is(
  (SELECT ROW(res->>'ketQua', (res->>'giaCu')::numeric, (res->>'giaMoi')::numeric,
              (res->>'tyLeThayDoiPhanTram')::numeric, res->>'loaiBienDong',
              (res->>'nguoiDuyetId')::uuid, (res->>'thoiGianDuyet')::timestamptz)
     FROM t3_res WHERE step = 'p03'),
  ROW('DA_DUYET'::text, 200000::numeric, 300000::numeric, 50.00::numeric, 'DIEU_CHINH_THU_CONG'::text,
      '77777777-7777-7777-7777-777777777702'::uuid, now()),
  'P03 QUAN_TRI adjusted approve at the ceiling returns +50.00 and identity 02');
SELECT is(
  (SELECT "GiaVeNiemYet"::numeric FROM public."KHU_VUC" WHERE "KhuVucID" = 996503),
  300000::numeric, 'P03 zone price is exactly the ceiling 300000');
SELECT is(
  (SELECT ROW("TrangThaiDuyet"::text, "NguoiDuyetID"::text, "ThoiGianDuyet", "GhiChuDuyet"::text)
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996603),
  ROW('APPROVED'::text, '77777777-7777-7777-7777-777777777702'::text, now(), 'Dieu chinh len tran'::text),
  'P03 proposal records QUAN_TRI 02 as approver');
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 996503),
  1, 'P03 wrote exactly one NHAT_KY_GIA row');
SELECT is(
  (SELECT ROW(nk."KhuVucID"::text, nk."DeXuatID"::text, nk."LoaiBienDong"::text,
              nk."GiaCu"::numeric, nk."GiaMoi"::numeric, nk."TyLeThayDoiPhanTram"::numeric,
              nk."LyDoThayDoi"::text, nk."NguoiThucHienID"::text, nk."ThoiGianApDung",
              nk."NhatKyGiaID"::text)
     FROM public."NHAT_KY_GIA" nk WHERE nk."DeXuatID" = 996603),
  ROW('996503'::text, '996603'::text, 'DIEU_CHINH_THU_CONG'::text,
      200000::numeric, 300000::numeric, 50.00::numeric,
      'Dieu chinh len tran'::text, '77777777-7777-7777-7777-777777777702'::text, now(),
      (SELECT res->>'nhatKyGiaId' FROM t3_res WHERE step = 'p03')),
  'P03 log row: every column, identity 02');

-- A4. P04: invalid adjusted approvals (22023); each leaves PENDING, price 200000, no log
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996604, 'Duoi san', 149999.99) $$,
  '22023', 'NGOAI_KHUNG_GIA', 'P04 149999.99 (just below floor) gives NGOAI_KHUNG_GIA');
RESET ROLE;
SELECT is(
  (SELECT ROW(dx."TrangThaiDuyet"::text, dx."NguoiDuyetID" IS NULL, kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996504)::int)
     FROM public."DE_XUAT_GIA" dx JOIN public."KHU_VUC" kv ON kv."KhuVucID" = dx."KhuVucID"
    WHERE dx."DeXuatID" = 996604),
  ROW('PENDING'::text, TRUE, 200000::numeric, 0),
  'P04 after below-floor failure: PENDING, no approver, price 200000, 0 log rows');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996604, 'Tren tran', 300000.01) $$,
  '22023', 'NGOAI_KHUNG_GIA', 'P04 300000.01 (just above ceiling) gives NGOAI_KHUNG_GIA');
RESET ROLE;
SELECT is(
  (SELECT ROW(dx."TrangThaiDuyet"::text, dx."NguoiDuyetID" IS NULL, kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996504)::int)
     FROM public."DE_XUAT_GIA" dx JOIN public."KHU_VUC" kv ON kv."KhuVucID" = dx."KhuVucID"
    WHERE dx."DeXuatID" = 996604),
  ROW('PENDING'::text, TRUE, 200000::numeric, 0),
  'P04 after above-ceiling failure: PENDING, no approver, price 200000, 0 log rows');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996604, '  ', 250000) $$,
  '22023', 'THIEU_LY_DO_DIEU_CHINH', 'P04 adjusted price with a blank note gives THIEU_LY_DO_DIEU_CHINH');
RESET ROLE;
SELECT is(
  (SELECT ROW(dx."TrangThaiDuyet"::text, dx."NguoiDuyetID" IS NULL, kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996504)::int)
     FROM public."DE_XUAT_GIA" dx JOIN public."KHU_VUC" kv ON kv."KhuVucID" = dx."KhuVucID"
    WHERE dx."DeXuatID" = 996604),
  ROW('PENDING'::text, TRUE, 200000::numeric, 0),
  'P04 after blank-note failure: PENDING, no approver, price 200000, 0 log rows');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996604, 'Giu nguyen gia', 200000) $$,
  '22023', 'GIA_KHONG_THAY_DOI', 'P04 adjusted price equal to the current price gives GIA_KHONG_THAY_DOI');
RESET ROLE;
SELECT is(
  (SELECT ROW(dx."TrangThaiDuyet"::text, dx."NguoiDuyetID" IS NULL, kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996504)::int)
     FROM public."DE_XUAT_GIA" dx JOIN public."KHU_VUC" kv ON kv."KhuVucID" = dx."KhuVucID"
    WHERE dx."DeXuatID" = 996604),
  ROW('PENDING'::text, TRUE, 200000::numeric, 0),
  'P04 after unchanged-price failure: PENDING, no approver, price 200000, 0 log rows');

-- A5. P05: reject with a reason
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
INSERT INTO t3_res SELECT 'p05', public.tu_choi_de_xuat_gia(996605, 'Khong phu hop');
RESET ROLE;

SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'lyDo', (res->>'giaHienHanh')::numeric,
              (res->>'nguoiDuyetId')::uuid, (res->>'thoiGianDuyet')::timestamptz,
              (res->>'deXuatId')::bigint, (res->>'khuVucId')::int, (res->>'suKienId')::int)
     FROM t3_res WHERE step = 'p05'),
  ROW('DA_TU_CHOI'::text, 'Khong phu hop'::text, 200000::numeric,
      '77777777-7777-7777-7777-777777777701'::uuid, now(), 996605::bigint, 996505, 996501),
  'P05 reject returns the full DA_TU_CHOI payload');
SELECT is(
  (SELECT ROW("TrangThaiDuyet"::text, "NguoiDuyetID"::text, "ThoiGianDuyet", "GhiChuDuyet"::text)
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996605),
  ROW('REJECTED'::text, '77777777-7777-7777-7777-777777777701'::text, now(), 'Khong phu hop'::text),
  'P05 proposal is REJECTED with approver, now() and the reason');
SELECT is(
  (SELECT ROW(kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996505)::int)
     FROM public."KHU_VUC" kv WHERE kv."KhuVucID" = 996505),
  ROW(200000::numeric, 0),
  'P05 reject leaves the price at 200000 and writes no log row');

-- A6. P06: reject with a blank reason
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
INSERT INTO t3_res SELECT 'p06', public.tu_choi_de_xuat_gia(996606, '   ');
RESET ROLE;

SELECT is(
  (SELECT ROW(res->>'ketQua', jsonb_typeof(res->'lyDo'), (res->>'nguoiDuyetId')::uuid,
              (res->>'thoiGianDuyet')::timestamptz)
     FROM t3_res WHERE step = 'p06'),
  ROW('DA_TU_CHOI'::text, 'null'::text, '77777777-7777-7777-7777-777777777701'::uuid, now()),
  'P06 blank reason returns lyDo as JSON null');
SELECT is(
  (SELECT ROW("TrangThaiDuyet"::text, "NguoiDuyetID"::text, "ThoiGianDuyet", "GhiChuDuyet"::text)
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996606),
  ROW('REJECTED'::text, '77777777-7777-7777-7777-777777777701'::text, now(), NULL::text),
  'P06 proposal is REJECTED with identity set and NULL GhiChuDuyet');
SELECT is(
  (SELECT ROW(kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996506)::int)
     FROM public."KHU_VUC" kv WHERE kv."KhuVucID" = 996506),
  ROW(200000::numeric, 0),
  'P06 reject leaves the price at 200000 and writes no log row');

-- A7. P07: approve at exactly 120 minutes (still valid); P10: reject at exactly 120 minutes
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
INSERT INTO t3_res SELECT 'p07', public.duyet_de_xuat_gia(996607, NULL);
RESET ROLE;

SELECT is(
  (SELECT ROW(res->>'ketQua', (res->>'giaCu')::numeric, (res->>'giaMoi')::numeric)
     FROM t3_res WHERE step = 'p07'),
  ROW('DA_DUYET'::text, 200000::numeric, 210000::numeric),
  'P07 approve at exactly 120 minutes is still valid (DA_DUYET)');
SELECT is(
  (SELECT ROW(dx."TrangThaiDuyet"::text, dx."NguoiDuyetID"::text, kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996507)::int)
     FROM public."DE_XUAT_GIA" dx JOIN public."KHU_VUC" kv ON kv."KhuVucID" = dx."KhuVucID"
    WHERE dx."DeXuatID" = 996607),
  ROW('APPROVED'::text, '77777777-7777-7777-7777-777777777701'::text, 210000::numeric, 1),
  'P07 at the TTL edge: APPROVED, price 210000, one log row');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
INSERT INTO t3_res SELECT 'p10', public.tu_choi_de_xuat_gia(996610, 'Het gio nhung con han');
RESET ROLE;

SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'lyDo') FROM t3_res WHERE step = 'p10'),
  ROW('DA_TU_CHOI'::text, 'Het gio nhung con han'::text),
  'P10 reject at exactly 120 minutes is still valid (DA_TU_CHOI)');
SELECT is(
  (SELECT ROW(dx."TrangThaiDuyet"::text, dx."NguoiDuyetID"::text, kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996510)::int)
     FROM public."DE_XUAT_GIA" dx JOIN public."KHU_VUC" kv ON kv."KhuVucID" = dx."KhuVucID"
    WHERE dx."DeXuatID" = 996610),
  ROW('REJECTED'::text, '77777777-7777-7777-7777-777777777701'::text, 200000::numeric, 0),
  'P10 at the TTL edge: REJECTED, price 200000, no log row');

-- A8. P08: approve an expired proposal (120 minutes + 1 microsecond) -> normal HET_HAN return
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
INSERT INTO t3_res SELECT 'p08', public.duyet_de_xuat_gia(996608, NULL);
RESET ROLE;

SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'ma', (res->>'hetHanLuc')::timestamptz,
              (res->>'thoiGianDeXuat')::timestamptz)
     FROM t3_res WHERE step = 'p08'),
  ROW('HET_HAN'::text, 'DE_XUAT_HET_HAN'::text,
      (SELECT "ThoiGianDeXuat" + INTERVAL '120 minutes' FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996608),
      (SELECT "ThoiGianDeXuat" FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996608)),
  'P08 approve of an expired proposal returns HET_HAN with hetHanLuc = ThoiGianDeXuat + 120m');
SELECT is(
  (SELECT ROW("TrangThaiDuyet"::text, "GhiChuDuyet"::text, "NguoiDuyetID" IS NULL, "ThoiGianDuyet" IS NULL)
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996608),
  ROW('EXPIRED'::text, 'HET_HAN_TTL_120_PHUT'::text, TRUE, TRUE),
  'P08 row is EXPIRED with the TTL note and no approver/time');
SELECT is(
  (SELECT ROW(kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996508)::int)
     FROM public."KHU_VUC" kv WHERE kv."KhuVucID" = 996508),
  ROW(200000::numeric, 0),
  'P08 expiry leaves the price at 200000 and writes no log row');

-- A9. P09: reject an expired proposal -> same HET_HAN behaviour
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
INSERT INTO t3_res SELECT 'p09', public.tu_choi_de_xuat_gia(996609, 'Qua han');
RESET ROLE;

SELECT is(
  (SELECT ROW(res->>'ketQua', res->>'ma', (res->>'hetHanLuc')::timestamptz,
              (res->>'thoiGianDeXuat')::timestamptz)
     FROM t3_res WHERE step = 'p09'),
  ROW('HET_HAN'::text, 'DE_XUAT_HET_HAN'::text,
      (SELECT "ThoiGianDeXuat" + INTERVAL '120 minutes' FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996609),
      (SELECT "ThoiGianDeXuat" FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996609)),
  'P09 reject of an expired proposal returns HET_HAN with hetHanLuc = ThoiGianDeXuat + 120m');
SELECT is(
  (SELECT ROW("TrangThaiDuyet"::text, "GhiChuDuyet"::text, "NguoiDuyetID" IS NULL, "ThoiGianDuyet" IS NULL)
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996609),
  ROW('EXPIRED'::text, 'HET_HAN_TTL_120_PHUT'::text, TRUE, TRUE),
  'P09 row is EXPIRED with the TTL note and no approver/time');
SELECT is(
  (SELECT ROW(kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996509)::int)
     FROM public."KHU_VUC" kv WHERE kv."KhuVucID" = 996509),
  ROW(200000::numeric, 0),
  'P09 expiry leaves the price at 200000 and writes no log row');

-- section A: 39 assertions
-- (P01 5, P02 5, P03 5, P04 8, P05 3, P06 3, P07 2, P10 2, P08 3, P09 3)
-- Left untouched for section B: P11 (zone 996511), P12 (zone 996512), P13 (zone 996513).
-- Section B must append its own count; the finalizer replaces plan(0) with the exact total.

-- ============================================================================
-- B. HYDROGEN SECTION: 40001 guards, role matrix, rollback, ACL & catalog
-- ============================================================================

-- B1. 40001 (GIA_DA_THAY_DOI & DE_XUAT_DA_XU_LY) and replay protection
UPDATE public."KHU_VUC"
   SET "GiaVeNiemYet" = 210000
 WHERE "KhuVucID" = 996511;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996611, NULL) $$,
  '40001', 'GIA_DA_THAY_DOI',
  'P11 approve fails with 40001 GIA_DA_THAY_DOI after zone price changed');
RESET ROLE;

SELECT is(
  (SELECT ROW(dx."TrangThaiDuyet"::text, dx."NguoiDuyetID" IS NULL, kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996511)::int)
     FROM public."DE_XUAT_GIA" dx JOIN public."KHU_VUC" kv ON kv."KhuVucID" = dx."KhuVucID"
    WHERE dx."DeXuatID" = 996611),
  ROW('PENDING'::text, TRUE, 210000::numeric, 0),
  'P11 after GIA_DA_THAY_DOI: still PENDING, NULL approver, price 210000, 0 log rows');

-- Replay already-processed proposals (APPROVED P01, REJECTED P05, EXPIRED P08)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996601, 'Duyet lai') $$,
  '40001', 'DE_XUAT_DA_XU_LY',
  'Replay duyet on APPROVED P01 gives 40001 DE_XUAT_DA_XU_LY');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(996601, 'Tu choi lai') $$,
  '40001', 'DE_XUAT_DA_XU_LY',
  'Replay tu_choi on APPROVED P01 gives 40001 DE_XUAT_DA_XU_LY');
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996605, 'Duyet lai') $$,
  '40001', 'DE_XUAT_DA_XU_LY',
  'Replay duyet on REJECTED P05 gives 40001 DE_XUAT_DA_XU_LY');
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996608, 'Duyet lai') $$,
  '40001', 'DE_XUAT_DA_XU_LY',
  'Replay duyet on EXPIRED P08 gives 40001 DE_XUAT_DA_XU_LY');
RESET ROLE;

SELECT is(
  (SELECT ROW(kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996501)::int)
     FROM public."KHU_VUC" kv WHERE kv."KhuVucID" = 996501),
  ROW(220000::numeric, 1),
  'P01 replay added no second log row and kept zone 996501 price at 220000');
SELECT is(
  (SELECT ROW("TrangThaiDuyet"::text, "NguoiDuyetID"::text, "ThoiGianDuyet", "GhiChuDuyet"::text)
     FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 996601),
  ROW('APPROVED'::text,
      (SELECT res->>'nguoiDuyetId' FROM t3_res WHERE step = 'p01'),
      (SELECT (res->>'thoiGianDuyet')::timestamptz FROM t3_res WHERE step = 'p01'),
      NULL::text),
  'P01 replay left TrangThaiDuyet, NguoiDuyetID, ThoiGianDuyet and GhiChuDuyet unchanged');

-- B2. Role matrix against P12 (both RPCs; every case must raise 42501).
-- CHU_SO_HUU (01) and QUAN_TRI (02) success is already covered in section A (A1, A2, A3).

-- BIEN_TAP (03)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777703';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996612, NULL) $$,
  '42501', 'Khong co quyen duyet de xuat gia', 'BIEN_TAP 03 cannot duyet P12 (42501)');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(996612, 'Tu choi') $$,
  '42501', 'Khong co quyen tu choi de xuat gia', 'BIEN_TAP 03 cannot tu_choi P12 (42501)');
RESET ROLE;

-- VAN_HANH (04)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777704';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996612, NULL) $$,
  '42501', 'Khong co quyen duyet de xuat gia', 'VAN_HANH 04 cannot duyet P12 (42501)');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(996612, 'Tu choi') $$,
  '42501', 'Khong co quyen tu choi de xuat gia', 'VAN_HANH 04 cannot tu_choi P12 (42501)');
RESET ROLE;

-- SOAT_VE (05)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777705';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996612, NULL) $$,
  '42501', 'Khong co quyen duyet de xuat gia', 'SOAT_VE 05 cannot duyet P12 (42501)');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(996612, 'Tu choi') $$,
  '42501', 'Khong co quyen tu choi de xuat gia', 'SOAT_VE 05 cannot tu_choi P12 (42501)');
RESET ROLE;

-- Audience (06, USER, no membership)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777706';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996612, NULL) $$,
  '42501', 'Khong co quyen duyet de xuat gia', 'audience 06 cannot duyet P12 (42501)');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(996612, 'Tu choi') $$,
  '42501', 'Khong co quyen tu choi de xuat gia', 'audience 06 cannot tu_choi P12 (42501)');
RESET ROLE;

-- Owner of org B (07)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777707';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996612, NULL) $$,
  '42501', 'Khong co quyen duyet de xuat gia', 'org B owner 07 cannot duyet org A P12 (42501)');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(996612, 'Tu choi') $$,
  '42501', 'Khong co quyen tu choi de xuat gia', 'org B owner 07 cannot tu_choi org A P12 (42501)');
RESET ROLE;

-- SQL ROLE anon (blocked by ACL)
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.role" = 'anon';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996612, NULL) $$,
  '42501', NULL, 'SQL ROLE anon cannot execute duyet_de_xuat_gia (ACL 42501)');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(996612, 'Tu choi') $$,
  '42501', NULL, 'SQL ROLE anon cannot execute tu_choi_de_xuat_gia (ACL 42501)');
RESET ROLE;

-- SQL ROLE service_role carrying owner sub (blocked by ACL)
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996612, NULL) $$,
  '42501', NULL, 'SQL ROLE service_role cannot execute duyet_de_xuat_gia (ACL 42501)');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(996612, 'Tu choi') $$,
  '42501', NULL, 'SQL ROLE service_role cannot execute tu_choi_de_xuat_gia (ACL 42501)');
RESET ROLE;

-- SQL ROLE authenticated with claim role='service_role' and sub=owner 01 (exercises body guard)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996612, NULL) $$,
  '42501', 'Khong co quyen duyet de xuat gia',
  'authenticated + claim role=service_role + owner sub rejected by duyet body guard (42501)');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(996612, 'Tu choi') $$,
  '42501', 'Khong co quyen tu choi de xuat gia',
  'authenticated + claim role=service_role + owner sub rejected by tu_choi body guard (42501)');
RESET ROLE;

-- SQL ROLE authenticated with empty sub (auth.uid() IS NULL -> body guard)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996612, NULL) $$,
  '42501', 'Khong co quyen duyet de xuat gia',
  'authenticated with empty sub (auth.uid() NULL) rejected by duyet body guard (42501)');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(996612, 'Tu choi') $$,
  '42501', 'Khong co quyen tu choi de xuat gia',
  'authenticated with empty sub (auth.uid() NULL) rejected by tu_choi body guard (42501)');
RESET ROLE;

-- Owner 01 with unknown proposal ID (same 42501, no ID probing)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(999999999, NULL) $$,
  '42501', 'Khong co quyen duyet de xuat gia',
  'owner 01 with unknown proposal ID gives 42501 on duyet');
SELECT throws_ok(
  $$ SELECT public.tu_choi_de_xuat_gia(999999999, 'Khong ton tai') $$,
  '42501', 'Khong co quyen tu choi de xuat gia',
  'owner 01 with unknown proposal ID gives 42501 on tu_choi');
RESET ROLE;

SELECT is(
  (SELECT ROW(dx."TrangThaiDuyet"::text, dx."NguoiDuyetID" IS NULL, kv."GiaVeNiemYet"::numeric,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996512)::int)
     FROM public."DE_XUAT_GIA" dx JOIN public."KHU_VUC" kv ON kv."KhuVucID" = dx."KhuVucID"
    WHERE dx."DeXuatID" = 996612),
  ROW('PENDING'::text, TRUE, 200000::numeric, 0),
  'P12 after role matrix: still PENDING, NULL approver, price 200000, 0 log rows');

-- B3. Log failure rollback on P13 (UNIQUE NHAT_KY_GIA.DeXuatID fails after KHU_VUC & DE_XUAT_GIA updates)
INSERT INTO public."NHAT_KY_GIA" (
  "KhuVucID", "DeXuatID", "LoaiBienDong", "GiaCu", "GiaMoi",
  "TyLeThayDoiPhanTram", "LyDoThayDoi", "NguoiThucHienID"
) VALUES (
  996513, 996613, 'KHOI_TAO', 200000, 200000, 0, 't3 fixture chiem DeXuatID', NULL
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ SELECT public.duyet_de_xuat_gia(996613, 'Thu rollback nhat ky') $$,
  '23505', NULL,
  'P13 approve hits 23505 unique violation when NHAT_KY_GIA.DeXuatID already exists');
RESET ROLE;

SELECT is(
  (SELECT ROW(kv."GiaVeNiemYet"::numeric, dx."TrangThaiDuyet"::text,
              dx."NguoiDuyetID" IS NULL, dx."ThoiGianDuyet" IS NULL, dx."GhiChuDuyet" IS NULL,
              (SELECT count(*) FROM public."NHAT_KY_GIA" nk WHERE nk."KhuVucID" = 996513)::int)
     FROM public."DE_XUAT_GIA" dx JOIN public."KHU_VUC" kv ON kv."KhuVucID" = dx."KhuVucID"
    WHERE dx."DeXuatID" = 996613),
  ROW(200000::numeric, 'PENDING'::text, TRUE, TRUE, TRUE, 1),
  'P13 log failure rolls back zone price to 200000, proposal to PENDING/NULLs, and keeps 1 fixture log row');

-- B4. ACL and catalog checks
SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p
    WHERE p.oid IN (
            'public.duyet_de_xuat_gia(bigint, text, numeric)'::regprocedure,
            'public.tu_choi_de_xuat_gia(bigint, text)'::regprocedure
          )
      AND p.prosecdef
      AND 'search_path=public' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]))),
  2,
  'Both approval RPCs are SECURITY DEFINER with SET search_path = public');

SELECT is(
  has_function_privilege('anon', 'public.duyet_de_xuat_gia(bigint, text, numeric)', 'EXECUTE')
  OR has_function_privilege('service_role', 'public.duyet_de_xuat_gia(bigint, text, numeric)', 'EXECUTE')
  OR has_function_privilege('anon', 'public.tu_choi_de_xuat_gia(bigint, text)', 'EXECUTE')
  OR has_function_privilege('service_role', 'public.tu_choi_de_xuat_gia(bigint, text)', 'EXECUTE'),
  FALSE,
  'anon and service_role have no EXECUTE privilege on either approval RPC');

SELECT is(
  has_function_privilege('authenticated', 'public.duyet_de_xuat_gia(bigint, text, numeric)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.tu_choi_de_xuat_gia(bigint, text)', 'EXECUTE'),
  TRUE,
  'authenticated has EXECUTE privilege on both approval RPCs');

SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p
     CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid IN (
            'public.duyet_de_xuat_gia(bigint, text, numeric)'::regprocedure,
            'public.tu_choi_de_xuat_gia(bigint, text)'::regprocedure
          )
      AND a.grantee = 0
      AND a.privilege_type = 'EXECUTE'),
  0,
  'PUBLIC (grantee 0) has no EXECUTE on either approval RPC (proacl)');

SELECT is(
  has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'INSERT')
  OR has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'UPDATE')
  OR has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'DELETE')
  OR has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'TRUNCATE')
  OR has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'INSERT')
  OR has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'UPDATE')
  OR has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'DELETE')
  OR has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'TRUNCATE')
  OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'INSERT')
  OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'UPDATE')
  OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'DELETE')
  OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'TRUNCATE')
  OR has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'INSERT')
  OR has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'UPDATE')
  OR has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'DELETE')
  OR has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'TRUNCATE')
  OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'INSERT')
  OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'UPDATE')
  OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'DELETE')
  OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'TRUNCATE')
  OR has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'INSERT')
  OR has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'UPDATE')
  OR has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'DELETE')
  OR has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'TRUNCATE'),
  FALSE,
  'anon and authenticated have no INSERT/UPDATE/DELETE/TRUNCATE on DE_XUAT_GIA, NHAT_KY_GIA or QUY_TAC_GIA');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777701';
SELECT throws_ok(
  $$ UPDATE public."DE_XUAT_GIA" SET "TrangThaiDuyet" = 'APPROVED' WHERE "DeXuatID" = 996612 $$,
  '42501', NULL,
  'owner 01 (authenticated) cannot directly UPDATE DE_XUAT_GIA');
SELECT throws_ok(
  $$ INSERT INTO public."NHAT_KY_GIA" ("KhuVucID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram", "LyDoThayDoi") VALUES (996512, 'KHOI_TAO', 200000, 200000, 0, 'direct insert') $$,
  '42501', NULL,
  'owner 01 (authenticated) cannot directly INSERT into NHAT_KY_GIA');
RESET ROLE;

-- section B: 38 assertions (B1 8, B2 21, B3 2, B4 7) -> total: 77 assertions

SELECT * FROM finish();
ROLLBACK;
