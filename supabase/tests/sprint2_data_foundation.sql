-- pgTAP: nen du lieu va phan quyen Sprint 2 (T5)
-- Migrations under test:
--   20261112090000_sprint2_pricing_tables.sql   (3 cot nen + QUY_TAC_GIA / DE_XUAT_GIA / NHAT_KY_GIA)
--   20261112100000_sprint2_ghe_state_time.sql   (GHE.NgayCapNhatTrangThai + trigger)
--   20261112110000_sprint2_pricing_security.sql (RLS, ACL, NHAT_KY_GIA bat bien)
--
-- TRANG THAI / STATUS: authored only. `npm run check` (TypeScript + node tests + Vite build)
-- does NOT execute pgTAP, so this file has NOT been run by the gate and nothing here proves it
-- passes. The reviewer must run `npm run db:test` (against a DB rebuilt by `npm run db:reset`)
-- after merge. Do not read this header as a claim that the database tests are green.
--
-- Fixtures are fully self-contained (auth.users, HO_SO_NGUOI_DUNG, TO_CHUC, THANH_VIEN_TO_CHUC,
-- SU_KIEN, SUAT_DIEN, KHU_VUC, GHE, pricing data). Nothing depends on seed.sql, the other test
-- files or their order. Every mutation is rolled back. No GRANT / policy / ALTER ACL is issued.
--
-- Fixture map (IDs 9951xx / 9952xx; all UUIDs are new):
--   Users  : A QUAN_TRI    99510000-0000-4000-8000-000000000001 (ORGANIZER)
--            A VAN_HANH    99510000-0000-4000-8000-000000000002 (ORGANIZER)
--            A VAN_HANH    99510000-0000-4000-8000-000000000003 (LoaiTaiKhoan = USER)
--            B QUAN_TRI    99520000-0000-4000-8000-000000000001 (ORGANIZER)
--            audience      99530000-0000-4000-8000-000000000001 (USER, no membership)
--            audit actor   99540000-0000-4000-8000-000000000001 (ORGANIZER, no membership)
--   Orgs   : A 99510000-0000-4000-8000-0000000000a1, B 99520000-0000-4000-8000-0000000000b1
--   Events : 995101 (org A), 995201 (org B), both CONG_KHAI; SUAT_DIEN id = SU_KIEN id
--   Zones  : 995101 org A main (QTG/DXG/NKG 995101, seats 9951001-9951003)
--            995201 org B main (QTG/DXG/NKG 995201)
--            995102 org A CASCADE-only (rule+proposal, no audit)
--            995103 org A CHECK zone, 995104 org A defaults zone, 995106 org A boundary zone
--            995105 org A audited-only zone (NKG 995105, 995106) used for RESTRICT
--   NOTE: sections below add extra rows in org A zones 995103/995104/995106. Tests of RLS reads
--   should filter on "KhuVucID" IN (995101, 995201) to get exact counts (1 row per table per org).

BEGIN;

SELECT plan(154);

