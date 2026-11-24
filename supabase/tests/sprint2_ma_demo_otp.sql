-- pgTAP: ma demo thay the OTP, CHI cho tai khoan @demo.vn (Sprint 2).
-- Migration duoc kiem: 20261124100000_sprint2_ma_demo_bo_qua_otp.sql (xac_nhan_thanh_toan co tham so p_ma_demo).
-- Ma dung trong test chi la gia tri thu rieng cua test; ma that khong nam trong repo.
-- Fixture: ID 999xxx, UUID 99995555-..., ROLLBACK cuoi file.
BEGIN;

SELECT plan(14);

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('99995555-8888-4888-8888-000000000001', 'authenticated', 'authenticated', 't5-org@example.com'),
  ('99995555-8888-4888-8888-000000000011', 'authenticated', 'authenticated', 't5-nguoi-demo@demo.vn'),
  ('99995555-8888-4888-8888-000000000012', 'authenticated', 'authenticated', 't5-nguoi-that@example.com'),
  ('99995555-8888-4888-8888-000000000013', 'authenticated', 'authenticated', 'T5-VIET-HOA@DEMO.VN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan") VALUES
  ('99995555-8888-4888-8888-000000000001', 'T5 Org Owner', 'ORGANIZER'),
  ('99995555-8888-4888-8888-000000000011', 'T5 Demo Buyer', 'USER'),
  ('99995555-8888-4888-8888-000000000012', 'T5 Real Buyer', 'USER'),
  ('99995555-8888-4888-8888-000000000013', 'T5 Demo Upper', 'USER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES ('99995555-0000-4888-8888-0000000000a1', 'T5 Test Org', 't5-test-org') ON CONFLICT ("ToChucID") DO NOTHING;
INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES ('99995555-0000-4888-8888-0000000000a1', '99995555-8888-4888-8888-000000000001', 'CHU_SO_HUU') ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong", "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES
  (999101, 'T5 OTP Event', 't5-otp-event', '99995555-0000-4888-8888-0000000000a1',
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '12 days', NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days',
   'Ha Noi', 'San T5', 'DANG_MO_BAN', 'BAN_NHAP');

SET LOCAL "request.jwt.claim.sub" = '99995555-8888-4888-8888-000000000001';
SET LOCAL "request.jwt.claims" = '{"sub":"99995555-8888-4888-8888-000000000001","role":"authenticated"}';
INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "SoVeToiDaMoiDon", "YeuCauXacMinhOTP") VALUES (999101, 4, TRUE);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  (999101, 999101, 't5-otp-s1', 'T5 Show', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN');

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES (999101, 999101, 999101, 'T5_SEAT', 'T5 Seated', 'GHE_NGOI', 500000.00, '#111111', 20);

INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 9991000 + g, 999101, 'A', lpad(g::text, 2, '0'), 'T5-A-' || lpad(g::text, 2, '0'), 'TRONG' FROM generate_series(1, 8) g;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000001',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"99995555-8888-4888-8888-000000000001"}',true);
SELECT public.cong_bo_su_kien(999101);
RESET ROLE;

CREATE TEMP TABLE t5_res (step TEXT PRIMARY KEY, res JSONB NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON t5_res TO authenticated;
GRANT SELECT ON t5_res TO anon;

-- Giu cho (khong can OTP) cho 4 nguoi/lan thu.
-- demo1: nguoi-demo, ghe 1 | that1: nguoi-that, ghe 2 | demo2: nguoi-demo, ghe 3 | demo3: nguoi-demo, ghe 4 | hoa: viet-hoa, ghe 5 | demo4: nguoi-demo, ghe 6
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"99995555-8888-4888-8888-000000000011"}',true);
INSERT INTO t5_res SELECT 'demo1', public.tao_giu_cho_theo_suat(999101, '55555555-0000-0000-0000-000000000001'::uuid, '[{"ticketCode":"T5-A-01","zoneCode":"T5_SEAT"}]'::jsonb);
INSERT INTO t5_res SELECT 'demo2', public.tao_giu_cho_theo_suat(999101, '55555555-0000-0000-0000-000000000003'::uuid, '[{"ticketCode":"T5-A-03","zoneCode":"T5_SEAT"}]'::jsonb);
INSERT INTO t5_res SELECT 'demo3', public.tao_giu_cho_theo_suat(999101, '55555555-0000-0000-0000-000000000004'::uuid, '[{"ticketCode":"T5-A-04","zoneCode":"T5_SEAT"}]'::jsonb);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000012',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"99995555-8888-4888-8888-000000000012"}',true);
INSERT INTO t5_res SELECT 'that1', public.tao_giu_cho_theo_suat(999101, '55555555-0000-0000-0000-000000000002'::uuid, '[{"ticketCode":"T5-A-02","zoneCode":"T5_SEAT"}]'::jsonb);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000013',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"99995555-8888-4888-8888-000000000013"}',true);
INSERT INTO t5_res SELECT 'hoa', public.tao_giu_cho_theo_suat(999101, '55555555-0000-0000-0000-000000000005'::uuid, '[{"ticketCode":"T5-A-05","zoneCode":"T5_SEAT"}]'::jsonb);
RESET ROLE;

