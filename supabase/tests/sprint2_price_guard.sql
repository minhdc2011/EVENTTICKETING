-- pgTAP: khoa doi gia truc tiep KHU_VUC.GiaVeNiemYet (migration 20261123090000_sprint2_pt409_va_khoa_gia_truc_tiep.sql)
-- va ma loi PT409 cua RPC duyet/tu choi.
--
-- Quy tac: nguoi dung client (authenticated, anon) khong doi duoc GiaVeNiemYet khi khu co QUY_TAC_GIA dang kich hoat;
-- chi RPC duyet (SECURITY DEFINER) doi duoc. Khu khong co quy tac, hoac quy tac da tat, van sua tay nhu Sprint 1.
-- service_role khong bi chan. Moi fixture tao trong BEGIN ... ROLLBACK.
--
-- Fixture: nguoi dung 8888..., to chuc 88888888-0000-..., su kien 997001, suat 997001, khu 997001..997004.
--   997001: co quy tac dang kich hoat (khoa gia)       997002: khong co quy tac
--   997003: quy tac da tat                             997004: co quy tac dang kich hoat + de xuat PENDING 997104

BEGIN;

SELECT plan(14);

INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('88888888-8888-8888-8888-888888888801', 'authenticated', 'authenticated', 't5pg-owner@example.com'),
  ('88888888-8888-8888-8888-888888888802', 'authenticated', 'authenticated', 't5pg-editor@example.com'),
  ('88888888-8888-8888-8888-888888888803', 'authenticated', 'authenticated', 't5pg-audience@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('88888888-8888-8888-8888-888888888801', 'T5 Owner', 'ORGANIZER'),
  ('88888888-8888-8888-8888-888888888802', 'T5 Editor', 'ORGANIZER'),
  ('88888888-8888-8888-8888-888888888803', 'T5 Audience', 'USER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES ('88888888-0000-0000-0000-0000000000a1', 'T5 PG Org', 't5pg-org')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('88888888-0000-0000-0000-0000000000a1', '88888888-8888-8888-8888-888888888801', 'CHU_SO_HUU'),
  ('88888888-0000-0000-0000-0000000000a1', '88888888-8888-8888-8888-888888888802', 'BIEN_TAP')
ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  997001, 'T5 PG Event', 't5pg-event', '88888888-0000-0000-0000-0000000000a1',
  NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
  NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'Ha Noi', 'San T5',
  'DANG_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES (
  997001, 997001, 't5pg-suat', 'T5 Suat',
  NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
  NOW() - INTERVAL '1 day', NOW() + INTERVAL '9 days', 'DANG_MO_BAN'
);

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
)
SELECT 997000 + g, 997001, 997001, 'T5PG_Z' || g, 'Khu ' || g, 'DUNG_STAND', 200000, '#123456', 100
  FROM generate_series(1, 4) AS g;

INSERT INTO public."QUY_TAC_GIA" ("QuyTacGiaID", "KhuVucID", "GiaGoc", "GiaSan", "GiaTran", "TrangThaiKichHoat")
VALUES
  (997101, 997001, 200000, 150000, 300000, TRUE),
  (997103, 997003, 200000, 150000, 300000, FALSE),
  (997104, 997004, 200000, 150000, 300000, TRUE);

INSERT INTO public."DE_XUAT_GIA" (
  "DeXuatID", "QuyTacGiaID", "KhuVucID", "TyLeLapDay", "TocDoBanThucTe", "TocDoBanKyVong",
  "SoGioConLai", "GiaHienTai", "GiaTinhToanTho", "GiaDeXuat", "TrangThaiDuyet", "LyDoDeXuat", "ThoiGianDeXuat"
) VALUES (
  997104, 997104, 997004, 0.5, 5, 4, 48, 200000, 230000, 230000, 'PENDING', 'AI tang gia', now()
);

-- ---------------------------------------------------------------------------
-- 1. Chu so huu va bien tap KHONG doi truc tiep duoc gia khu co quy tac dang kich hoat
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '88888888-8888-8888-8888-888888888801';
SELECT throws_ok(
  $$ UPDATE public."KHU_VUC" SET "GiaVeNiemYet" = 123000 WHERE "KhuVucID" = 997001 $$,
  '42501', 'GIA_DUOC_QUAN_LY_BOI_DINH_GIA',
  'G01 CHU_SO_HUU khong doi truc tiep duoc gia khu co quy tac dang kich hoat');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '88888888-8888-8888-8888-888888888802';