-- ============================================================================
-- FIXTURES (run as postgres)
-- ============================================================================
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('99510000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 't5-a-admin@example.com'),
  ('99510000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 't5-a-ops@example.com'),
  ('99510000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 't5-a-ops-user@example.com'),
  ('99520000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 't5-b-admin@example.com'),
  ('99530000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 't5-audience@example.com'),
  ('99540000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 't5-audit-actor@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('99510000-0000-4000-8000-000000000001', 'T5 Org A Quan Tri', 'ORGANIZER'),
  ('99510000-0000-4000-8000-000000000002', 'T5 Org A Van Hanh', 'ORGANIZER'),
  ('99510000-0000-4000-8000-000000000003', 'T5 Org A Van Hanh (USER)', 'USER'),
  ('99520000-0000-4000-8000-000000000001', 'T5 Org B Quan Tri', 'ORGANIZER'),
  ('99530000-0000-4000-8000-000000000001', 'T5 Audience', 'USER'),
  ('99540000-0000-4000-8000-000000000001', 'T5 Audit Actor', 'ORGANIZER')
ON CONFLICT ("NguoiDungID") DO UPDATE
SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES
  ('99510000-0000-4000-8000-0000000000a1', 'T5 Org A', 't5-org-a'),
  ('99520000-0000-4000-8000-0000000000b1', 'T5 Org B', 't5-org-b');

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('99510000-0000-4000-8000-0000000000a1', '99510000-0000-4000-8000-000000000001', 'QUAN_TRI'),
  ('99510000-0000-4000-8000-0000000000a1', '99510000-0000-4000-8000-000000000002', 'VAN_HANH'),
  ('99510000-0000-4000-8000-0000000000a1', '99510000-0000-4000-8000-000000000003', 'VAN_HANH'),
  ('99520000-0000-4000-8000-0000000000b1', '99520000-0000-4000-8000-000000000001', 'QUAN_TRI');

-- Events start as BAN_NHAP (direct CONG_KHAI insert is blocked by trg_kiem_tra_cong_bo_su_kien)
INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES
  (
    995101, 'T5 Event A', 't5-event-a', '99510000-0000-4000-8000-0000000000a1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'Ha Noi', 'San A',
    'DANG_MO_BAN', 'BAN_NHAP'
  ),
  (
    995201, 'T5 Event B', 't5-event-b', '99520000-0000-4000-8000-0000000000b1',
    NOW() + INTERVAL '12 days', NOW() + INTERVAL '12 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '11 days', 'Ha Noi', 'San B',
    'DANG_MO_BAN', 'BAN_NHAP'
  );

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  (
    995101, 995101, 't5-suat-a', 'T5 Suat A',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'DANG_MO_BAN'
  ),
  (
    995201, 995201, 't5-suat-b', 'T5 Suat B',
    NOW() + INTERVAL '12 days', NOW() + INTERVAL '12 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '11 days', 'DANG_MO_BAN'
  );

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (995101, 995101, 995101, 'T5_ZONE_A_MAIN',    'T5 A main',     'DUNG_STAND', 200000, '#111111', 100),
  (995102, 995101, 995101, 'T5_ZONE_A_CASCADE', 'T5 A cascade',  'DUNG_STAND', 200000, '#111112', 100),
  (995103, 995101, 995101, 'T5_ZONE_A_CHECK',   'T5 A check',    'DUNG_STAND', 200000, '#111113', 100),
  (995104, 995101, 995101, 'T5_ZONE_A_DEFAULT', 'T5 A default',  'DUNG_STAND', 200000, '#111114', 100),
  (995105, 995101, 995101, 'T5_ZONE_A_AUDITED', 'T5 A audited',  'DUNG_STAND', 200000, '#111115', 100),
  (995106, 995101, 995101, 'T5_ZONE_A_BOUND',   'T5 A boundary', 'DUNG_STAND', 200000, '#111116', 100),
  (995201, 995201, 995201, 'T5_ZONE_B_MAIN',    'T5 B main',     'DUNG_STAND', 300000, '#222222', 100);

-- Publish through the real RPC as the owning org QUAN_TRI member
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '99510000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
DO $$ BEGIN PERFORM public.cong_bo_su_kien(995101); END $$;
SET LOCAL "request.jwt.claim.sub" = '99520000-0000-4000-8000-000000000001';
DO $$ BEGIN PERFORM public.cong_bo_su_kien(995201); END $$;
RESET ROLE;

-- Seats in org A main zone (created directly as postgres, status TRONG)
INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai", "ToaDoX", "ToaDoY")
VALUES
  (9951001, 995101, 'T5', '01', 'T5-A-01', 'TRONG', 10, 10),
  (9951002, 995101, 'T5', '02', 'T5-A-02', 'TRONG', 20, 10),
  (9951003, 995101, 'T5', '03', 'T5-A-03', 'TRONG', 30, 10);

-- Pricing data. Zones 995101 / 995201 each hold exactly 1 rule, 1 proposal, 1 audit row.
INSERT INTO public."QUY_TAC_GIA" ("QuyTacGiaID", "KhuVucID", "GiaGoc", "GiaSan", "GiaTran")
VALUES
  (995101, 995101, 200000, 150000, 350000),
  (995102, 995102, 200000, 150000, 350000),
  (995201, 995201, 300000, 200000, 500000);

INSERT INTO public."DE_XUAT_GIA" (
  "DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
  "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat"
) VALUES
  (995101, 995101, 995101, 0.5000, 5.00, 4.00, 48.00, 200000, 220000, 220000),
  (995102, 995102, 995102, 0.5000, 5.00, 4.00, 48.00, 200000, 220000, 220000),
  (995201, 995201, 995201, 0.4000, 3.00, 4.00, 72.00, 300000, 290000, 290000);

-- Audit rows. 995105/995106 sit on the audited-only zone 995105; 995106 carries NguoiThucHienID.
INSERT INTO public."NHAT_KY_GIA" (
  "NhatKyGiaID", "KhuVucID", "DeXuatID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram",
  "LyDoThayDoi", "NguoiThucHienID"
) VALUES
  (995101, 995101, 995101, 'KHOI_TAO', 200000, 200000, 0.00, 'T5 khoi tao A', NULL),
  (995201, 995201, 995201, 'KHOI_TAO', 300000, 300000, 0.00, 'T5 khoi tao B', NULL),
  (995105, 995105, NULL, 'KHOI_TAO', 200000, 200000, 0.00, 'T5 audit zone only', NULL),
  (995106, 995105, NULL, 'DIEU_CHINH_THU_CONG', 200000, 210000, 5.00, 'T5 audit with actor',
   '99540000-0000-4000-8000-000000000001');

-- One hold + detail (GIU_CHO requires SuKienID/SuatDienID to match) and one event config row
INSERT INTO public."GIU_CHO" ("GiuChoID", "SuKienID", "SuatDienID", "PhienNguoiDung")
VALUES ('99510000-0000-4000-8000-0000000000c1', 995101, 995101, '99510000-0000-4000-8000-0000000000d1');

INSERT INTO public."CHI_TIET_GIU_CHO" ("ID", "GiuChoID", "KhuVucID", "MaVe")
VALUES (995101, '99510000-0000-4000-8000-0000000000c1', 995101, 'T5-VE-001');

INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID") VALUES (995101);

-- ============================================================================
-- SCHEMA: new tables, foundation columns, GHE timestamp (assertions 1-28)
-- ============================================================================
-- 1-3. Tables exist
SELECT has_table('public', 'QUY_TAC_GIA', 'QUY_TAC_GIA exists');
SELECT has_table('public', 'DE_XUAT_GIA', 'DE_XUAT_GIA exists');
SELECT has_table('public', 'NHAT_KY_GIA', 'NHAT_KY_GIA exists');

-- 4-6. CHI_TIET_GIU_CHO.DonGiaChot
SELECT col_type_is('public', 'CHI_TIET_GIU_CHO', 'DonGiaChot', 'numeric(12,2)', 'DonGiaChot is numeric(12,2)');
SELECT col_is_null('public', 'CHI_TIET_GIU_CHO', 'DonGiaChot', 'DonGiaChot is nullable');
SELECT col_hasnt_default('public', 'CHI_TIET_GIU_CHO', 'DonGiaChot', 'DonGiaChot has no default');

-- 7-9. GIU_CHO.NguoiDungID
SELECT col_type_is('public', 'GIU_CHO', 'NguoiDungID', 'uuid', 'GIU_CHO.NguoiDungID is uuid');
SELECT col_is_null('public', 'GIU_CHO', 'NguoiDungID', 'GIU_CHO.NguoiDungID is nullable');
SELECT col_hasnt_default('public', 'GIU_CHO', 'NguoiDungID', 'GIU_CHO.NguoiDungID has no default');

-- 10-12. CAU_HINH_SU_KIEN.YeuCauXacMinhOTP
SELECT col_type_is('public', 'CAU_HINH_SU_KIEN', 'YeuCauXacMinhOTP', 'boolean', 'YeuCauXacMinhOTP is boolean');
SELECT col_not_null('public', 'CAU_HINH_SU_KIEN', 'YeuCauXacMinhOTP', 'YeuCauXacMinhOTP is NOT NULL');
SELECT col_has_default('public', 'CAU_HINH_SU_KIEN', 'YeuCauXacMinhOTP', 'YeuCauXacMinhOTP has a default');

-- 13-15. GHE.NgayCapNhatTrangThai
SELECT col_type_is('public', 'GHE', 'NgayCapNhatTrangThai', 'timestamp with time zone', 'NgayCapNhatTrangThai is timestamptz');
SELECT col_is_null('public', 'GHE', 'NgayCapNhatTrangThai', 'NgayCapNhatTrangThai is nullable');
SELECT col_hasnt_default('public', 'GHE', 'NgayCapNhatTrangThai', 'NgayCapNhatTrangThai has no default');

-- 16-20. QUY_TAC_GIA key columns
SELECT col_type_is('public', 'QUY_TAC_GIA', 'GiaGoc', 'numeric(12,2)', 'QUY_TAC_GIA.GiaGoc is numeric(12,2)');
SELECT col_type_is('public', 'QUY_TAC_GIA', 'BienDoToiDaMoiChuKy', 'numeric(5,4)', 'QUY_TAC_GIA.BienDoToiDaMoiChuKy is numeric(5,4)');
SELECT col_type_is('public', 'QUY_TAC_GIA', 'KhuVucID', 'integer', 'QUY_TAC_GIA.KhuVucID is integer');
SELECT col_not_null('public', 'QUY_TAC_GIA', 'KhuVucID', 'QUY_TAC_GIA.KhuVucID is NOT NULL');
SELECT col_is_null('public', 'QUY_TAC_GIA', 'NguoiCapNhatID', 'QUY_TAC_GIA.NguoiCapNhatID is nullable');

-- 21-24. DE_XUAT_GIA key columns
SELECT col_type_is('public', 'DE_XUAT_GIA', 'TrangThaiDuyet', 'character varying(20)', 'DE_XUAT_GIA.TrangThaiDuyet is varchar(20)');
SELECT col_type_is('public', 'DE_XUAT_GIA', 'LoaiCanhBao', 'character varying(30)', 'DE_XUAT_GIA.LoaiCanhBao is varchar(30)');
SELECT col_type_is('public', 'DE_XUAT_GIA', 'QuyTacGiaID', 'bigint', 'DE_XUAT_GIA.QuyTacGiaID is bigint');
SELECT col_is_null('public', 'DE_XUAT_GIA', 'NguoiDuyetID', 'DE_XUAT_GIA.NguoiDuyetID is nullable');

-- 25-28. NHAT_KY_GIA key columns
SELECT col_type_is('public', 'NHAT_KY_GIA', 'DeXuatID', 'bigint', 'NHAT_KY_GIA.DeXuatID is bigint');
SELECT col_is_null('public', 'NHAT_KY_GIA', 'DeXuatID', 'NHAT_KY_GIA.DeXuatID is nullable');
SELECT col_is_null('public', 'NHAT_KY_GIA', 'NguoiThucHienID', 'NHAT_KY_GIA.NguoiThucHienID is nullable');
SELECT col_type_is('public', 'NHAT_KY_GIA', 'LoaiBienDong', 'character varying(30)', 'NHAT_KY_GIA.LoaiBienDong is varchar(30)');

-- ============================================================================
-- DEFAULTS and NULL compatibility with legacy-shaped rows (29-38)
-- ============================================================================
-- 29-31. Fixture rows were inserted without the new columns
SELECT is(
  (SELECT count(*)::int FROM public."CHI_TIET_GIU_CHO" WHERE "ID" = 995101 AND "DonGiaChot" IS NULL),
  1, 'CHI_TIET_GIU_CHO inserted without DonGiaChot keeps NULL'
);
SELECT is(
  (SELECT count(*)::int FROM public."GIU_CHO" WHERE "GiuChoID" = '99510000-0000-4000-8000-0000000000c1' AND "NguoiDungID" IS NULL),
  1, 'GIU_CHO inserted without NguoiDungID keeps NULL'
);
SELECT is(
  (SELECT count(*)::int FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = 995101 AND "YeuCauXacMinhOTP" = false),
  1, 'CAU_HINH_SU_KIEN inserted without YeuCauXacMinhOTP defaults to false'
);

-- 32-33. QUY_TAC_GIA relies on defaults (zone 995104)
SELECT lives_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("QuyTacGiaID", "KhuVucID", "GiaGoc", "GiaSan", "GiaTran") VALUES (995104, 995104, 200000, 150000, 350000) $$,
  'QUY_TAC_GIA insert with only required columns succeeds'
);
SELECT is(
  (SELECT count(*)::int FROM public."QUY_TAC_GIA"
    WHERE "QuyTacGiaID" = 995104
      AND "BuocNhayGia" = 10000.00 AND "BienDoToiDaMoiChuKy" = 0.2000
      AND "NguongLapDayThap" = 0.3000 AND "NguongLapDayCao" = 0.6000
      AND "TrongSoLapDay" = 1.0000 AND "TrongSoTocDoBan" = 1.0000 AND "TrongSoThoiGian" = 1.0000
      AND "TrangThaiKichHoat" IS TRUE AND "NguoiCapNhatID" IS NULL
      AND "NgayTao" IS NOT NULL AND "NgayCapNhat" IS NOT NULL),
  1, 'QUY_TAC_GIA defaults are applied'
);

-- 34-35. DE_XUAT_GIA relies on defaults
SELECT lives_ok(
  $$ INSERT INTO public."DE_XUAT_GIA" ("DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong", "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat") VALUES (995104, 995104, 995104, 0.5, 1.0, 1.0, 10, 200000, 210000, 210000) $$,
  'DE_XUAT_GIA insert with only required columns succeeds'
);
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA"
    WHERE "DeXuatID" = 995104
      AND "CoCanhBaoVuotKhung" IS FALSE AND "LoaiCanhBao" = 'BINH_THUONG' AND "TrangThaiDuyet" = 'PENDING'
      AND "NguoiDuyetID" IS NULL AND "ThoiGianDuyet" IS NULL AND "ThoiGianDeXuat" IS NOT NULL),
  1, 'DE_XUAT_GIA defaults are PENDING / BINH_THUONG'
);

-- 36-38. NHAT_KY_GIA accepts NULL DeXuatID / NguoiThucHienID, twice (nullable UNIQUE)
SELECT lives_ok(
  $$ INSERT INTO public."NHAT_KY_GIA" ("NhatKyGiaID", "KhuVucID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram", "LyDoThayDoi") VALUES (995107, 995104, 'KHOI_TAO', 1, 1, 0, 'T5 null link 1') $$,
  'NHAT_KY_GIA insert with NULL DeXuatID/NguoiThucHienID succeeds'
);
SELECT lives_ok(
  $$ INSERT INTO public."NHAT_KY_GIA" ("NhatKyGiaID", "KhuVucID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram", "LyDoThayDoi") VALUES (995108, 995104, 'KHOI_TAO', 1, 1, 0, 'T5 null link 2') $$,
  'NHAT_KY_GIA allows several rows with NULL DeXuatID (nullable UNIQUE)'
);
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA"
    WHERE "NhatKyGiaID" IN (995107, 995108) AND "DeXuatID" IS NULL AND "NguoiThucHienID" IS NULL AND "ThoiGianApDung" IS NOT NULL),
  2, 'NHAT_KY_GIA NULL links and default ThoiGianApDung are stored'
);

-- ============================================================================
-- CHECK / UNIQUE constraints (39-55). All failing payloads use an existing zone so only the
-- constraint under test can reject them.
-- ============================================================================
-- 39-41. chk_khung_gia_hop_le (zone 995103 has no rule yet)
SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran") VALUES (995103, 200000, 0, 350000) $$,
  '23514',
  'new row for relation "QUY_TAC_GIA" violates check constraint "chk_khung_gia_hop_le"',
  'GiaSan = 0 is rejected'
);
SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran") VALUES (995103, 200000, 250000, 350000) $$,
  '23514',
  'new row for relation "QUY_TAC_GIA" violates check constraint "chk_khung_gia_hop_le"',
  'GiaSan above GiaGoc is rejected'
);
SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran") VALUES (995103, 400000, 150000, 350000) $$,
  '23514',
  'new row for relation "QUY_TAC_GIA" violates check constraint "chk_khung_gia_hop_le"',
  'GiaGoc above GiaTran is rejected'
);

