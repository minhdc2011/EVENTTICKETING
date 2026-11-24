-- pgTAP: luong moi cua Sprint 2 (24/11/2026): giu cho truoc, OTP xac nhan thanh toan sau.
-- Migration duoc kiem: 20261124090000_sprint2_giu_cho_truoc_otp_xac_nhan_thanh_toan.sql
--   tao_giu_cho_theo_suat (chi can dang nhap), gia_han_giu_cho (mot lan), xac_nhan_thanh_toan (can OTP neu su kien bat OTP).
-- Fixture: ID 998xxx, UUID 88884444-..., slug t4-*; tat ca bi ROLLBACK.
BEGIN;

SELECT plan(26);

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('88884444-8888-4888-8888-000000000001', 'authenticated', 'authenticated', 't4-org@example.com'),
  ('88884444-8888-4888-8888-000000000011', 'authenticated', 'authenticated', 't4-buyer1@example.com'),
  ('88884444-8888-4888-8888-000000000012', 'authenticated', 'authenticated', 't4-buyer2@example.com'),
  ('88884444-8888-4888-8888-000000000013', 'authenticated', 'authenticated', 't4-buyer3@example.com'),
  ('88884444-8888-4888-8888-000000000014', 'authenticated', 'authenticated', 't4-buyer4@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan") VALUES
  ('88884444-8888-4888-8888-000000000001', 'T4 Org Owner', 'ORGANIZER'),
  ('88884444-8888-4888-8888-000000000011', 'T4 Buyer 1', 'USER'),
  ('88884444-8888-4888-8888-000000000012', 'T4 Buyer 2', 'USER'),
  ('88884444-8888-4888-8888-000000000013', 'T4 Buyer 3', 'USER'),
  ('88884444-8888-4888-8888-000000000014', 'T4 Buyer 4', 'USER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES ('88884444-0000-4888-8888-0000000000a1', 'T4 Test Org', 't4-test-org') ON CONFLICT ("ToChucID") DO NOTHING;
INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES ('88884444-0000-4888-8888-0000000000a1', '88884444-8888-4888-8888-000000000001', 'CHU_SO_HUU') ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong", "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES
  (998101, 'T4 OTP Event', 't4-otp-event', '88884444-0000-4888-8888-0000000000a1',
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '12 days', NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days',
   'Ha Noi', 'San T4 1', 'DANG_MO_BAN', 'BAN_NHAP'),
  (998102, 'T4 No OTP Event', 't4-no-otp-event', '88884444-0000-4888-8888-0000000000a1',
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '12 days', NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days',
   'Ha Noi', 'San T4 2', 'DANG_MO_BAN', 'BAN_NHAP');

SET LOCAL "request.jwt.claim.sub" = '88884444-8888-4888-8888-000000000001';
SET LOCAL "request.jwt.claims" = '{"sub":"88884444-8888-4888-8888-000000000001","role":"authenticated"}';
INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "SoVeToiDaMoiDon", "YeuCauXacMinhOTP")
VALUES (998101, 4, TRUE), (998102, 4, FALSE);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  (998101, 998101, 't4-otp-s1', 'T4 OTP Show', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN'),
  (998201, 998102, 't4-no-otp-s1', 'T4 No OTP Show', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN');

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (998101, 998101, 998101, 'T4_SEAT',  'T4 Seated',   'GHE_NGOI',   500000.00, '#111111', 20),
  (998102, 998101, 998101, 'T4_STAND', 'T4 Standing', 'DUNG_STAND', 300000.00, '#222222', 3),
  (998201, 998102, 998201, 'T4_NOOTP_SEAT', 'T4 NoOTP Seated', 'GHE_NGOI', 400000.00, '#555555', 10);

INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 9981000 + g, 998101, 'A', lpad(g::text, 2, '0'), 'T4S-A-' || lpad(g::text, 2, '0'), 'TRONG' FROM generate_series(1, 12) g
UNION ALL
SELECT 9982000 + g, 998201, 'A', lpad(g::text, 2, '0'), 'T4N-A-' || lpad(g::text, 2, '0'), 'TRONG' FROM generate_series(1, 5) g;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000001',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"88884444-8888-4888-8888-000000000001"}',true);
SELECT public.cong_bo_su_kien(998101);
SELECT public.cong_bo_su_kien(998102);
RESET ROLE;

CREATE TEMP TABLE t4_res (step TEXT PRIMARY KEY, res JSONB NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON t4_res TO authenticated;
GRANT SELECT ON t4_res TO anon;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"88884444-8888-4888-8888-000000000011"}',true);
INSERT INTO t4_res SELECT 'a1', public.tao_giu_cho_theo_suat(998101, '44444444-0000-0000-0000-000000000001'::uuid, '[{"ticketCode":"T4S-A-01","zoneCode":"T4_SEAT"}]'::jsonb);
RESET ROLE;

-- [1]
SELECT is((SELECT res->>'status' FROM t4_res WHERE step='a1'), 'ACTIVE',
  'Su kien bat OTP: giu cho thanh cong khi da dang nhap, chua can OTP');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"88884444-8888-4888-8888-000000000011"}',true);

-- [2]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '44444444-0000-0000-0000-000000000001'::uuid) $$, (SELECT res->>'holdId' FROM t4_res WHERE step='a1')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Xac nhan thanh toan khi chua xac minh OTP bi tu choi (42501)');

