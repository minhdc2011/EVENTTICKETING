-- pgTAP acceptance tests: Sprint 2 OTP verification, per-account/event ticket
-- limits, frozen price (DonGiaChot), and compatibility adapter (T1 / T3).
-- Migration under test: 20261115090000_sprint2_otp_limit_hold.sql
--   public.da_xac_minh_otp()
--   public.tao_giu_cho_theo_suat(BIGINT, UUID, JSONB)
--   public.tao_giu_cho(INT, UUID, JSONB)
--
-- STATUS: authored only. `npm run check` (TypeScript + Node tests + Vite build)
-- does NOT execute SQL or pgTAP; this file has NOT been run against a live
-- Postgres instance until `npm run db:reset && npm run db:test` is executed.
--
-- Every mutation is inside BEGIN ... ROLLBACK. Fixtures are fully self-contained
-- (auth.users, HO_SO_NGUOI_DUNG, TO_CHUC, THANH_VIEN_TO_CHUC, SU_KIEN,
-- CAU_HINH_SU_KIEN, SUAT_DIEN, KHU_VUC, GHE) and do not rely on supabase/seed.sql.
--
-- Fixture map (IDs 997xxx; UUIDs 88888888-...; slugs t3-otp-*):
--   Users:
--     ...0001  t3-otp-org@example.com     ORGANIZER (CHU_SO_HUU of org a1)
--     ...0011  t3-otp-buyer1@example.com  USER
--     ...0012  t3-otp-buyer2@example.com  USER
--     ...0013  t3-otp-buyer3@example.com  USER
--     ...0014  t3-otp-buyer4@example.com  USER
--   Events / Shows:
--     997101 (OTP=TRUE,  limit=4) -> shows 997101 (zones 997101 seated, 997102 standing)
--                                      and 997102 (zones 997103 seated, 997104 standing)
--     997102 (OTP=FALSE, limit=4) -> show  997201 (zones 997201 seated, 997202 standing)
--     997103 (OTP=FALSE, limit=2) -> show  997301 (zone  997301 standing)
--     997104 (OTP=FALSE, limit=6) -> show  997401 (zone  997401 standing)
--     997105 (NO CAU_HINH_SU_KIEN)-> show  997501 (zones 997501 standing, 997502 seated)

BEGIN;

SELECT plan(56);

-- ============================================================================
-- Fixtures (run as postgres; rolled back at end)
-- ============================================================================
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('88888888-8888-4888-8888-000000000001', 'authenticated', 'authenticated', 't3-otp-org@example.com'),
  ('88888888-8888-4888-8888-000000000011', 'authenticated', 'authenticated', 't3-otp-buyer1@example.com'),
  ('88888888-8888-4888-8888-000000000012', 'authenticated', 'authenticated', 't3-otp-buyer2@example.com'),
  ('88888888-8888-4888-8888-000000000013', 'authenticated', 'authenticated', 't3-otp-buyer3@example.com'),
  ('88888888-8888-4888-8888-000000000014', 'authenticated', 'authenticated', 't3-otp-buyer4@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('88888888-8888-4888-8888-000000000001', 'T3 OTP Org Owner', 'ORGANIZER'),
  ('88888888-8888-4888-8888-000000000011', 'T3 OTP Buyer 1', 'USER'),
  ('88888888-8888-4888-8888-000000000012', 'T3 OTP Buyer 2', 'USER'),
  ('88888888-8888-4888-8888-000000000013', 'T3 OTP Buyer 3', 'USER'),
  ('88888888-8888-4888-8888-000000000014', 'T3 OTP Buyer 4', 'USER')
ON CONFLICT ("NguoiDungID") DO UPDATE
SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES
  ('88888888-0000-4888-8888-0000000000a1', 'T3 OTP Test Org', 't3-otp-test-org')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('88888888-0000-4888-8888-0000000000a1', '88888888-8888-4888-8888-000000000001', 'CHU_SO_HUU')
ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES
  (
    997101, 'T3 OTP Required Event', 't3-otp-required-event', '88888888-0000-4888-8888-0000000000a1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '12 days',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'Ha Noi', 'San T3 1',
    'DANG_MO_BAN', 'BAN_NHAP'
  ),
  (
    997102, 'T3 No OTP Event', 't3-no-otp-event', '88888888-0000-4888-8888-0000000000a1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'Ha Noi', 'San T3 2',
    'DANG_MO_BAN', 'BAN_NHAP'
  ),
  (
    997103, 'T3 Low Limit Event', 't3-low-limit-event', '88888888-0000-4888-8888-0000000000a1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'Ha Noi', 'San T3 3',
    'DANG_MO_BAN', 'BAN_NHAP'
  ),
  (
    997104, 'T3 High Limit Event', 't3-high-limit-event', '88888888-0000-4888-8888-0000000000a1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'Ha Noi', 'San T3 4',
    'DANG_MO_BAN', 'BAN_NHAP'
  ),
  (
    997105, 'T3 Default Config Event', 't3-default-config-event', '88888888-0000-4888-8888-0000000000a1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'Ha Noi', 'San T3 5',
    'DANG_MO_BAN', 'BAN_NHAP'
  );

-- Event 997105 intentionally has NO row in CAU_HINH_SU_KIEN.
-- Rows that differ from the 4/FALSE defaults are audited by
-- trg_kiem_soat_cau_hinh_mua_ve, which needs an authenticated CHU_SO_HUU/QUAN_TRI
-- (no bypass exists), so act as the org owner for this insert.
SET LOCAL "request.jwt.claim.sub" = '88888888-8888-4888-8888-000000000001';
SET LOCAL "request.jwt.claims" = '{"sub":"88888888-8888-4888-8888-000000000001","role":"authenticated"}';

INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "SoVeToiDaMoiDon", "YeuCauXacMinhOTP")
VALUES
  (997101, 4, TRUE),
  (997102, 4, FALSE),
  (997103, 2, FALSE),
  (997104, 6, FALSE);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  (
    997101, 997101, 't3-otp-ev1-s1', 'T3 OTP Show 1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN'
  ),
  (
    997102, 997101, 't3-otp-ev1-s2', 'T3 OTP Show 2',
    NOW() + INTERVAL '11 days', NOW() + INTERVAL '11 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN'
  ),
  (
    997201, 997102, 't3-no-otp-s1', 'T3 No OTP Show 1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN'
  ),
  (
    997301, 997103, 't3-low-limit-s1', 'T3 Low Limit Show 1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN'
  ),
  (
    997401, 997104, 't3-high-limit-s1', 'T3 High Limit Show 1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN'
  ),
  (
    997501, 997105, 't3-def-s1', 'T3 Default Config Show 1',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', 'DANG_MO_BAN'
  );

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (997101, 997101, 997101, 'T3_SEAT_S1',     'T3 Seated S1',       'GHE_NGOI',   500000.00, '#111111', 20),
  (997102, 997101, 997101, 'T3_STAND_S1',    'T3 Standing S1',     'DUNG_STAND', 300000.00, '#222222', 50),
  (997103, 997101, 997102, 'T3_SEAT_S2',     'T3 Seated S2',       'GHE_NGOI',   600000.00, '#333333', 20),
  (997104, 997101, 997102, 'T3_STAND_S2',    'T3 Standing S2',     'DUNG_STAND', 350000.00, '#444444', 50),
  (997201, 997102, 997201, 'T3_NOOTP_SEAT',  'T3 NoOTP Seated',    'GHE_NGOI',   400000.00, '#555555', 10),
  (997202, 997102, 997201, 'T3_NOOTP_STAND', 'T3 NoOTP Standing',  'DUNG_STAND', 250000.00, '#666666', 50),
  (997301, 997103, 997301, 'T3_LOW_STAND',   'T3 Low Standing',    'DUNG_STAND', 150000.00, '#777777', 30),
  (997401, 997104, 997401, 'T3_HIGH_STAND',  'T3 High Standing',   'DUNG_STAND', 200000.00, '#888888', 30),
  (997501, 997105, 997501, 'T3_DEF_STAND',   'T3 Default Stand',   'DUNG_STAND', 180000.00, '#999999', 30),
  (997502, 997105, 997501, 'T3_DEF_SEAT',    'T3 Default Seated',  'GHE_NGOI',   420000.00, '#AAAAAA', 10);

INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 9971000 + g, 997101, 'A', lpad(g::text, 2, '0'), 'T3S1-A-' || lpad(g::text, 2, '0'), 'TRONG'
FROM generate_series(1, 10) AS g
UNION ALL
SELECT 9971020 + g, 997103, 'A', lpad(g::text, 2, '0'), 'T3S2-A-' || lpad(g::text, 2, '0'), 'TRONG'
FROM generate_series(1, 6) AS g
UNION ALL
SELECT 9972000 + g, 997201, 'A', lpad(g::text, 2, '0'), 'NOOTP-A-' || lpad(g::text, 2, '0'), 'TRONG'
FROM generate_series(1, 5) AS g
UNION ALL
SELECT 9975000 + g, 997502, 'A', lpad(g::text, 2, '0'), 'DEF-A-' || lpad(g::text, 2, '0'), 'TRONG'
FROM generate_series(1, 4) AS g;

-- Publish all test events via the real publication RPC as org owner.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000001', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000001"}', true);
SELECT public.cong_bo_su_kien(997101);
SELECT public.cong_bo_su_kien(997102);
SELECT public.cong_bo_su_kien(997103);
SELECT public.cong_bo_su_kien(997104);
SELECT public.cong_bo_su_kien(997105);
RESET ROLE;

CREATE TEMP TABLE t3_otp_res (step TEXT PRIMARY KEY, res JSONB NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON t3_otp_res TO authenticated;

-- ============================================================================
-- Section 1: da_xac_minh_otp() JWT/AMR claim boundary checks (1..14)
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000011', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'role', 'authenticated',
           'sub', '88888888-8888-4888-8888-000000000011',
           'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 3600))
         )::text,
         true
       );