-- 42-43. chk_buoc_nhay_duong
SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran", "BuocNhayGia") VALUES (995103, 200000, 150000, 350000, 0) $$,
  '23514',
  'new row for relation "QUY_TAC_GIA" violates check constraint "chk_buoc_nhay_duong"',
  'BuocNhayGia = 0 is rejected'
);
SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran", "BuocNhayGia") VALUES (995103, 200000, 150000, 350000, -1) $$,
  '23514',
  'new row for relation "QUY_TAC_GIA" violates check constraint "chk_buoc_nhay_duong"',
  'negative BuocNhayGia is rejected'
);

-- 44-46. chk_bien_do_hop_le (0 < x <= 1)
SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran", "BienDoToiDaMoiChuKy") VALUES (995103, 200000, 150000, 350000, 0) $$,
  '23514',
  'new row for relation "QUY_TAC_GIA" violates check constraint "chk_bien_do_hop_le"',
  'BienDoToiDaMoiChuKy = 0 is rejected'
);
SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran", "BienDoToiDaMoiChuKy") VALUES (995103, 200000, 150000, 350000, 1.0001) $$,
  '23514',
  'new row for relation "QUY_TAC_GIA" violates check constraint "chk_bien_do_hop_le"',
  'BienDoToiDaMoiChuKy above 1 is rejected'
);
SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran", "BienDoToiDaMoiChuKy") VALUES (995103, 200000, 150000, 350000, -0.1) $$,
  '23514',
  'new row for relation "QUY_TAC_GIA" violates check constraint "chk_bien_do_hop_le"',
  'negative BienDoToiDaMoiChuKy is rejected'
);