RESET ROLE;

-- [3]
SELECT is((SELECT ROW(gc."TrangThai"::text, g."TrangThai"::text)
  FROM public."GIU_CHO" gc JOIN public."CHI_TIET_GIU_CHO" ct ON ct."GiuChoID"=gc."GiuChoID" JOIN public."GHE" g ON g."GheID"=ct."GheID"
  WHERE gc."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='a1')), ROW('ACTIVE'::text, 'DANG_GIU'::text),
  'Xac nhan that bai khong doi trang thai: giu cho ACTIVE, ghe DANG_GIU');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000012',true),
       set_config('request.jwt.claims',json_build_object('role','authenticated','sub','88884444-8888-4888-8888-000000000012','amr',json_build_array(json_build_object('method','otp','timestamp',floor(extract(epoch FROM now()))::bigint)))::text,true);

-- [4]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '44444444-0000-0000-0000-000000000001'::uuid) $$, (SELECT res->>'holdId' FROM t4_res WHERE step='a1')),
  'P0002', 'Khong tim thay giu cho',
  'Nguoi khac (du co OTP) khong xac nhan duoc giu cho cua nguoi mua 1');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims',json_build_object('role','authenticated','sub','88884444-8888-4888-8888-000000000011','amr',json_build_array(json_build_object('method','otp','timestamp',floor(extract(epoch FROM now()))::bigint)))::text,true);

-- [5]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '44444444-0000-0000-0000-000000000099'::uuid) $$, (SELECT res->>'holdId' FROM t4_res WHERE step='a1')),
  'P0002', 'Khong tim thay giu cho',
  'Sai ma phien trinh duyet thi khong xac nhan duoc');

RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true), set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"anon"}',true);

-- [6]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '44444444-0000-0000-0000-000000000001'::uuid) $$, (SELECT res->>'holdId' FROM t4_res WHERE step='a1')),
  '42501', NULL,
  'anon khong goi duoc xac_nhan_thanh_toan (42501)');

RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true), set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"anon"}',true);

-- [7]
SELECT throws_ok(
  format($$ SELECT public.gia_han_giu_cho(%L::uuid, '44444444-0000-0000-0000-000000000001'::uuid) $$, (SELECT res->>'holdId' FROM t4_res WHERE step='a1')),
  '42501', NULL,
  'anon khong goi duoc gia_han_giu_cho (42501)');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims',json_build_object('role','authenticated','sub','88884444-8888-4888-8888-000000000011','amr',json_build_array(json_build_object('method','otp','timestamp',floor(extract(epoch FROM now()))::bigint)))::text,true);

INSERT INTO t4_res SELECT 'a1_ok', public.xac_nhan_thanh_toan((SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='a1'), '44444444-0000-0000-0000-000000000001'::uuid);

INSERT INTO t4_res SELECT 'a1_lai', public.xac_nhan_thanh_toan((SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='a1'), '44444444-0000-0000-0000-000000000001'::uuid);

RESET ROLE;

-- [8]
SELECT is((SELECT ROW(res->>'status', res->>'soVe') FROM t4_res WHERE step='a1_ok'), ROW('CONVERTED'::text, '1'::text),
  'OTP hop le: xac nhan thanh toan thanh cong, giu cho CONVERTED, 1 ve');

-- [9]
SELECT is((SELECT ROW(gc."TrangThai"::text, g."TrangThai"::text)
  FROM public."GIU_CHO" gc JOIN public."CHI_TIET_GIU_CHO" ct ON ct."GiuChoID"=gc."GiuChoID" JOIN public."GHE" g ON g."GheID"=ct."GheID"
  WHERE gc."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='a1')), ROW('CONVERTED'::text, 'DA_BAN'::text),
  'Sau xac nhan: giu cho CONVERTED va ghe DA_BAN');

-- [10]
SELECT is((SELECT res->>'daXacNhanTruoc' FROM t4_res WHERE step='a1_lai'), 'true',
  'Goi xac nhan lan hai thanh cong (idempotent)');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"88884444-8888-4888-8888-000000000011"}',true);