-- ============================================================================
-- [1] Chua co cau hinh ma demo: tinh nang tat, ma bat ky deu bi tu choi (tai khoan demo)
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"99995555-8888-4888-8888-000000000011"}',true);
-- [1]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '55555555-0000-0000-0000-000000000001'::uuid, 'ma-thu-t5-xyz') $$,
         (SELECT res->>'holdId' FROM t5_res WHERE step='demo1')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Chua co dong cau hinh ma demo: tai khoan demo nhap ma van bi tu choi');
RESET ROLE;

-- Dat ma thu (nguoi quan tri lam bang SQL tren dashboard; o day dung ma rieng cua test).
INSERT INTO public."CAU_HINH_DEMO" ("Khoa", "GiaTri")
VALUES ('MA_DEMO_BO_QUA_OTP', encode(sha256(convert_to('ma-thu-t5-xyz', 'UTF8')), 'hex'));

-- [2] Sai ma
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"99995555-8888-4888-8888-000000000011"}',true);
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '55555555-0000-0000-0000-000000000001'::uuid, 'ma-sai-123') $$,
         (SELECT res->>'holdId' FROM t5_res WHERE step='demo1')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Tai khoan demo nhap sai ma bi tu choi (cung loi voi thieu OTP)');
-- [3] Ma qua ngan, thieu ma
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '55555555-0000-0000-0000-000000000001'::uuid, 'ab') $$,
         (SELECT res->>'holdId' FROM t5_res WHERE step='demo1')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Ma demo qua ngan bi tu choi');
-- [4]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '55555555-0000-0000-0000-000000000001'::uuid) $$,
         (SELECT res->>'holdId' FROM t5_res WHERE step='demo1')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Khong co ma demo cung khong co OTP: bi tu choi');
RESET ROLE;

-- [5] Nguoi dung THAT nhap dung ma van bi tu choi
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000012',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"99995555-8888-4888-8888-000000000012"}',true);
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '55555555-0000-0000-0000-000000000002'::uuid, 'ma-thu-t5-xyz') $$,
         (SELECT res->>'holdId' FROM t5_res WHERE step='that1')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Tai khoan khong phai @demo.vn nhap dung ma demo van bi tu choi');
RESET ROLE;

-- [6] Tai khoan demo nhap dung ma, KHONG co OTP: xac nhan thanh cong
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"99995555-8888-4888-8888-000000000011"}',true);
INSERT INTO t5_res SELECT 'demo1_ok', public.xac_nhan_thanh_toan(
  (SELECT (res->>'holdId')::uuid FROM t5_res WHERE step='demo1'), '55555555-0000-0000-0000-000000000001'::uuid, 'ma-thu-t5-xyz');
RESET ROLE;
SELECT is((SELECT res->>'status' FROM t5_res WHERE step='demo1_ok'), 'CONVERTED',
  'Tai khoan @demo.vn nhap dung ma demo: xac nhan thanh toan thanh cong khong can OTP');