-- 47-48. Valid bands, including the upper bound of the amplitude and the floor = base = ceiling edge
SELECT lives_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("QuyTacGiaID", "KhuVucID", "GiaGoc", "GiaSan", "GiaTran", "BuocNhayGia", "BienDoToiDaMoiChuKy") VALUES (995103, 995103, 200000, 150000, 350000, 1, 1.0000) $$,
  'valid band with BienDo = 1 and minimal step is accepted'
);
SELECT lives_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("QuyTacGiaID", "KhuVucID", "GiaGoc", "GiaSan", "GiaTran") VALUES (995106, 995106, 100000, 100000, 100000) $$,
  'floor = base = ceiling is accepted'
);

-- 49-50. UNIQUE constraints
SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran") VALUES (995101, 200000, 150000, 350000) $$,
  '23505',
  'duplicate key value violates unique constraint "QUY_TAC_GIA_KhuVucID_key"',
  'second QUY_TAC_GIA for the same zone is rejected'
);
SELECT throws_ok(
  $$ INSERT INTO public."NHAT_KY_GIA" ("KhuVucID", "DeXuatID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram", "LyDoThayDoi") VALUES (995101, 995101, 'KHOI_TAO', 1, 1, 0, 'T5 duplicate proposal') $$,
  '23505',
  'duplicate key value violates unique constraint "NHAT_KY_GIA_DeXuatID_key"',
  'second NHAT_KY_GIA for the same DeXuatID is rejected'
);

-- 51-53. Status / type CHECKs (rule 995103 and zone 995103 exist)
SELECT throws_ok(
  $$ INSERT INTO public."DE_XUAT_GIA" ("QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong", "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "TrangThaiDuyet") VALUES (995103, 995103, 0.5, 1.0, 1.0, 10, 200000, 210000, 210000, 'DONE') $$,
  '23514',
  'new row for relation "DE_XUAT_GIA" violates check constraint "chk_trang_thai_duyet"',
  'unknown TrangThaiDuyet is rejected'
);
SELECT throws_ok(
  $$ INSERT INTO public."DE_XUAT_GIA" ("QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong", "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "LoaiCanhBao") VALUES (995103, 995103, 0.5, 1.0, 1.0, 10, 200000, 210000, 210000, 'KHAC') $$,
  '23514',
  'new row for relation "DE_XUAT_GIA" violates check constraint "chk_loai_canh_bao"',
  'unknown LoaiCanhBao is rejected'
);
SELECT throws_ok(
  $$ INSERT INTO public."NHAT_KY_GIA" ("KhuVucID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram", "LyDoThayDoi") VALUES (995103, 'TU_DONG', 1, 1, 0, 'T5 bad type') $$,
  '23514',
  'new row for relation "NHAT_KY_GIA" violates check constraint "chk_loai_bien_dong"',
  'unknown LoaiBienDong is rejected'
);

-- 54-55. Valid non-default enum values are accepted
SELECT lives_ok(
  $$ INSERT INTO public."DE_XUAT_GIA" ("DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong", "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "LoaiCanhBao", "TrangThaiDuyet") VALUES (995103, 995103, 995103, 0.5, 1.0, 1.0, 10, 200000, 210000, 210000, 'CHAM_GIA_SAN', 'EXPIRED') $$,
  'DE_XUAT_GIA accepts CHAM_GIA_SAN / EXPIRED'
);
SELECT lives_ok(
  $$ INSERT INTO public."NHAT_KY_GIA" ("NhatKyGiaID", "KhuVucID", "DeXuatID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram", "LyDoThayDoi") VALUES (995109, 995103, 995103, 'DUYET_DE_XUAT_AI', 1, 1, 0, 'T5 valid type') $$,
  'NHAT_KY_GIA accepts DUYET_DE_XUAT_AI'
);

-- ============================================================================
-- FOREIGN KEYS (56-66)
-- ============================================================================
-- 56-59. CASCADE: zone 995102 has a rule and a proposal but no audit row
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 995102),
  0, 'precondition: zone 995102 has no audit rows'
);
SELECT lives_ok(
  $$ DELETE FROM public."KHU_VUC" WHERE "KhuVucID" = 995102 $$,
  'deleting an audit-free zone succeeds'
);
SELECT is(
  (SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 995102),
  0, 'KHU_VUC delete cascades to QUY_TAC_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 995102),
  0, 'KHU_VUC delete cascades to DE_XUAT_GIA'
);

-- 60-62. CASCADE QUY_TAC_GIA -> DE_XUAT_GIA (rule 995106 has no audit)
SELECT lives_ok(
  $$ INSERT INTO public."DE_XUAT_GIA" ("DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong", "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat") VALUES (995106, 995106, 995106, 0.5, 1.0, 1.0, 10, 100000, 100000, 100000) $$,
  'proposal on audit-free rule 995106 is created'
);
SELECT lives_ok(
  $$ DELETE FROM public."QUY_TAC_GIA" WHERE "QuyTacGiaID" = 995106 $$,
  'deleting an audit-free rule succeeds'
);
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 995106),
  0, 'QUY_TAC_GIA delete cascades to DE_XUAT_GIA'
);