INSERT INTO t4_res SELECT 'a1_huy', to_jsonb(public.huy_giu_cho((SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='a1'), '44444444-0000-0000-0000-000000000001'::uuid));

RESET ROLE;

-- [11]
SELECT is((SELECT ROW(gc."TrangThai"::text, g."TrangThai"::text)
  FROM public."GIU_CHO" gc JOIN public."CHI_TIET_GIU_CHO" ct ON ct."GiuChoID"=gc."GiuChoID" JOIN public."GHE" g ON g."GheID"=ct."GheID"
  WHERE gc."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='a1')), ROW('CONVERTED'::text, 'DA_BAN'::text),
  'huy_giu_cho khong tra lai ghe da thanh toan');

SELECT public.expire_seat_holds(998101);

-- [12]
SELECT is((SELECT "TrangThai"::text FROM public."GIU_CHO" WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='a1')), 'CONVERTED',
  'expire_seat_holds khong doi giu cho da xac nhan');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000011',true),
       set_config('request.jwt.claims',json_build_object('role','authenticated','sub','88884444-8888-4888-8888-000000000011','amr',json_build_array(json_build_object('method','otp','timestamp',floor(extract(epoch FROM now()))::bigint)))::text,true);

-- [13]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(998101, '44444444-0000-0000-0000-000000000002'::uuid,
     '[{"ticketCode":"T4S-A-02","zoneCode":"T4_SEAT"},{"ticketCode":"T4S-A-03","zoneCode":"T4_SEAT"},{"ticketCode":"T4S-A-04","zoneCode":"T4_SEAT"},{"ticketCode":"T4S-A-05","zoneCode":"T4_SEAT"}]'::jsonb) $$,
  '22023', 'VUOT_GIOI_HAN_VE',
  'Ve da xac nhan thanh toan van tinh vao han muc 4 ve (da mua 1, xin them 4)');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000012',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"88884444-8888-4888-8888-000000000012"}',true);
INSERT INTO t4_res SELECT 'c1', public.tao_giu_cho_theo_suat(998201, '44444444-0000-0000-0000-000000000003'::uuid, '[{"ticketCode":"T4N-A-01","zoneCode":"T4_NOOTP_SEAT"}]'::jsonb);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000012',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"88884444-8888-4888-8888-000000000012"}',true);

INSERT INTO t4_res SELECT 'c1_ok', public.xac_nhan_thanh_toan((SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='c1'), '44444444-0000-0000-0000-000000000003'::uuid);

RESET ROLE;

-- [14]
SELECT is((SELECT res->>'status' FROM t4_res WHERE step='c1_ok'), 'CONVERTED',
  'Su kien tat OTP: xac nhan thanh toan khong can OTP');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000013',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"88884444-8888-4888-8888-000000000013"}',true);
INSERT INTO t4_res SELECT 'd1', public.tao_giu_cho_theo_suat(998101, '44444444-0000-0000-0000-000000000004'::uuid, '[{"ticketCode":"T4S-A-06","zoneCode":"T4_SEAT"}]'::jsonb);
RESET ROLE;

UPDATE public."GIU_CHO" SET "HetHanLuc" = NOW() + INTERVAL '10 seconds' WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='d1');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000013',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"88884444-8888-4888-8888-000000000013"}',true);

INSERT INTO t4_res SELECT 'd1_g1', public.gia_han_giu_cho((SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='d1'), '44444444-0000-0000-0000-000000000004'::uuid);

INSERT INTO t4_res SELECT 'd1_g2', public.gia_han_giu_cho((SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='d1'), '44444444-0000-0000-0000-000000000004'::uuid);

RESET ROLE;

-- [15]
SELECT is((SELECT ROW(res->>'giaHanMoi', res->>'daGiaHan') FROM t4_res WHERE step='d1_g1'), ROW('true'::text, 'true'::text),
  'gia_han_giu_cho lan dau: gia han moi');

-- [16]
SELECT ok((SELECT "HetHanLuc" FROM public."GIU_CHO" WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='d1')) > NOW() + INTERVAL '4 minutes 50 seconds'
  AND (SELECT "DaGiaHan" FROM public."GIU_CHO" WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='d1')),
  'Han giu cho duoc keo den khoang 5 phut ke tu luc gia han va DaGiaHan = TRUE');

-- [17]
SELECT is((SELECT res->>'giaHanMoi' FROM t4_res WHERE step='d1_g2'), 'false',
  'gia_han_giu_cho lan hai: khong gia han them');

-- [18]
SELECT is((SELECT res->>'expiresAt' FROM t4_res WHERE step='d1_g1'), (SELECT res->>'expiresAt' FROM t4_res WHERE step='d1_g2'),
  'Lan hai tra lai dung han da gia han');

SELECT public.expire_seat_holds(998101);