-- [1]
SELECT is(public.da_xac_minh_otp(), TRUE, 'da_xac_minh_otp TRUE when OTP timestamp is 1h ago');

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '88888888-8888-4888-8888-000000000011',
    'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT))
  )::text,
  true
);
-- [2]
SELECT is(public.da_xac_minh_otp(), TRUE, 'da_xac_minh_otp TRUE when OTP timestamp equals now');

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '88888888-8888-4888-8888-000000000011',
    'amr', jsonb_build_array(
      jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 7200),
      jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 86390)
    )
  )::text,
  true
);
-- [3]
SELECT is(public.da_xac_minh_otp(), TRUE, 'da_xac_minh_otp TRUE within 24h even alongside password method');

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '88888888-8888-4888-8888-000000000011',
    'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 86400))
  )::text,
  true
);
-- [4]
SELECT is(public.da_xac_minh_otp(), FALSE, 'da_xac_minh_otp FALSE at exact 24h boundary (now - 86400)');

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '88888888-8888-4888-8888-000000000011',
    'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 86401))
  )::text,
  true
);
-- [5]
SELECT is(public.da_xac_minh_otp(), FALSE, 'da_xac_minh_otp FALSE when OTP is older than 24h (86401s)');

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011"}',
  true
);
-- [6]
SELECT is(public.da_xac_minh_otp(), FALSE, 'da_xac_minh_otp FALSE when amr claim is absent');

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011","amr":[]}',
  true
);
-- [7]
SELECT is(public.da_xac_minh_otp(), FALSE, 'da_xac_minh_otp FALSE when amr is empty array');

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011","amr":{"method":"otp"}}',
  true
);
-- [8]
SELECT is(public.da_xac_minh_otp(), FALSE, 'da_xac_minh_otp FALSE when amr is an object instead of array');

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '88888888-8888-4888-8888-000000000011',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 60))
  )::text,
  true
);
-- [9]
SELECT is(public.da_xac_minh_otp(), FALSE, 'da_xac_minh_otp FALSE when amr only contains password method');

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011","amr":[{"method":"otp"}]}',
  true
);
-- [10]
SELECT is(public.da_xac_minh_otp(), FALSE, 'da_xac_minh_otp FALSE when otp entry is missing timestamp');

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '88888888-8888-4888-8888-000000000011',
    'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', (floor(extract(epoch FROM now()))::BIGINT - 60)::text))
  )::text,
  true
);
-- [11]
SELECT is(public.da_xac_minh_otp(), FALSE, 'da_xac_minh_otp FALSE when otp timestamp is a string instead of number');

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011","amr":[{"method":"otp","timestamp":null}]}',
  true
);
-- [12]
SELECT is(public.da_xac_minh_otp(), FALSE, 'da_xac_minh_otp FALSE when otp timestamp is null');

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '88888888-8888-4888-8888-000000000011',
    'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', ceil(extract(epoch FROM now()))::BIGINT + 60))
  )::text,
  true
);
-- [13]
SELECT is(public.da_xac_minh_otp(), FALSE, 'da_xac_minh_otp FALSE when otp timestamp is in the future');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true),
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);
-- [14]
SELECT throws_ok(
  $$ SELECT public.da_xac_minh_otp() $$,
  '42501', NULL,
  'SQL ROLE anon cannot execute da_xac_minh_otp (42501)'
);
RESET ROLE;

-- ============================================================================
-- Section 2: OTP enforcement in tao_giu_cho_theo_suat (15..23)
-- ============================================================================

-- Luong moi (24/11/2026): giu cho chi can dang nhap; OTP duoc kiem o buoc xac nhan thanh toan.
-- [15] Giu cho tren su kien bat OTP KHONG can OTP (JWT khong co amr).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000011', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011"}', true);
INSERT INTO t3_otp_res SELECT 'b1_ev1_c1', public.tao_giu_cho_theo_suat(
  997101,
  '11111111-0000-0000-0000-000000000005'::uuid,
  '[{"ticketCode":"T3S1-A-01","zoneCode":"T3_SEAT_S1"}]'::jsonb
);
-- [15]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b1_ev1_c1'),
  'ACTIVE',
  'Su kien bat OTP: giu cho thanh cong khi da dang nhap, chua can OTP'
);

-- Expired OTP (> 24h) -> xac nhan thanh toan bi 42501
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '88888888-8888-4888-8888-000000000011',
    'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 86401))
  )::text,
  true
);
-- [16]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '11111111-0000-0000-0000-000000000005'::uuid) $$,
         (SELECT res->>'holdId' FROM t3_otp_res WHERE step = 'b1_ev1_c1')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Xac nhan thanh toan tu choi OTP cu hon 24 gio (42501)'
);

-- Missing timestamp -> 42501
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011","amr":[{"method":"otp"}]}',
  true
);
-- [17]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '11111111-0000-0000-0000-000000000005'::uuid) $$,
         (SELECT res->>'holdId' FROM t3_otp_res WHERE step = 'b1_ev1_c1')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Xac nhan thanh toan tu choi OTP khong co timestamp (42501)'
);

-- Future timestamp -> 42501
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '88888888-8888-4888-8888-000000000011',
    'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', ceil(extract(epoch FROM now()))::BIGINT + 120))
  )::text,
  true
);
-- [18]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '11111111-0000-0000-0000-000000000005'::uuid) $$,
         (SELECT res->>'holdId' FROM t3_otp_res WHERE step = 'b1_ev1_c1')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Xac nhan thanh toan tu choi OTP co timestamp o tuong lai (42501)'
);
RESET ROLE;