-- 63-65. RESTRICT: the FK constraint name in the message proves the FK (not the trigger) rejected it
SELECT throws_ok(
  $$ DELETE FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 995101 $$,
  '23503',
  'update or delete on table "DE_XUAT_GIA" violates foreign key constraint "NHAT_KY_GIA_DeXuatID_fkey" on table "NHAT_KY_GIA"',
  'audited DE_XUAT_GIA cannot be deleted (RESTRICT)'
);
SELECT throws_ok(
  $$ DELETE FROM public."KHU_VUC" WHERE "KhuVucID" = 995105 $$,
  '23503',
  'update or delete on table "KHU_VUC" violates foreign key constraint "NHAT_KY_GIA_KhuVucID_fkey" on table "NHAT_KY_GIA"',
  'audited KHU_VUC cannot be deleted (RESTRICT)'
);
SELECT throws_ok(
  $$ DELETE FROM public."HO_SO_NGUOI_DUNG" WHERE "NguoiDungID" = '99540000-0000-4000-8000-000000000001' $$,
  '23503',
  'update or delete on table "HO_SO_NGUOI_DUNG" violates foreign key constraint "NHAT_KY_GIA_NguoiThucHienID_fkey" on table "NHAT_KY_GIA"',
  'audit actor profile cannot be deleted (RESTRICT)'
);

-- 66. Nothing was removed: 1 proposal + 1 zone + 1 profile + 3 audit rows (995101, 995105, 995106)
SELECT is(
  (SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 995101)
  + (SELECT count(*)::int FROM public."KHU_VUC" WHERE "KhuVucID" = 995105)
  + (SELECT count(*)::int FROM public."HO_SO_NGUOI_DUNG" WHERE "NguoiDungID" = '99540000-0000-4000-8000-000000000001')
  + (SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "NhatKyGiaID" IN (995101, 995105, 995106)),
  6, 'RESTRICT attempts left every referenced row in place'
);

-- ============================================================================
-- GHE.NgayCapNhatTrangThai (67-79). now() is constant inside this transaction, so "kept"
-- is proven against a fixed 2001 marker, never against a later now().
-- ============================================================================
-- 67. Seats start with NULL
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" IN (9951001, 9951002, 9951003) AND "NgayCapNhatTrangThai" IS NULL),
  3, 'new seats have NULL NgayCapNhatTrangThai'
);

-- 68-69. Status change stamps now()
SELECT lives_ok(
  $$ UPDATE public."GHE" SET "TrangThai" = 'DANG_GIU' WHERE "GheID" = 9951001 $$,
  'seat 9951001 TRONG -> DANG_GIU'
);
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" = 9951001 AND "NgayCapNhatTrangThai" = now()),
  1, 'status change sets NgayCapNhatTrangThai = now()'
);

-- 70-71. Marker write does not fire the trigger (TrangThai not in the SET list)
SELECT lives_ok(
  $$ UPDATE public."GHE" SET "NgayCapNhatTrangThai" = '2001-02-03 04:05:06+00' WHERE "GheID" = 9951001 $$,
  'marker written to NgayCapNhatTrangThai'
);
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" = 9951001 AND "NgayCapNhatTrangThai" = '2001-02-03 04:05:06+00'::timestamptz),
  1, 'marker is stored as written'
);

-- 72-73. Same status keeps the marker
SELECT lives_ok(
  $$ UPDATE public."GHE" SET "TrangThai" = 'DANG_GIU' WHERE "GheID" = 9951001 $$,
  'seat 9951001 updated to the same status'
);
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" = 9951001 AND "NgayCapNhatTrangThai" = '2001-02-03 04:05:06+00'::timestamptz),
  1, 'same-status update keeps the marker'
);

-- 74-75. Other column keeps the marker
SELECT lives_ok(
  $$ UPDATE public."GHE" SET "ToaDoX" = 77 WHERE "GheID" = 9951001 $$,
  'seat 9951001 ToaDoX updated'
);
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" = 9951001 AND "ToaDoX" = 77 AND "NgayCapNhatTrangThai" = '2001-02-03 04:05:06+00'::timestamptz),
  1, 'other-column update keeps the marker'
);

-- 76-77. A real change afterwards replaces the marker
SELECT lives_ok(
  $$ UPDATE public."GHE" SET "TrangThai" = 'DA_BAN' WHERE "GheID" = 9951001 $$,
  'seat 9951001 DANG_GIU -> DA_BAN'
);
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" = 9951001 AND "NgayCapNhatTrangThai" = now()),
  1, 'second real status change replaces the marker with now()'
);

-- 78-79. Same-state write on a NULL seat does not invent a timestamp
SELECT lives_ok(
  $$ UPDATE public."GHE" SET "TrangThai" = 'TRONG' WHERE "GheID" = 9951002 $$,
  'seat 9951002 updated to the same status TRONG'
);
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" = 9951002 AND "NgayCapNhatTrangThai" IS NULL),
  1, 'same-status update on a NULL seat stays NULL'
);

-- ============================================================================
-- GHE direct writes stay blocked for authenticated (80-84). Privilege check precedes RLS and
-- CHECK, and the payloads are valid, so 42501 can only come from missing table privileges.
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '99510000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- 80-82
SELECT throws_ok(
  $$ INSERT INTO public."GHE" ("KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai") VALUES (995101, 'T5', '99', 'T5-A-99', 'TRONG') $$,
  '42501', NULL, 'authenticated cannot INSERT into GHE'
);
SELECT throws_ok(
  $$ UPDATE public."GHE" SET "TrangThai" = 'DA_BAN' WHERE "GheID" = 9951003 $$,
  '42501', NULL, 'authenticated cannot UPDATE GHE'
);
SELECT throws_ok(
  $$ DELETE FROM public."GHE" WHERE "GheID" = 9951003 $$,
  '42501', NULL, 'authenticated cannot DELETE from GHE'
);
RESET ROLE;