-- [7] Trang thai sau xac nhan
SELECT is((SELECT ROW(gc."TrangThai"::text, g."TrangThai"::text)
  FROM public."GIU_CHO" gc JOIN public."CHI_TIET_GIU_CHO" ct ON ct."GiuChoID"=gc."GiuChoID" JOIN public."GHE" g ON g."GheID"=ct."GheID"
  WHERE gc."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t5_res WHERE step='demo1')),
  ROW('CONVERTED'::text, 'DA_BAN'::text),
  'Sau khi dung ma demo: giu cho CONVERTED, ghe DA_BAN');

-- [8] Email viet hoa (T5-VIET-HOA@DEMO.VN) van duoc coi la tai khoan demo
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000013',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"99995555-8888-4888-8888-000000000013"}',true);
INSERT INTO t5_res SELECT 'hoa_ok', public.xac_nhan_thanh_toan(
  (SELECT (res->>'holdId')::uuid FROM t5_res WHERE step='hoa'), '55555555-0000-0000-0000-000000000005'::uuid, 'ma-thu-t5-xyz');
RESET ROLE;
SELECT is((SELECT res->>'status' FROM t5_res WHERE step='hoa_ok'), 'CONVERTED',
  'Email @DEMO.VN viet hoa van la tai khoan demo');

-- [9] Van dung OTP that cho tai khoan demo (khong dung ma): thanh cong
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims', json_build_object('role','authenticated','sub','99995555-8888-4888-8888-000000000011',
         'amr', json_build_array(json_build_object('method','otp','timestamp',floor(extract(epoch FROM now()))::bigint)))::text, true);
INSERT INTO t5_res SELECT 'demo2_otp', public.xac_nhan_thanh_toan(
  (SELECT (res->>'holdId')::uuid FROM t5_res WHERE step='demo2'), '55555555-0000-0000-0000-000000000003'::uuid);
RESET ROLE;
SELECT is((SELECT res->>'status' FROM t5_res WHERE step='demo2_otp'), 'CONVERTED',
  'Tai khoan demo van xac nhan duoc bang OTP that (loi goi hai tham so)');

-- [10] Xoa dong cau hinh: ma ngung hieu luc
DELETE FROM public."CAU_HINH_DEMO" WHERE "Khoa" = 'MA_DEMO_BO_QUA_OTP';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','99995555-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"99995555-8888-4888-8888-000000000011"}',true);
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '55555555-0000-0000-0000-000000000004'::uuid, 'ma-thu-t5-xyz') $$,
         (SELECT res->>'holdId' FROM t5_res WHERE step='demo3')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Xoa dong cau hinh: ma demo ngung hieu luc ngay');

-- [11] authenticated khong doc duoc bang cau hinh demo
SELECT throws_ok($$ SELECT * FROM public."CAU_HINH_DEMO" $$, '42501', NULL,
  'authenticated khong doc duoc CAU_HINH_DEMO');
RESET ROLE;

-- [12] anon khong doc duoc bang va khong goi duoc ham
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true), set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT throws_ok($$ SELECT * FROM public."CAU_HINH_DEMO" $$, '42501', NULL, 'anon khong doc duoc CAU_HINH_DEMO');
RESET ROLE;

-- [13] ACL cua ham ba tham so
SELECT is((SELECT ROW(
     has_function_privilege('authenticated', 'public.xac_nhan_thanh_toan(uuid, uuid, text)', 'EXECUTE'),
     has_function_privilege('anon', 'public.xac_nhan_thanh_toan(uuid, uuid, text)', 'EXECUTE'))),
  ROW(TRUE, FALSE),
  'xac_nhan_thanh_toan(uuid, uuid, text): authenticated duoc goi, anon bi thu hoi');

-- [14] Ma nguon ham khong chua ma demo cung (chi so sanh ban bam voi gia tri trong bang)
SELECT is(position('ma-thu-t5-xyz' IN pg_get_functiondef('public.xac_nhan_thanh_toan(uuid,uuid,text)'::regprocedure)), 0,
  'Dinh nghia ham khong chua ma demo cung');

SELECT * FROM finish();
ROLLBACK;