-- [19] Cac lan xac nhan that bai khong doi giu cho: van 1 giu cho ACTIVE, 1 chi tiet, ghe DANG_GIU
SELECT is(
  (SELECT ROW(
     (SELECT count(*)::int FROM public."GIU_CHO" WHERE "SuKienID" = 997101),
     (SELECT count(*)::int FROM public."CHI_TIET_GIU_CHO" ct JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID" WHERE gc."SuKienID" = 997101),
     (SELECT "TrangThai"::text FROM public."GHE" WHERE "KhuVucID" = 997101 AND "MaGheDayDu" = 'T3S1-A-01')
   )),
  ROW(1, 1, 'DANG_GIU'::text),
  'Xac nhan thanh toan that bai (OTP sai) khong doi giu cho: 1 giu cho, 1 chi tiet, ghe DANG_GIU'
);

-- [20] gia_han_giu_cho: gia han mot lan roi khong gia han them
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000011', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011"}', true);
INSERT INTO t3_otp_res SELECT 'b1_gia_han_1', public.gia_han_giu_cho(
  (SELECT (res->>'holdId')::uuid FROM t3_otp_res WHERE step = 'b1_ev1_c1'),
  '11111111-0000-0000-0000-000000000005'::uuid
);
INSERT INTO t3_otp_res SELECT 'b1_gia_han_2', public.gia_han_giu_cho(
  (SELECT (res->>'holdId')::uuid FROM t3_otp_res WHERE step = 'b1_ev1_c1'),
  '11111111-0000-0000-0000-000000000005'::uuid
);
RESET ROLE;
SELECT is(
  (SELECT ROW(
     (SELECT res->>'giaHanMoi' FROM t3_otp_res WHERE step = 'b1_gia_han_1'),
     (SELECT res->>'giaHanMoi' FROM t3_otp_res WHERE step = 'b1_gia_han_2'),
     (SELECT res->>'expiresAt' FROM t3_otp_res WHERE step = 'b1_gia_han_1') = (SELECT res->>'expiresAt' FROM t3_otp_res WHERE step = 'b1_gia_han_2')
   )),
  ROW('true'::text, 'false'::text, TRUE),
  'gia_han_giu_cho gia han dung mot lan; lan hai tra lai han da gia han'
);

-- Event 997102 (YeuCauXacMinhOTP = FALSE): buyer 4 WITHOUT OTP succeeds (1 seated + 2 standing)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000014', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'role', 'authenticated',
           'sub', '88888888-8888-4888-8888-000000000014',
           'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 300))
         )::text,
         true
       );
INSERT INTO t3_otp_res SELECT 'b4_ev2_c1', public.tao_giu_cho_theo_suat(
  997201,
  '11111111-0000-0000-0000-000000000006'::uuid,
  '[{"ticketCode":"NOOTP-A-01","zoneCode":"T3_NOOTP_SEAT"},{"ticketCode":"NOOTP-ST-01","zoneCode":"T3_NOOTP_STAND","quantity":2}]'::jsonb
);
RESET ROLE;
-- [21]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b4_ev2_c1'),
  'ACTIVE',
  'Caller without OTP succeeds when event disables YeuCauXacMinhOTP'
);

-- Anon and empty-sub rejections
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true),
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);
-- [22]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997201, '11111111-0000-0000-0000-000000000007'::uuid, '[{"ticketCode":"NOOTP-A-02","zoneCode":"T3_NOOTP_SEAT"}]'::jsonb) $$,
  '42501', NULL,
  'SQL ROLE anon cannot execute tao_giu_cho_theo_suat (42501)'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '{"role":"authenticated"}', true);
-- [23]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997201, '11111111-0000-0000-0000-000000000008'::uuid, '[{"ticketCode":"NOOTP-A-02","zoneCode":"T3_NOOTP_SEAT"}]'::jsonb) $$,
  '28000', 'Can dang nhap de giu cho',
  'authenticated with NULL auth.uid() is rejected with 28000'
);
RESET ROLE;

-- ============================================================================
-- Section 3: Limit 4 cumulative across shows, isolation, expired & released (24..34)
-- ============================================================================

-- buyer_1 already holds 1 ticket on event 997101 (show 997101).
-- Add 1 standing on show 997101 (total = 2), then 2 on show 997102 (total = 4).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000011', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'role', 'authenticated',
           'sub', '88888888-8888-4888-8888-000000000011',
           'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 120))
         )::text,
         true
       );
INSERT INTO t3_otp_res SELECT 'b1_ev1_c2', public.tao_giu_cho_theo_suat(
  997101,
  '11111111-0000-0000-0000-000000000009'::uuid,
  '[{"ticketCode":"T3ST-S1-01","zoneCode":"T3_STAND_S1","quantity":1}]'::jsonb
);
INSERT INTO t3_otp_res SELECT 'b1_ev1_c3', public.tao_giu_cho_theo_suat(
  997102,
  '11111111-0000-0000-0000-000000000010'::uuid,
  '[{"ticketCode":"T3S2-A-01","zoneCode":"T3_SEAT_S2"},{"ticketCode":"T3ST-S2-01","zoneCode":"T3_STAND_S2","quantity":1}]'::jsonb
);
RESET ROLE;

-- [24]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b1_ev1_c2'),
  'ACTIVE',
  'buyer_1 cumulative call 2 (show 997101 -> total 2) succeeds'
);
-- [25]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b1_ev1_c3'),
  'ACTIVE',
  'buyer_1 cumulative call 3 across show 997102 (total 4 across shows) succeeds'
);

-- 5th ticket on show 997102 and on show 997101 both fail with VUOT_GIOI_HAN_VE / 22023
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000011', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'role', 'authenticated',
           'sub', '88888888-8888-4888-8888-000000000011',
           'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 120))
         )::text,
         true
       );
