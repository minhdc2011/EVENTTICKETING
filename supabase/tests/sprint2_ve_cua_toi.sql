-- pgTAP: ve_cua_toi() (trang "Tai khoan cua toi" hien cac ve da mua).
-- Migration duoc kiem: 20261124150000_ve_cua_toi.sql
-- Fixture: ID 997xxx, UUID 77771111-..., slug t5-*; tat ca bi ROLLBACK.
BEGIN;

SELECT plan(10);

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('77771111-7777-4777-8777-000000000001', 'authenticated', 'authenticated', 't5-org@example.com'),
  ('77771111-7777-4777-8777-000000000011', 'authenticated', 'authenticated', 't5-buyer1@example.com'),
  ('77771111-7777-4777-8777-000000000012', 'authenticated', 'authenticated', 't5-buyer2@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan") VALUES
  ('77771111-7777-4777-8777-000000000001', 'T5 Org Owner', 'ORGANIZER'),
  ('77771111-7777-4777-8777-000000000011', 'T5 Buyer 1', 'USER'),
  ('77771111-7777-4777-8777-000000000012', 'T5 Buyer 2', 'USER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES ('77771111-0000-4777-8777-0000000000a1', 'T5 Test Org', 't5-test-org') ON CONFLICT ("ToChucID") DO NOTHING;
INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES ('77771111-0000-4777-8777-0000000000a1', '77771111-7777-4777-8777-000000000001', 'CHU_SO_HUU') ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong", "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES
  (997201, 'T5 Ve Event', 't5-ve-event', '77771111-0000-4777-8777-0000000000a1',
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '12 days', NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days',
   'Ha Noi', 'San T5', 'DANG_MO_BAN', 'BAN_NHAP');

SET LOCAL "request.jwt.claim.sub" = '77771111-7777-4777-8777-000000000001';
SET LOCAL "request.jwt.claims" = '{"sub":"77771111-7777-4777-8777-000000000001","role":"authenticated"}';
INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "SoVeToiDaMoiDon", "YeuCauXacMinhOTP") VALUES (997201, 4, FALSE);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  (997201, 997201, 't5-s1', 'T5 Show', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN');

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (997201, 997201, 997201, 'T5_SEAT',  'T5 Seated',   'GHE_NGOI',   500000.00, '#111111', 20),
  (997202, 997201, 997201, 'T5_STAND', 'T5 Standing', 'DUNG_STAND', 300000.00, '#222222', 10);

INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 9972000 + g, 997201, 'G', lpad(g::text, 2, '0'), 'T5S-G-' || lpad(g::text, 2, '0'), 'TRONG' FROM generate_series(1, 6) g;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','77771111-7777-4777-8777-000000000001',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"77771111-7777-4777-8777-000000000001"}',true);
SELECT public.cong_bo_su_kien(997201);
RESET ROLE;

CREATE TEMP TABLE t5_res (step TEXT PRIMARY KEY, res JSONB NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON t5_res TO authenticated;
GRANT SELECT ON t5_res TO anon;

-- Nguoi mua 1: giu ghe G-02 roi xac nhan; giu 2 ve dung roi xac nhan; sau do giu them ghe G-03 nhung CHUA xac nhan.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','77771111-7777-4777-8777-000000000011',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"77771111-7777-4777-8777-000000000011"}',true);
INSERT INTO t5_res SELECT 'h1', public.tao_giu_cho_theo_suat(997201, '55555555-0000-0000-0000-000000000001'::uuid, '[{"ticketCode":"T5S-G-02","zoneCode":"T5_SEAT"}]'::jsonb);
INSERT INTO t5_res SELECT 'x1', public.xac_nhan_thanh_toan((SELECT (res->>'holdId')::uuid FROM t5_res WHERE step='h1'), '55555555-0000-0000-0000-000000000001'::uuid);
INSERT INTO t5_res SELECT 'h2', public.tao_giu_cho_theo_suat(997201, '55555555-0000-0000-0000-000000000001'::uuid, '[{"zoneCode":"T5_STAND","quantity":2}]'::jsonb);
INSERT INTO t5_res SELECT 'x2', public.xac_nhan_thanh_toan((SELECT (res->>'holdId')::uuid FROM t5_res WHERE step='h2'), '55555555-0000-0000-0000-000000000001'::uuid);
INSERT INTO t5_res SELECT 'h3', public.tao_giu_cho_theo_suat(997201, '55555555-0000-0000-0000-000000000001'::uuid, '[{"ticketCode":"T5S-G-03","zoneCode":"T5_SEAT"}]'::jsonb);
INSERT INTO t5_res SELECT 've1', public.ve_cua_toi();
RESET ROLE;

-- [1]
SELECT is(jsonb_array_length((SELECT res FROM t5_res WHERE step='ve1')), 2,
  'Chi hien ve da thanh toan: 2 dong (ghe G-02 va ve dung), giu cho chua xac nhan khong hien');

-- [2]
SELECT is((SELECT v->>'tenSuKien' FROM t5_res, jsonb_array_elements(res) v WHERE step='ve1' AND v->>'maKhuVuc'='T5_SEAT'), 'T5 Ve Event',
  'Ve co ten su kien');

-- [3]
SELECT is((SELECT ROW(v->>'soHang', v->>'soGhe', v->>'tenKhuVuc')::text FROM t5_res, jsonb_array_elements(res) v WHERE step='ve1' AND v->>'maKhuVuc'='T5_SEAT'),
  ROW('G', '02', 'T5 Seated')::text, 'Ve ghe co hang, ghe, ten khu dung');

-- [4]
SELECT is((SELECT (v->>'donGia')::numeric FROM t5_res, jsonb_array_elements(res) v WHERE step='ve1' AND v->>'maKhuVuc'='T5_SEAT'), 500000.00,
  'Don gia lay tu gia da chot (hoac gia niem yet)');

-- [5]
SELECT is((SELECT ROW(v->>'soLuong', v->>'soHang' IS NULL, v->>'soGhe' IS NULL)::text FROM t5_res, jsonb_array_elements(res) v WHERE step='ve1' AND v->>'maKhuVuc'='T5_STAND'),
  ROW('2', TRUE, TRUE)::text, 'Ve khu dung co so luong 2, khong co hang/ghe');

-- [6] chi ghe da thanh toan chuyen sang da ban; ve chua xac nhan khong duoc tinh
SELECT is((SELECT v->>'tenSuat' FROM t5_res, jsonb_array_elements(res) v WHERE step='ve1' AND v->>'maKhuVuc'='T5_SEAT'), 'T5 Show',
  'Ve co ten suat dien');

-- Nguoi mua 2 khong thay ve cua nguoi mua 1.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','77771111-7777-4777-8777-000000000012',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"77771111-7777-4777-8777-000000000012"}',true);
INSERT INTO t5_res SELECT 've2', public.ve_cua_toi();
RESET ROLE;

-- [7]
SELECT is((SELECT res FROM t5_res WHERE step='ve2'), '[]'::jsonb, 'Nguoi mua khac khong co ve: danh sach rong, khong thay ve cua nguoi khac');

-- [8]
SELECT is((SELECT count(*)::int FROM public."GIU_CHO" WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t5_res WHERE step='h3') AND "TrangThai" = 'ACTIVE'), 1,
  'Giu cho chua xac nhan van ACTIVE va khong nam trong danh sach ve');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true), set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"anon"}',true);

-- [9]
SELECT throws_ok($$ SELECT public.ve_cua_toi() $$, '42501', NULL, 'anon khong goi duoc ve_cua_toi (42501)');

RESET ROLE;

-- [10]
SELECT ok(NOT has_function_privilege('anon', 'public.ve_cua_toi()', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.ve_cua_toi()', 'EXECUTE'),
  'Quyen: chi authenticated duoc chay ve_cua_toi');

SELECT * FROM finish();
ROLLBACK;