-- 83-84. Catalog view of the same fact, and the target seat is untouched
SELECT is(
  has_table_privilege('authenticated', 'public."GHE"', 'INSERT')
  OR has_table_privilege('authenticated', 'public."GHE"', 'UPDATE')
  OR has_table_privilege('authenticated', 'public."GHE"', 'DELETE'),
  false, 'authenticated holds no INSERT/UPDATE/DELETE privilege on GHE'
);
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" = 9951003 AND "TrangThai" = 'TRONG' AND "NgayCapNhatTrangThai" IS NULL),
  1, 'blocked writes left seat 9951003 unchanged'
);

-- ============================================================================
-- RLS READ ISOLATION across QUY_TAC_GIA, DE_XUAT_GIA, NHAT_KY_GIA (85-112)
-- Events 995101 (org A) and 995201 (org B) are CONG_KHAI, yet pricing tables
-- never leak to non-members, USER-type profiles, or anon.
-- ============================================================================
-- 85. Precondition: both target events are published (CONG_KHAI)
SELECT is(
  (SELECT count(*)::int FROM public."SU_KIEN" WHERE "SuKienID" IN (995101, 995201) AND "TrangThaiCongBo" = 'CONG_KHAI'),
  2, 'precondition: org A and org B target events are CONG_KHAI'
);

-- 86-91. Org A QUAN_TRI (ORGANIZER) reads org A only, 0 from org B
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '99510000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 995101), 1, 'org A QUAN_TRI (ORGANIZER) reads org A QUY_TAC_GIA');
SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 995201), 0, 'org A QUAN_TRI (ORGANIZER) reads 0 org B QUY_TAC_GIA');
SELECT is((SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 995101), 1, 'org A QUAN_TRI (ORGANIZER) reads org A DE_XUAT_GIA');
SELECT is((SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 995201), 0, 'org A QUAN_TRI (ORGANIZER) reads 0 org B DE_XUAT_GIA');
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 995101), 1, 'org A QUAN_TRI (ORGANIZER) reads org A NHAT_KY_GIA');
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 995201), 0, 'org A QUAN_TRI (ORGANIZER) reads 0 org B NHAT_KY_GIA');

-- 92-97. Org A VAN_HANH (ORGANIZER) reads org A only, 0 from org B
SET LOCAL "request.jwt.claim.sub" = '99510000-0000-4000-8000-000000000002';

SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 995101), 1, 'org A VAN_HANH (ORGANIZER) reads org A QUY_TAC_GIA');
SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 995201), 0, 'org A VAN_HANH (ORGANIZER) reads 0 org B QUY_TAC_GIA');
SELECT is((SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 995101), 1, 'org A VAN_HANH (ORGANIZER) reads org A DE_XUAT_GIA');
SELECT is((SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 995201), 0, 'org A VAN_HANH (ORGANIZER) reads 0 org B DE_XUAT_GIA');
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 995101), 1, 'org A VAN_HANH (ORGANIZER) reads org A NHAT_KY_GIA');
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 995201), 0, 'org A VAN_HANH (ORGANIZER) reads 0 org B NHAT_KY_GIA');

-- 98-100. Org A VAN_HANH with LoaiTaiKhoan = USER reads 0 rows despite THANH_VIEN_TO_CHUC membership
SET LOCAL "request.jwt.claim.sub" = '99510000-0000-4000-8000-000000000003';

SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" IN (995101, 995201)), 0, 'USER with org A VAN_HANH membership reads 0 QUY_TAC_GIA');
SELECT is((SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" IN (995101, 995201)), 0, 'USER with org A VAN_HANH membership reads 0 DE_XUAT_GIA');
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" IN (995101, 995201)), 0, 'USER with org A VAN_HANH membership reads 0 NHAT_KY_GIA');

-- 101-103. Audience USER (no membership) reads 0 rows even for CONG_KHAI events
SET LOCAL "request.jwt.claim.sub" = '99530000-0000-4000-8000-000000000001';

SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" IN (995101, 995201)), 0, 'audience USER reads 0 QUY_TAC_GIA on CONG_KHAI events');
SELECT is((SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" IN (995101, 995201)), 0, 'audience USER reads 0 DE_XUAT_GIA on CONG_KHAI events');
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" IN (995101, 995201)), 0, 'audience USER reads 0 NHAT_KY_GIA on CONG_KHAI events');

-- 104-109. Org B QUAN_TRI (ORGANIZER) reads org B only, 0 from org A
SET LOCAL "request.jwt.claim.sub" = '99520000-0000-4000-8000-000000000001';

SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 995101), 0, 'org B QUAN_TRI (ORGANIZER) reads 0 org A QUY_TAC_GIA');
SELECT is((SELECT count(*)::int FROM public."QUY_TAC_GIA" WHERE "KhuVucID" = 995201), 1, 'org B QUAN_TRI (ORGANIZER) reads org B QUY_TAC_GIA');
SELECT is((SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 995101), 0, 'org B QUAN_TRI (ORGANIZER) reads 0 org A DE_XUAT_GIA');
SELECT is((SELECT count(*)::int FROM public."DE_XUAT_GIA" WHERE "KhuVucID" = 995201), 1, 'org B QUAN_TRI (ORGANIZER) reads org B DE_XUAT_GIA');
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 995101), 0, 'org B QUAN_TRI (ORGANIZER) reads 0 org A NHAT_KY_GIA');
SELECT is((SELECT count(*)::int FROM public."NHAT_KY_GIA" WHERE "KhuVucID" = 995201), 1, 'org B QUAN_TRI (ORGANIZER) reads org B NHAT_KY_GIA');
RESET ROLE;

-- 110-112. anon SELECT throws 42501 (SELECT revoked from anon)
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claim.role" = 'anon';

SELECT throws_ok($$ SELECT count(*) FROM public."QUY_TAC_GIA" $$, '42501', NULL, 'anon cannot SELECT QUY_TAC_GIA');
SELECT throws_ok($$ SELECT count(*) FROM public."DE_XUAT_GIA" $$, '42501', NULL, 'anon cannot SELECT DE_XUAT_GIA');
SELECT throws_ok($$ SELECT count(*) FROM public."NHAT_KY_GIA" $$, '42501', NULL, 'anon cannot SELECT NHAT_KY_GIA');
RESET ROLE;
SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claim.role" = '';