-- [26]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997102, '11111111-0000-0000-0000-000000000011'::uuid, '[{"ticketCode":"T3S2-A-02","zoneCode":"T3_SEAT_S2"}]'::jsonb) $$,
  '22023', 'VUOT_GIOI_HAN_VE',
  '5th ticket across multiple calls/shows on show 997102 raises 22023 VUOT_GIOI_HAN_VE'
);
-- [27]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997101, '11111111-0000-0000-0000-000000000012'::uuid, '[{"ticketCode":"T3S1-A-02","zoneCode":"T3_SEAT_S1"}]'::jsonb) $$,
  '22023', 'VUOT_GIOI_HAN_VE',
  '5th ticket on show 997101 also raises 22023 VUOT_GIOI_HAN_VE'
);
RESET ROLE;

-- [28]
SELECT is(
  (SELECT ROW(
     (SELECT count(*)::int FROM public."GIU_CHO" WHERE "SuKienID" = 997101 AND "NguoiDungID" = '88888888-8888-4888-8888-000000000011'),
     (SELECT COALESCE(SUM(ct."SoLuong"), 0)::int FROM public."CHI_TIET_GIU_CHO" ct JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID" WHERE gc."SuKienID" = 997101 AND gc."NguoiDungID" = '88888888-8888-4888-8888-000000000011'),
     (SELECT "TrangThai"::text FROM public."GHE" WHERE "KhuVucID" = 997103 AND "MaGheDayDu" = 'T3S2-A-02'),
     (SELECT "TrangThai"::text FROM public."GHE" WHERE "KhuVucID" = 997101 AND "MaGheDayDu" = 'T3S1-A-02')
   )),
  ROW(3, 4, 'TRONG'::text, 'TRONG'::text),
  'Failed 5th-ticket calls keep buyer_1 at 3 holds / 4 tickets and leave seats TRONG'
);

-- buyer_2 (separate account) holds 4 tickets in ONE call on event 997101 -> succeeds
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000012', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'role', 'authenticated',
           'sub', '88888888-8888-4888-8888-000000000012',
           'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 120))
         )::text,
         true
       );
INSERT INTO t3_otp_res SELECT 'b2_ev1_c1', public.tao_giu_cho_theo_suat(
  997101,
  '11111111-0000-0000-0000-000000000013'::uuid,
  '[{"ticketCode":"T3S1-A-03","zoneCode":"T3_SEAT_S1"},{"ticketCode":"T3S1-A-04","zoneCode":"T3_SEAT_S1"},{"ticketCode":"T3ST-S1-02","zoneCode":"T3_STAND_S1","quantity":2}]'::jsonb
);
-- [29]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b2_ev1_c1'),
  'ACTIVE',
  'buyer_2 holds 4 tickets in one call on event 997101 (no cross-account counting)'
);
-- [30]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997102, '11111111-0000-0000-0000-000000000014'::uuid, '[{"ticketCode":"T3S2-A-03","zoneCode":"T3_SEAT_S2"}]'::jsonb) $$,
  '22023', 'VUOT_GIOI_HAN_VE',
  'buyer_2 5th ticket on show 997102 raises 22023 VUOT_GIOI_HAN_VE'
);

-- No cross-event counting: buyer_2 (4/4 on 997101) can hold on event 997102
INSERT INTO t3_otp_res SELECT 'b2_ev2_c1', public.tao_giu_cho_theo_suat(
  997201,
  '11111111-0000-0000-0000-000000000015'::uuid,
  '[{"ticketCode":"NOOTP-ST-02","zoneCode":"T3_NOOTP_STAND","quantity":2}]'::jsonb
);
RESET ROLE;
-- [31]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b2_ev2_c1'),
  'ACTIVE',
  'buyer_2 at limit on event 997101 can still hold on event 997102 (no cross-event limit)'
);

-- Expired ACTIVE hold does not occupy quota (buyer_3)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000013', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'role', 'authenticated',
           'sub', '88888888-8888-4888-8888-000000000013',
           'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 120))
         )::text,
         true
       );
INSERT INTO t3_otp_res SELECT 'b3_ev1_exp', public.tao_giu_cho_theo_suat(
  997101,
  '11111111-0000-0000-0000-000000000016'::uuid,
  '[{"ticketCode":"T3ST-S1-03","zoneCode":"T3_STAND_S1","quantity":4}]'::jsonb
);
RESET ROLE;

-- Keep TrangThai='ACTIVE' while moving HetHanLuc into the past.
UPDATE public."GIU_CHO"
SET "HetHanLuc" = NOW() - INTERVAL '1 second'
WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_otp_res WHERE step = 'b3_ev1_exp');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000013', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'role', 'authenticated',
           'sub', '88888888-8888-4888-8888-000000000013',
           'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 120))
         )::text,
         true
       );
INSERT INTO t3_otp_res SELECT 'b3_ev1_after_exp', public.tao_giu_cho_theo_suat(
  997101,
  '11111111-0000-0000-0000-000000000017'::uuid,
  '[{"ticketCode":"T3ST-S1-04","zoneCode":"T3_STAND_S1","quantity":4}]'::jsonb
);
RESET ROLE;