-- [19]
SELECT is((SELECT "TrangThai"::text FROM public."GIU_CHO" WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='d1')), 'ACTIVE',
  'Giu cho da gia han khong bi tac vu don het han lay (dang nhap ma OTP van giu ghe)');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000014',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"88884444-8888-4888-8888-000000000014"}',true);
INSERT INTO t4_res SELECT 'e1', public.tao_giu_cho_theo_suat(998101, '44444444-0000-0000-0000-000000000005'::uuid, '[{"ticketCode":"T4S-A-07","zoneCode":"T4_SEAT"}]'::jsonb);
RESET ROLE;

UPDATE public."GIU_CHO" SET "HetHanLuc" = NOW() - INTERVAL '1 second' WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='e1');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000014',true),
       set_config('request.jwt.claims',json_build_object('role','authenticated','sub','88884444-8888-4888-8888-000000000014','amr',json_build_array(json_build_object('method','otp','timestamp',floor(extract(epoch FROM now()))::bigint)))::text,true);

-- [20]
SELECT throws_ok(
  format($$ SELECT public.gia_han_giu_cho(%L::uuid, '44444444-0000-0000-0000-000000000005'::uuid) $$, (SELECT res->>'holdId' FROM t4_res WHERE step='e1')),
  'P0001', 'GIU_CHO_HET_HAN',
  'Khong gia han duoc giu cho da het han');

-- [21]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '44444444-0000-0000-0000-000000000005'::uuid) $$, (SELECT res->>'holdId' FROM t4_res WHERE step='e1')),
  'P0001', 'GIU_CHO_HET_HAN',
  'Khong xac nhan thanh toan duoc giu cho da het han (du co OTP)');

RESET ROLE;

SELECT public.expire_seat_holds(998101);

-- [22]
SELECT is((SELECT ROW(gc."TrangThai"::text, g."TrangThai"::text)
  FROM public."GIU_CHO" gc JOIN public."CHI_TIET_GIU_CHO" ct ON ct."GiuChoID"=gc."GiuChoID" JOIN public."GHE" g ON g."GheID"=ct."GheID"
  WHERE gc."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='e1')), ROW('EXPIRED'::text, 'TRONG'::text),
  'Giu cho het han: tac vu don chuyen EXPIRED va tra ghe TRONG');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000012',true),
       set_config('request.jwt.claims',json_build_object('role','authenticated','sub','88884444-8888-4888-8888-000000000012','amr',json_build_array(json_build_object('method','otp','timestamp',floor(extract(epoch FROM now()))::bigint)))::text,true);

INSERT INTO t4_res SELECT 'f1', public.tao_giu_cho_theo_suat(998101, '44444444-0000-0000-0000-000000000006'::uuid, '[{"ticketCode":"","zoneCode":"T4_STAND","quantity":2}]'::jsonb);

INSERT INTO t4_res SELECT 'f1_ok', public.xac_nhan_thanh_toan((SELECT (res->>'holdId')::uuid FROM t4_res WHERE step='f1'), '44444444-0000-0000-0000-000000000006'::uuid);

RESET ROLE;

-- [23]
SELECT is((SELECT res->>'status' FROM t4_res WHERE step='f1_ok'), 'CONVERTED', 'Mua 2 ve dung va xac nhan thanh toan');

SELECT public.expire_seat_holds(998101);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub','88884444-8888-4888-8888-000000000013',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"88884444-8888-4888-8888-000000000013"}',true);

-- [24]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(998101, '44444444-0000-0000-0000-000000000007'::uuid, '[{"ticketCode":"","zoneCode":"T4_STAND","quantity":2}]'::jsonb) $$,
  'P0001', 'Phan khu khong con du so luong',
  'Ve dung da xac nhan van tru ton kho: con 1 cho thi khong giu duoc 2');

RESET ROLE;

-- [25]
SELECT is((SELECT ROW(
     has_function_privilege('authenticated', 'public.xac_nhan_thanh_toan(uuid, uuid, text)', 'EXECUTE'),
     has_function_privilege('authenticated', 'public.gia_han_giu_cho(uuid, uuid)', 'EXECUTE'),
     has_function_privilege('anon', 'public.xac_nhan_thanh_toan(uuid, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.gia_han_giu_cho(uuid, uuid)', 'EXECUTE'))),
  ROW(TRUE, TRUE, FALSE),
  'EXECUTE: authenticated duoc goi, anon bi thu hoi tren hai ham moi');

-- [26]
SELECT is(position('da_xac_minh_otp' IN pg_get_functiondef('public.tao_giu_cho_theo_suat(bigint,uuid,jsonb)'::regprocedure)), 0,
  'tao_giu_cho_theo_suat khong con kiem OTP (OTP duoc kiem o xac_nhan_thanh_toan)');
SELECT * FROM finish();
ROLLBACK;