-- ============================================================================
-- WRITE ACLs: INSERT / UPDATE / DELETE / TRUNCATE blocked + PUBLIC/role ACLs (113-145)
-- Every write uses valid payloads and existing PKs/FKs so 42501 comes from missing ACLs.
-- ============================================================================
-- 113-124. authenticated (org A QUAN_TRI) cannot INSERT/UPDATE/DELETE/TRUNCATE any pricing table
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '99510000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran") VALUES (995106, 200000, 150000, 350000) $$,
  '42501', NULL, 'authenticated cannot INSERT QUY_TAC_GIA'
);
SELECT throws_ok(
  $$ UPDATE public."QUY_TAC_GIA" SET "GiaGoc" = 210000 WHERE "QuyTacGiaID" = 995101 $$,
  '42501', NULL, 'authenticated cannot UPDATE QUY_TAC_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."QUY_TAC_GIA" WHERE "QuyTacGiaID" = 995101 $$,
  '42501', NULL, 'authenticated cannot DELETE QUY_TAC_GIA'
);
SELECT throws_ok(
  $$ TRUNCATE TABLE public."QUY_TAC_GIA" $$,
  '42501', NULL, 'authenticated cannot TRUNCATE QUY_TAC_GIA'
);

SELECT throws_ok(
  $$ INSERT INTO public."DE_XUAT_GIA" ("QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong", "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat") VALUES (995101, 995101, 0.5000, 5.00, 4.00, 48.00, 200000, 220000, 220000) $$,
  '42501', NULL, 'authenticated cannot INSERT DE_XUAT_GIA'
);
SELECT throws_ok(
  $$ UPDATE public."DE_XUAT_GIA" SET "TrangThaiDuyet" = 'APPROVED' WHERE "DeXuatID" = 995101 $$,
  '42501', NULL, 'authenticated cannot UPDATE DE_XUAT_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 995101 $$,
  '42501', NULL, 'authenticated cannot DELETE DE_XUAT_GIA'
);
SELECT throws_ok(
  $$ TRUNCATE TABLE public."DE_XUAT_GIA" $$,
  '42501', NULL, 'authenticated cannot TRUNCATE DE_XUAT_GIA'
);

SELECT throws_ok(
  $$ INSERT INTO public."NHAT_KY_GIA" ("KhuVucID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram", "LyDoThayDoi") VALUES (995101, 'DIEU_CHINH_THU_CONG', 200000, 210000, 5.00, 'T5 blocked auth insert') $$,
  '42501', NULL, 'authenticated cannot INSERT NHAT_KY_GIA'
);
SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_GIA" SET "LyDoThayDoi" = 'tamper auth' WHERE "NhatKyGiaID" = 995101 $$,
  '42501', NULL, 'authenticated cannot UPDATE NHAT_KY_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_GIA" WHERE "NhatKyGiaID" = 995101 $$,
  '42501', NULL, 'authenticated cannot DELETE NHAT_KY_GIA'
);
SELECT throws_ok(
  $$ TRUNCATE TABLE public."NHAT_KY_GIA" $$,
  '42501', NULL, 'authenticated cannot TRUNCATE NHAT_KY_GIA'
);
RESET ROLE;

-- 125-136. anon cannot INSERT/UPDATE/DELETE/TRUNCATE any pricing table
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claim.role" = 'anon';

SELECT throws_ok(
  $$ INSERT INTO public."QUY_TAC_GIA" ("KhuVucID", "GiaGoc", "GiaSan", "GiaTran") VALUES (995106, 200000, 150000, 350000) $$,
  '42501', NULL, 'anon cannot INSERT QUY_TAC_GIA'
);
SELECT throws_ok(
  $$ UPDATE public."QUY_TAC_GIA" SET "GiaGoc" = 210000 WHERE "QuyTacGiaID" = 995101 $$,
  '42501', NULL, 'anon cannot UPDATE QUY_TAC_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."QUY_TAC_GIA" WHERE "QuyTacGiaID" = 995101 $$,
  '42501', NULL, 'anon cannot DELETE QUY_TAC_GIA'
);
SELECT throws_ok(
  $$ TRUNCATE TABLE public."QUY_TAC_GIA" $$,
  '42501', NULL, 'anon cannot TRUNCATE QUY_TAC_GIA'
);

SELECT throws_ok(
  $$ INSERT INTO public."DE_XUAT_GIA" ("QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong", "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat") VALUES (995101, 995101, 0.5000, 5.00, 4.00, 48.00, 200000, 220000, 220000) $$,
  '42501', NULL, 'anon cannot INSERT DE_XUAT_GIA'
);
SELECT throws_ok(
  $$ UPDATE public."DE_XUAT_GIA" SET "TrangThaiDuyet" = 'APPROVED' WHERE "DeXuatID" = 995101 $$,
  '42501', NULL, 'anon cannot UPDATE DE_XUAT_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."DE_XUAT_GIA" WHERE "DeXuatID" = 995101 $$,
  '42501', NULL, 'anon cannot DELETE DE_XUAT_GIA'
);
SELECT throws_ok(
  $$ TRUNCATE TABLE public."DE_XUAT_GIA" $$,
  '42501', NULL, 'anon cannot TRUNCATE DE_XUAT_GIA'
);

SELECT throws_ok(
  $$ INSERT INTO public."NHAT_KY_GIA" ("KhuVucID", "LoaiBienDong", "GiaCu", "GiaMoi", "TyLeThayDoiPhanTram", "LyDoThayDoi") VALUES (995101, 'DIEU_CHINH_THU_CONG', 200000, 210000, 5.00, 'T5 blocked anon insert') $$,
  '42501', NULL, 'anon cannot INSERT NHAT_KY_GIA'
);
SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_GIA" SET "LyDoThayDoi" = 'tamper anon' WHERE "NhatKyGiaID" = 995101 $$,
  '42501', NULL, 'anon cannot UPDATE NHAT_KY_GIA'
);
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_GIA" WHERE "NhatKyGiaID" = 995101 $$,
  '42501', NULL, 'anon cannot DELETE NHAT_KY_GIA'
);
SELECT throws_ok(
  $$ TRUNCATE TABLE public."NHAT_KY_GIA" $$,
  '42501', NULL, 'anon cannot TRUNCATE NHAT_KY_GIA'
);
RESET ROLE;
SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claim.role" = '';