-- [32]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b3_ev1_after_exp'),
  'ACTIVE',
  'Expired ACTIVE hold does not occupy buyer_3 quota for a new 4-ticket hold'
);
-- [33]
SELECT is(
  (SELECT ROW(
     (SELECT count(*)::int FROM public."GIU_CHO" WHERE "SuKienID" = 997101 AND "NguoiDungID" = '88888888-8888-4888-8888-000000000013' AND "TrangThai" = 'EXPIRED'),
     (SELECT count(*)::int FROM public."GIU_CHO" WHERE "SuKienID" = 997101 AND "NguoiDungID" = '88888888-8888-4888-8888-000000000013' AND "TrangThai" = 'ACTIVE'),
     (SELECT COALESCE(SUM(ct."SoLuong"), 0)::int FROM public."CHI_TIET_GIU_CHO" ct JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID" WHERE gc."SuKienID" = 997101 AND gc."NguoiDungID" = '88888888-8888-4888-8888-000000000013' AND gc."TrangThai" = 'ACTIVE')
   )),
  ROW(1, 1, 4),
  'Old expired hold transitioned to EXPIRED and buyer_3 has 1 ACTIVE hold (4 tickets)'
);

-- Cancelled (RELEASED) hold does not occupy quota (buyer_3)
UPDATE public."GIU_CHO"
SET "TrangThai" = 'RELEASED', "NgayCapNhat" = NOW()
WHERE "GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_otp_res WHERE step = 'b3_ev1_after_exp');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000013', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'role', 'authenticated',
           'sub', '88888888-8888-4888-8888-000000000013',
           'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 120))
         )::text,
         true
       );
INSERT INTO t3_otp_res SELECT 'b3_ev1_after_rel', public.tao_giu_cho_theo_suat(
  997101,
  '11111111-0000-0000-0000-000000000018'::uuid,
  '[{"ticketCode":"T3ST-S1-05","zoneCode":"T3_STAND_S1","quantity":4}]'::jsonb
);
RESET ROLE;
-- [34]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b3_ev1_after_rel'),
  'ACTIVE',
  'RELEASED hold does not occupy buyer_3 quota for a new 4-ticket hold'
);

-- ============================================================================
-- Section 4: Configured limit < 4, > 4, missing config default, per-call 4 (35..44)
-- ============================================================================

-- Event 997103: SoVeToiDaMoiDon = 2
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000011', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011"}', true);
INSERT INTO t3_otp_res SELECT 'b1_ev3_c1', public.tao_giu_cho_theo_suat(
  997301,
  '11111111-0000-0000-0000-000000000019'::uuid,
  '[{"ticketCode":"T3LOW-01","zoneCode":"T3_LOW_STAND","quantity":2}]'::jsonb
);
-- [35]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b1_ev3_c1'),
  'ACTIVE',
  'Limit < 4 (2): holding 2 tickets succeeds'
);
-- [36]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997301, '11111111-0000-0000-0000-000000000020'::uuid, '[{"ticketCode":"T3LOW-02","zoneCode":"T3_LOW_STAND","quantity":1}]'::jsonb) $$,
  '22023', 'VUOT_GIOI_HAN_VE',
  'Limit < 4 (2): 3rd ticket in second call raises 22023 VUOT_GIOI_HAN_VE'
);

SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000012', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000012"}', true);
-- [37]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997301, '11111111-0000-0000-0000-000000000021'::uuid, '[{"ticketCode":"T3LOW-03","zoneCode":"T3_LOW_STAND","quantity":3}]'::jsonb) $$,
  '22023', 'VUOT_GIOI_HAN_VE',
  'Limit < 4 (2): 3 tickets in single call raises 22023 VUOT_GIOI_HAN_VE'
);

-- Event 997104: SoVeToiDaMoiDon = 6 (per-call limit 4 still holds!)
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000011', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011"}', true);
-- [38]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997401, '11111111-0000-0000-0000-000000000022'::uuid, '[{"ticketCode":"T3HIGH-01","zoneCode":"T3_HIGH_STAND","quantity":5}]'::jsonb) $$,
  '22023', 'Moi luot chi duoc giu tu 1 den 4 ve',
  'Limit > 4 (6): single call of 5 tickets still blocked by per-call cap of 4'
);

INSERT INTO t3_otp_res SELECT 'b1_ev4_c1', public.tao_giu_cho_theo_suat(
  997401,
  '11111111-0000-0000-0000-000000000023'::uuid,
  '[{"ticketCode":"T3HIGH-02","zoneCode":"T3_HIGH_STAND","quantity":4}]'::jsonb
);
INSERT INTO t3_otp_res SELECT 'b1_ev4_c2', public.tao_giu_cho_theo_suat(
  997401,
  '11111111-0000-0000-0000-000000000024'::uuid,
  '[{"ticketCode":"T3HIGH-03","zoneCode":"T3_HIGH_STAND","quantity":2}]'::jsonb
);
-- [39]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b1_ev4_c1'),
  'ACTIVE',
  'Limit > 4 (6): first call of 4 tickets succeeds'
);
-- [40]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b1_ev4_c2'),
  'ACTIVE',
  'Limit > 4 (6): second call of 2 tickets succeeds (cumulative 6)'
);
-- [41]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997401, '11111111-0000-0000-0000-000000000025'::uuid, '[{"ticketCode":"T3HIGH-04","zoneCode":"T3_HIGH_STAND","quantity":1}]'::jsonb) $$,
  '22023', 'VUOT_GIOI_HAN_VE',
  'Limit > 4 (6): 7th ticket raises 22023 VUOT_GIOI_HAN_VE'
);
RESET ROLE;