SELECT throws_ok(
  $$ UPDATE public."KHU_VUC" SET "GiaVeNiemYet" = 123000 WHERE "KhuVucID" = 997001 $$,
  '42501', 'GIA_DUOC_QUAN_LY_BOI_DINH_GIA',
  'G02 BIEN_TAP khong doi truc tiep duoc gia khu co quy tac dang kich hoat');
RESET ROLE;

SELECT is(
  (SELECT "GiaVeNiemYet"::numeric FROM public."KHU_VUC" WHERE "KhuVucID" = 997001),
  200000::numeric, 'G03 gia khu 997001 khong doi sau hai lan bi chan');

-- ---------------------------------------------------------------------------
-- 2. Cac thao tac khong doi gia van duoc phep tren khu co quy tac
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '88888888-8888-8888-8888-888888888801';
SELECT lives_ok(
  $$ UPDATE public."KHU_VUC" SET "GiaVeNiemYet" = 200000 WHERE "KhuVucID" = 997001 $$,
  'G04 dat lai dung gia hien tai (khong doi) khong bi chan');
SELECT lives_ok(
  $$ UPDATE public."KHU_VUC" SET "TenKhuVuc" = 'Khu doi ten' WHERE "KhuVucID" = 997001 $$,
  'G05 doi cot khac (ten khu) khong bi chan');
RESET ROLE;

SELECT is(
  (SELECT "TenKhuVuc"::text FROM public."KHU_VUC" WHERE "KhuVucID" = 997001),
  'Khu doi ten', 'G06 ten khu da doi');

-- ---------------------------------------------------------------------------
-- 3. Khu khong co quy tac, hoac quy tac da tat: sua tay nhu Sprint 1
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '88888888-8888-8888-8888-888888888801';
SELECT lives_ok(
  $$ UPDATE public."KHU_VUC" SET "GiaVeNiemYet" = 210000 WHERE "KhuVucID" = 997002 $$,
  'G07 khu khong co quy tac: doi gia truc tiep duoc');
SELECT lives_ok(
  $$ UPDATE public."KHU_VUC" SET "GiaVeNiemYet" = 220000 WHERE "KhuVucID" = 997003 $$,
  'G08 khu co quy tac da tat: doi gia truc tiep duoc');
RESET ROLE;

SELECT is(
  (SELECT ARRAY(SELECT "GiaVeNiemYet"::numeric FROM public."KHU_VUC" WHERE "KhuVucID" IN (997002, 997003) ORDER BY "KhuVucID")),
  ARRAY[210000::numeric, 220000::numeric], 'G09 gia hai khu khong bi khoa da doi dung');

-- ---------------------------------------------------------------------------
-- 4. RPC duyet van doi gia duoc (SECURITY DEFINER chay voi vai tro chu so huu ham)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t5_res (step TEXT PRIMARY KEY, res JSONB NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON t5_res TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '88888888-8888-8888-8888-888888888801';
INSERT INTO t5_res SELECT 'duyet', public.duyet_de_xuat_gia(997104, NULL);
RESET ROLE;

SELECT is(
  (SELECT "GiaVeNiemYet"::numeric FROM public."KHU_VUC" WHERE "KhuVucID" = 997004),
  230000::numeric, 'G10 RPC duyet doi gia khu co quy tac dang kich hoat (230000)');

-- ---------------------------------------------------------------------------
-- 5. service_role khong bi chan; ham trigger khong goi truc tiep duoc
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT lives_ok(
  $$ UPDATE public."KHU_VUC" SET "GiaVeNiemYet" = 240000 WHERE "KhuVucID" = 997001 $$,
  'G11 service_role doi truc tiep duoc (khong thuoc nguoi dung client)');
RESET ROLE;

SELECT is(
  (SELECT "GiaVeNiemYet"::numeric FROM public."KHU_VUC" WHERE "KhuVucID" = 997001),
  240000::numeric, 'G12 gia khu 997001 da doi boi service_role');

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.kiem_soat_doi_gia_truc_tiep()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.kiem_soat_doi_gia_truc_tiep()', 'EXECUTE'),
  'G13 ham trigger khong cho authenticated/anon goi truc tiep');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_kiem_soat_doi_gia_truc_tiep'
       AND tgrelid = 'public."KHU_VUC"'::regclass
       AND NOT tgisinternal
  ),
  'G14 trigger trg_kiem_soat_doi_gia_truc_tiep ton tai tren KHU_VUC');

SELECT * FROM finish();
ROLLBACK;