-- 137-139. PUBLIC (grantee 0) has no SELECT/INSERT/UPDATE/DELETE/TRUNCATE ACL on the 3 tables
SELECT is(
  (SELECT count(*)::int FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = 'public."QUY_TAC_GIA"'::regclass AND a.grantee = 0
     AND a.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0, 'PUBLIC has no read/write ACL on QUY_TAC_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = 'public."DE_XUAT_GIA"'::regclass AND a.grantee = 0
     AND a.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0, 'PUBLIC has no read/write ACL on DE_XUAT_GIA'
);
SELECT is(
  (SELECT count(*)::int FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = 'public."NHAT_KY_GIA"'::regclass AND a.grantee = 0
     AND a.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0, 'PUBLIC has no read/write ACL on NHAT_KY_GIA'
);

-- 140-142. has_table_privilege is false for anon across SELECT/INSERT/UPDATE/DELETE/TRUNCATE
SELECT is(
  has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'SELECT')
  OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'INSERT')
  OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'UPDATE')
  OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'DELETE')
  OR has_table_privilege('anon', 'public."QUY_TAC_GIA"', 'TRUNCATE'),
  false, 'anon holds no SELECT/INSERT/UPDATE/DELETE/TRUNCATE privilege on QUY_TAC_GIA'
);
SELECT is(
  has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'SELECT')
  OR has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'INSERT')
  OR has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'UPDATE')
  OR has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'DELETE')
  OR has_table_privilege('anon', 'public."DE_XUAT_GIA"', 'TRUNCATE'),
  false, 'anon holds no SELECT/INSERT/UPDATE/DELETE/TRUNCATE privilege on DE_XUAT_GIA'
);
SELECT is(
  has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'SELECT')
  OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'INSERT')
  OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'UPDATE')
  OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'DELETE')
  OR has_table_privilege('anon', 'public."NHAT_KY_GIA"', 'TRUNCATE'),
  false, 'anon holds no SELECT/INSERT/UPDATE/DELETE/TRUNCATE privilege on NHAT_KY_GIA'
);

-- 143-145. has_table_privilege is false for authenticated across INSERT/UPDATE/DELETE/TRUNCATE
SELECT is(
  has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'INSERT')
  OR has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'UPDATE')
  OR has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'DELETE')
  OR has_table_privilege('authenticated', 'public."QUY_TAC_GIA"', 'TRUNCATE'),
  false, 'authenticated holds no INSERT/UPDATE/DELETE/TRUNCATE privilege on QUY_TAC_GIA'
);
SELECT is(
  has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'INSERT')
  OR has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'UPDATE')
  OR has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'DELETE')
  OR has_table_privilege('authenticated', 'public."DE_XUAT_GIA"', 'TRUNCATE'),
  false, 'authenticated holds no INSERT/UPDATE/DELETE/TRUNCATE privilege on DE_XUAT_GIA'
);
SELECT is(
  has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'INSERT')
  OR has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'UPDATE')
  OR has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'DELETE')
  OR has_table_privilege('authenticated', 'public."NHAT_KY_GIA"', 'TRUNCATE'),
  false, 'authenticated holds no INSERT/UPDATE/DELETE/TRUNCATE privilege on NHAT_KY_GIA'
);

-- ============================================================================
-- NHAT_KY_GIA IMMUTABILITY TRIGGER under privileged roles (146-154)
-- service_role and postgres hold table write privileges, so matching the exact
-- trigger message proves the trigger (not missing privileges) blocks UPDATE/DELETE.
-- ============================================================================
-- 146. Precondition: service_role actually holds UPDATE/DELETE table privileges
SELECT is(
  has_table_privilege('service_role', 'public."NHAT_KY_GIA"', 'UPDATE')
  AND has_table_privilege('service_role', 'public."NHAT_KY_GIA"', 'DELETE'),
  true, 'precondition: service_role holds UPDATE and DELETE privileges on NHAT_KY_GIA'
);

-- 147-150. service_role UPDATE and DELETE fail with trigger message and leave row 995101 intact
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claim.role" = 'service_role';

SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_GIA" SET "LyDoThayDoi" = 'tamper service_role', "GiaMoi" = 999999 WHERE "NhatKyGiaID" = 995101 $$,
  '42501',
  'NHAT_KY_GIA la nhat ky bat bien: khong cho phep UPDATE',
  'service_role UPDATE on NHAT_KY_GIA is blocked by immutability trigger'
);
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA"
   WHERE "NhatKyGiaID" = 995101 AND "LyDoThayDoi" = 'T5 khoi tao A' AND "GiaMoi" = 200000.00),
  1, 'NHAT_KY_GIA 995101 stays unchanged after service_role UPDATE attempt'
);
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_GIA" WHERE "NhatKyGiaID" = 995101 $$,
  '42501',
  'NHAT_KY_GIA la nhat ky bat bien: khong cho phep DELETE',
  'service_role DELETE on NHAT_KY_GIA is blocked by immutability trigger'
);
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA"
   WHERE "NhatKyGiaID" = 995101 AND "LyDoThayDoi" = 'T5 khoi tao A' AND "GiaMoi" = 200000.00),
  1, 'NHAT_KY_GIA 995101 stays unchanged after service_role DELETE attempt'
);
RESET ROLE;
SET LOCAL "request.jwt.claim.sub" = '';
SET LOCAL "request.jwt.claim.role" = '';

-- 151-154. postgres (table owner) UPDATE and DELETE fail with trigger message and leave row 995101 intact
SELECT throws_ok(
  $$ UPDATE public."NHAT_KY_GIA" SET "LyDoThayDoi" = 'tamper postgres', "GiaMoi" = 888888 WHERE "NhatKyGiaID" = 995101 $$,
  '42501',
  'NHAT_KY_GIA la nhat ky bat bien: khong cho phep UPDATE',
  'postgres UPDATE on NHAT_KY_GIA is blocked by immutability trigger'
);
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA"
   WHERE "NhatKyGiaID" = 995101 AND "LyDoThayDoi" = 'T5 khoi tao A' AND "GiaMoi" = 200000.00),
  1, 'NHAT_KY_GIA 995101 stays unchanged after postgres UPDATE attempt'
);
SELECT throws_ok(
  $$ DELETE FROM public."NHAT_KY_GIA" WHERE "NhatKyGiaID" = 995101 $$,
  '42501',
  'NHAT_KY_GIA la nhat ky bat bien: khong cho phep DELETE',
  'postgres DELETE on NHAT_KY_GIA is blocked by immutability trigger'
);
SELECT is(
  (SELECT count(*)::int FROM public."NHAT_KY_GIA"
   WHERE "NhatKyGiaID" = 995101 AND "LyDoThayDoi" = 'T5 khoi tao A' AND "GiaMoi" = 200000.00),
  1, 'NHAT_KY_GIA 995101 stays unchanged after postgres DELETE attempt'
);

SELECT * FROM finish();
ROLLBACK;