-- Event 997105: missing CAU_HINH_SU_KIEN row defaults to limit=4, OTP=FALSE
-- [42]
SELECT is(
  (SELECT count(*)::int FROM public."CAU_HINH_SU_KIEN" WHERE "SuKienID" = 997105),
  0,
  'Event 997105 has no CAU_HINH_SU_KIEN row'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000011', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000011"}', true);
INSERT INTO t3_otp_res SELECT 'b1_ev5_c1', public.tao_giu_cho_theo_suat(
  997501,
  '11111111-0000-0000-0000-000000000026'::uuid,
  '[{"ticketCode":"T3DEF-01","zoneCode":"T3_DEF_STAND","quantity":4}]'::jsonb
);
-- [43]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b1_ev5_c1'),
  'ACTIVE',
  'Missing config defaults OTP=FALSE and limit=4 (4 tickets succeed without OTP)'
);
-- [44]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997501, '11111111-0000-0000-0000-000000000027'::uuid, '[{"ticketCode":"T3DEF-02","zoneCode":"T3_DEF_STAND","quantity":1}]'::jsonb) $$,
  '22023', 'VUOT_GIOI_HAN_VE',
  'Missing config enforces default limit=4 on 5th ticket'
);
RESET ROLE;

-- ============================================================================
-- Section 5: NguoiDungID and DonGiaChot freeze across price changes (45..48)
-- ============================================================================

-- [45]
SELECT is(
  (SELECT ROW(
     gc."NguoiDungID"::text,
     (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct WHERE ct."GiuChoID" = gc."GiuChoID" AND ct."GheID" IS NOT NULL),
     (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct WHERE ct."GiuChoID" = gc."GiuChoID" AND ct."GheID" IS NULL),
     (SELECT ct."SoLuong"::int FROM public."CHI_TIET_GIU_CHO" ct WHERE ct."GiuChoID" = gc."GiuChoID" AND ct."GheID" IS NULL)
   )
   FROM public."GIU_CHO" gc
   WHERE gc."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_otp_res WHERE step = 'b4_ev2_c1')),
  ROW('88888888-8888-4888-8888-000000000014'::text, 400000.00::numeric, 250000.00::numeric, 2),
  'Hold records NguoiDungID and initial DonGiaChot for both seated (400000) and standing (250000)'
);

-- Change listed prices on event 997102, then create a new hold by buyer_3
UPDATE public."KHU_VUC"
SET "GiaVeNiemYet" = CASE "KhuVucID"
  WHEN 997201 THEN 550000.00
  WHEN 997202 THEN 320000.00
END
WHERE "KhuVucID" IN (997201, 997202);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000013', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000013"}', true);
INSERT INTO t3_otp_res SELECT 'b3_ev2_newprice', public.tao_giu_cho_theo_suat(
  997201,
  '11111111-0000-0000-0000-000000000028'::uuid,
  '[{"ticketCode":"NOOTP-A-02","zoneCode":"T3_NOOTP_SEAT"},{"ticketCode":"NOOTP-ST-03","zoneCode":"T3_NOOTP_STAND","quantity":1}]'::jsonb
);
RESET ROLE;

-- [46]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b3_ev2_newprice'),
  'ACTIVE',
  'New hold after price update succeeds'
);
-- [47]
SELECT is(
  (SELECT ROW(
     (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct WHERE ct."GiuChoID" = gc."GiuChoID" AND ct."GheID" IS NOT NULL),
     (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct WHERE ct."GiuChoID" = gc."GiuChoID" AND ct."GheID" IS NULL)
   )
   FROM public."GIU_CHO" gc
   WHERE gc."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_otp_res WHERE step = 'b4_ev2_c1')),
  ROW(400000.00::numeric, 250000.00::numeric),
  'Existing hold DonGiaChot stays frozen at 400000 / 250000 after listed price change'
);
-- [48]
SELECT is(
  (SELECT ROW(
     gc."NguoiDungID"::text,
     (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct WHERE ct."GiuChoID" = gc."GiuChoID" AND ct."GheID" IS NOT NULL),
     (SELECT ct."DonGiaChot"::numeric FROM public."CHI_TIET_GIU_CHO" ct WHERE ct."GiuChoID" = gc."GiuChoID" AND ct."GheID" IS NULL)
   )
   FROM public."GIU_CHO" gc
   WHERE gc."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_otp_res WHERE step = 'b3_ev2_newprice')),
  ROW('88888888-8888-4888-8888-000000000013'::text, 550000.00::numeric, 320000.00::numeric),
  'New hold records buyer_3 NguoiDungID and new DonGiaChot (550000 / 320000)'
);

-- ============================================================================
-- Section 6: Failure atomicity, tao_giu_cho adapter, and ACL checks (49..56)
-- ============================================================================

-- Multi-item partial failure: 1st seat valid, 2nd seat invalid -> whole call rolls back
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000012', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000012"}', true);
-- [49]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho_theo_suat(997501, '11111111-0000-0000-0000-000000000029'::uuid, '[{"ticketCode":"DEF-A-01","zoneCode":"T3_DEF_SEAT"},{"ticketCode":"NO-SUCH-SEAT","zoneCode":"T3_DEF_SEAT"}]'::jsonb) $$,
  'P0001', 'Ghe khong con trong',
  'Multi-item call with invalid second seat raises P0001'
);
RESET ROLE;

-- [50]
SELECT is(
  (SELECT ROW(
     (SELECT "TrangThai"::text FROM public."GHE" WHERE "KhuVucID" = 997502 AND "MaGheDayDu" = 'DEF-A-01'),
     (SELECT count(*)::int FROM public."GIU_CHO" WHERE "SuKienID" = 997105 AND "NguoiDungID" = '88888888-8888-4888-8888-000000000012'),
     (SELECT count(*)::int FROM public."CHI_TIET_GIU_CHO" ct JOIN public."GIU_CHO" gc ON gc."GiuChoID" = ct."GiuChoID" WHERE gc."SuKienID" = 997105 AND gc."NguoiDungID" = '88888888-8888-4888-8888-000000000012')
   )),
  ROW('TRONG'::text, 0, 0),
  'Partial failure rolls back DEF-A-01 to TRONG and leaves 0 GIU_CHO / CHI_TIET_GIU_CHO'
);

-- Compatibility adapter tao_giu_cho enforces ACL, OTP, limit, NguoiDungID, DonGiaChot
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true),
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);
-- [51]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho(997101, '11111111-0000-0000-0000-000000000030'::uuid, '[{"ticketCode":"T3S1-A-05","zoneCode":"T3_SEAT_S1"}]'::jsonb) $$,
  '42501', NULL,
  'Adapter tao_giu_cho rejects SQL ROLE anon (42501)'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000014', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000014"}', true);
INSERT INTO t3_otp_res SELECT 'b4_adapter_ev1', public.tao_giu_cho(
  997101,
  '11111111-0000-0000-0000-000000000031'::uuid,
  '[{"ticketCode":"T3S1-A-05","zoneCode":"T3_SEAT_S1"}]'::jsonb
);
-- [52]
SELECT is(
  (SELECT res->>'status' FROM t3_otp_res WHERE step = 'b4_adapter_ev1'),
  'ACTIVE',
  'Adapter tao_giu_cho giu cho khong can OTP (OTP duoc kiem o buoc xac nhan thanh toan)'
);

-- buyer_2 is at 4/4 on event 997101
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000012', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'role', 'authenticated',
           'sub', '88888888-8888-4888-8888-000000000012',
           'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', floor(extract(epoch FROM now()))::BIGINT - 60))
         )::text,
         true
       );
-- [53]
SELECT throws_ok(
  $$ SELECT public.tao_giu_cho(997101, '11111111-0000-0000-0000-000000000032'::uuid, '[{"ticketCode":"T3S1-A-05","zoneCode":"T3_SEAT_S1"}]'::jsonb) $$,
  '22023', 'VUOT_GIOI_HAN_VE',
  'Adapter tao_giu_cho does not bypass per-account/event limit (22023)'
);

-- buyer_4 khong co OTP: giu cho qua adapter da thanh cong nhung xac nhan thanh toan bi tu choi
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-000000000014', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"88888888-8888-4888-8888-000000000014"}', true);
-- [54]
SELECT throws_ok(
  format($$ SELECT public.xac_nhan_thanh_toan(%L::uuid, '11111111-0000-0000-0000-000000000031'::uuid) $$,
         (SELECT res->>'holdId' FROM t3_otp_res WHERE step = 'b4_adapter_ev1')),
  '42501', 'Can xac minh OTP de xac nhan thanh toan',
  'Giu cho qua adapter khong the xac nhan thanh toan khi chua xac minh OTP (42501)'
);
RESET ROLE;

-- [55]
SELECT is(
  (SELECT ROW(
     gc."NguoiDungID"::text,
     ct."DonGiaChot"::numeric,
     g."TrangThai"::text
   )
   FROM public."GIU_CHO" gc
   JOIN public."CHI_TIET_GIU_CHO" ct ON ct."GiuChoID" = gc."GiuChoID"
   JOIN public."GHE" g ON g."GheID" = ct."GheID"
   WHERE gc."GiuChoID" = (SELECT (res->>'holdId')::uuid FROM t3_otp_res WHERE step = 'b4_adapter_ev1')),
  ROW('88888888-8888-4888-8888-000000000014'::text, 500000.00::numeric, 'DANG_GIU'::text),
  'Adapter tao_giu_cho persists NguoiDungID, DonGiaChot, and DANG_GIU seat state'
);

-- [56]
SELECT is(
  (SELECT ROW(
     has_function_privilege('authenticated', 'public.da_xac_minh_otp()', 'EXECUTE'),
     has_function_privilege('authenticated', 'public.tao_giu_cho_theo_suat(bigint, uuid, jsonb)', 'EXECUTE'),
     has_function_privilege('authenticated', 'public.tao_giu_cho(integer, uuid, jsonb)', 'EXECUTE'),
     has_function_privilege('anon', 'public.da_xac_minh_otp()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.tao_giu_cho_theo_suat(bigint, uuid, jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.tao_giu_cho(integer, uuid, jsonb)', 'EXECUTE')
   )),
  ROW(TRUE, TRUE, TRUE, FALSE),
  'EXECUTE granted to authenticated and revoked from anon on all 3 hold/OTP functions'
);

SELECT * FROM finish();
ROLLBACK;
