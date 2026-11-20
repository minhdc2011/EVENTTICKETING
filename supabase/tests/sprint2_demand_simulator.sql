-- pgTAP acceptance test: Sprint 2 / T4 Demand Simulator with simulated sale timestamps
-- Migration under test: 20261113100000_sprint2_demand_simulator.sql
--
-- STATUS: authored; run with `npm run db:test` (`supabase test db`) against a migrated DB.
-- Every mutation is inside BEGIN ... ROLLBACK. `npm run check` does NOT run this file.

BEGIN;

SELECT plan(53);

-- ============================================================================
-- 1. Catalog & ACL checks (assertions 1-8)
-- ============================================================================
SELECT has_table('public', 'MO_PHONG_GHE', 'MO_PHONG_GHE bookkeeping table exists');
SELECT is(
  (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'MO_PHONG_GHE'),
  TRUE, 'MO_PHONG_GHE has RLS enabled');
SELECT is(
  (SELECT count(*)::int FROM pg_constraint
    WHERE conrelid = 'public."MO_PHONG_GHE"'::regclass AND contype = 'f'),
  0, 'MO_PHONG_GHE has no foreign keys');
SELECT is(
  has_table_privilege('anon', 'public."MO_PHONG_GHE"', 'SELECT')
  OR has_table_privilege('authenticated', 'public."MO_PHONG_GHE"', 'SELECT')
  OR has_table_privilege('authenticated', 'public."MO_PHONG_GHE"', 'INSERT')
  OR has_table_privilege('authenticated', 'public."MO_PHONG_GHE"', 'UPDATE')
  OR has_table_privilege('authenticated', 'public."MO_PHONG_GHE"', 'DELETE'),
  FALSE, 'client roles have no privileges on MO_PHONG_GHE');
SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p
     CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'public.mo_phong_nhu_cau(integer, text)'::regprocedure
      AND a.grantee = 0
      AND a.privilege_type = 'EXECUTE'),
  0, 'PUBLIC has no EXECUTE on mo_phong_nhu_cau (proacl)');
SELECT is(
  has_function_privilege('anon', 'public.mo_phong_nhu_cau(integer, text)', 'EXECUTE'),
  FALSE, 'anon cannot execute mo_phong_nhu_cau');
SELECT is(
  has_function_privilege('authenticated', 'public.mo_phong_nhu_cau(integer, text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.mo_phong_nhu_cau(integer, text)', 'EXECUTE'),
  TRUE, 'authenticated and service_role can execute mo_phong_nhu_cau');
SELECT is(
  (SELECT p.prosecdef AND p.provolatile = 'v' AND 'search_path=public' = ANY(p.proconfig)
     FROM pg_proc p
    WHERE p.oid = 'public.mo_phong_nhu_cau(integer, text)'::regprocedure),
  TRUE, 'mo_phong_nhu_cau is VOLATILE SECURITY DEFINER SET search_path = public');

-- ============================================================================
-- Fixtures (IDs 995xxx, isolated from other test files)
-- ============================================================================
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('44444444-4444-4444-4444-444444444401', 'authenticated', 'authenticated', 't4sim-owner-a@example.com'),
  ('44444444-4444-4444-4444-444444444402', 'authenticated', 'authenticated', 't4sim-editor-a@example.com'),
  ('44444444-4444-4444-4444-444444444403', 'authenticated', 'authenticated', 't4sim-owner-b@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('44444444-4444-4444-4444-444444444401', 'T4 Owner A', 'ORGANIZER'),
  ('44444444-4444-4444-4444-444444444402', 'T4 Editor A', 'ORGANIZER'),
  ('44444444-4444-4444-4444-444444444403', 'T4 Owner B', 'ORGANIZER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES
  ('44444444-0000-0000-0000-000000000401', 'T4 Sim Org A', 't4sim-org-a'),
  ('44444444-0000-0000-0000-000000000402', 'T4 Sim Org B', 't4sim-org-b')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('44444444-0000-0000-0000-000000000401', '44444444-4444-4444-4444-444444444401', 'CHU_SO_HUU'),
  ('44444444-0000-0000-0000-000000000401', '44444444-4444-4444-4444-444444444402', 'BIEN_TAP'),
  ('44444444-0000-0000-0000-000000000402', '44444444-4444-4444-4444-444444444403', 'CHU_SO_HUU')
ON CONFLICT DO NOTHING;

INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES
  (
    995101, 'T4 Sim Event A', 't4sim-event-a', '44444444-0000-0000-0000-000000000401',
    NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
    NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'Ha Noi', 'San T4 A',
    'DANG_MO_BAN', 'BAN_NHAP'
  ),
  (
    995201, 'T4 Sim Event B', 't4sim-event-b', '44444444-0000-0000-0000-000000000402',
    NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
    NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'Ha Noi', 'San T4 B',
    'DANG_MO_BAN', 'BAN_NHAP'
  ),
  (
    995301, 'T4 Sim Event Closed Only', 't4sim-event-closed', '44444444-0000-0000-0000-000000000401',
    NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
    NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'Ha Noi', 'San T4 C',
    'DONG_BAN', 'BAN_NHAP'
  );

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  (
    995101, 995101, 't4-suat-a1', 'Suat A1 Open',
    NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
    NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'DANG_MO_BAN'
  ),
  (
    995201, 995201, 't4-suat-b1', 'Suat B1 Open',
    NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
    NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'DANG_MO_BAN'
  ),
  (
    995301, 995301, 't4-suat-c1', 'Suat C1 Closed',
    NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
    NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'DONG_BAN'
  );

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (995101, 995101, 995101, 'T4_A1_SEAT',  'Khu Ngoi A1', 'GHE_NGOI',   300000, '#111111', 20),
  (995102, 995101, 995101, 'T4_A1_STAND', 'Khu Dung A1', 'DUNG_STAND', 150000, '#222222', 50),
  (995201, 995201, 995201, 'T4_B1_SEAT',  'Khu Ngoi B1', 'GHE_NGOI',   400000, '#333333', 10),
  (995301, 995301, 995301, 'T4_C1_SEAT',  'Khu Ngoi C1', 'GHE_NGOI',   250000, '#444444', 5);

-- Publish all three events while initial shows/zones are valid, then add SAP_MO_BAN & closed shows on 995101
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';
DO $$ BEGIN
  PERFORM public.cong_bo_su_kien(995101);
  PERFORM public.cong_bo_su_kien(995301);
END $$;
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444403';
DO $$ BEGIN
  PERFORM public.cong_bo_su_kien(995201);
END $$;
RESET ROLE;

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES
  -- SAP_MO_BAN inside open window (must be treated as open by suat_dien_dang_mo_ban)
  (
    995102, 995101, 't4-suat-a2-sap', 'Suat A2 SAP_MO_BAN Open',
    NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
    NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'SAP_MO_BAN'
  ),
  -- Closed show on Event A (must be skipped)
  (
    995103, 995101, 't4-suat-a3-closed', 'Suat A3 Closed',
    NOW() + INTERVAL '90 hours', NOW() + INTERVAL '93 hours',
    NOW() - INTERVAL '20 hours', NOW() + INTERVAL '80 hours', 'DONG_BAN'
  );

INSERT INTO public."KHU_VUC" (
  "KhuVucID", "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES
  (995103, 995101, 995103, 'T4_A3_CLOSED', 'Khu Ngoi A3 Closed', 'GHE_NGOI', 200000, '#555555', 10),
  (995104, 995101, 995102, 'T4_A2_SAP',    'Khu Ngoi A2 SAP',    'GHE_NGOI', 220000, '#666666', 10);

-- Seats:
--   995101 (zone 995101): 20 seats (995101..995120):
--     995101..995118 TRONG (18 eligible)
--     995119 DANG_GIU (ACTIVE hold)
--     995120 TRONG    (ACTIVE hold detail -> must stay TRONG and be counted in boQuaDangGiu)
--   995103 (zone 995103 closed): 10 seats TRONG (995201..995210)
--   995104 (zone 995104 SAP_MO_BAN): 10 seats TRONG (995301..995310)
--   995201 (Event B zone 995201): 10 seats TRONG (995401..995410)
--   995301 (Event C zone 995301 closed-only): 5 seats TRONG (995501..995505)
--          + 1 dedicated trigger-test seat 995599 (outside 995501..995505; Event C is only simulated in Section 3 -> KHONG_CO_SUAT_HOP_LE)
INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 995100 + n, 995101, 'A', lpad(n::text, 2, '0'), 'T4_A1_SEAT-A-' || lpad(n::text, 2, '0'),
       CASE WHEN n = 19 THEN 'DANG_GIU' ELSE 'TRONG' END
  FROM generate_series(1, 20) AS n;

INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 995200 + n, 995103, 'A', lpad(n::text, 2, '0'), 'T4_A3_CLOSED-A-' || lpad(n::text, 2, '0'), 'TRONG'
  FROM generate_series(1, 10) AS n;

INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 995300 + n, 995104, 'A', lpad(n::text, 2, '0'), 'T4_A2_SAP-A-' || lpad(n::text, 2, '0'), 'TRONG'
  FROM generate_series(1, 10) AS n;

INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 995400 + n, 995201, 'A', lpad(n::text, 2, '0'), 'T4_B1_SEAT-A-' || lpad(n::text, 2, '0'), 'TRONG'
  FROM generate_series(1, 10) AS n;

INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
SELECT 995500 + n, 995301, 'A', lpad(n::text, 2, '0'), 'T4_C1_SEAT-A-' || lpad(n::text, 2, '0'), 'TRONG'
  FROM generate_series(1, 5) AS n;

INSERT INTO public."GHE" ("GheID", "KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
VALUES (995599, 995301, 'Z', '99', 'T4_C1_SEAT-Z-99', 'TRONG');

-- ACTIVE hold on 995119 (DANG_GIU) and 995120 (TRONG)
INSERT INTO public."GIU_CHO" (
  "GiuChoID", "SuKienID", "SuatDienID", "PhienNguoiDung", "TrangThai", "HetHanLuc"
) VALUES (
  '99510000-0000-0000-0000-000000000001', 995101, 995101,
  '99510000-0000-0000-0000-0000000000a1', 'ACTIVE', NOW() + INTERVAL '5 minutes'
);

INSERT INTO public."CHI_TIET_GIU_CHO" ("GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong")
VALUES
  ('99510000-0000-0000-0000-000000000001', 995101, 995119, 'T4_A1_SEAT-A-19', 1),
  ('99510000-0000-0000-0000-000000000001', 995101, 995120, 'T4_A1_SEAT-A-20', 1);

-- ============================================================================
-- 2. Gate rejections BEFORE any write (assertions 9-20)
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';

-- Missing CAU_HINH_SU_KIEN row: bad scenario still rejected first (22023)
SELECT throws_ok(
  $$ SELECT public.mo_phong_nhu_cau(995101, 'khong_hop_le') $$,
  '22023', 'KICH_BAN_KHONG_HOP_LE', 'invalid scenario rejected with 22023');
SELECT throws_ok(
  $$ SELECT public.mo_phong_nhu_cau(995101, NULL) $$,
  '22023', 'KICH_BAN_KHONG_HOP_LE', 'NULL scenario rejected with 22023');

-- Non-existent event: 42501 for authenticated, P0002 for service_role
SELECT throws_ok(
  $$ SELECT public.mo_phong_nhu_cau(999999999, 'ban_nhanh') $$,
  '42501', NULL, 'non-existent event gives 42501 for authenticated caller');

-- Missing CAU_HINH_SU_KIEN -> 55000 MO_PHONG_CHUA_BAT
SELECT throws_ok(
  $$ SELECT public.mo_phong_nhu_cau(995101, 'ban_nhanh') $$,
  '55000', 'MO_PHONG_CHUA_BAT', 'missing CAU_HINH_SU_KIEN rejected with 55000');

-- BIEN_TAP and cross-org owner -> 42501
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444402';
SELECT throws_ok(
  $$ SELECT public.mo_phong_nhu_cau(995101, 'ban_nhanh') $$,
  '42501', NULL, 'BIEN_TAP member rejected with 42501');

SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444403';
SELECT throws_ok(
  $$ SELECT public.mo_phong_nhu_cau(995101, 'ban_nhanh') $$,
  '42501', NULL, 'cross-org owner rejected with 42501');
RESET ROLE;

SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok(
  $$ SELECT public.mo_phong_nhu_cau(999999999, 'ban_nhanh') $$,
  'P0002', NULL, 'service_role gets P0002 for non-existent event');
RESET ROLE;

-- Flag = false -> 55000
INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "TuyChonMoRong")
VALUES
  (995101, '{"moPhong": false}'::jsonb),
  (995301, '{"moPhong": true}'::jsonb);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';
SELECT throws_ok(
  $$ SELECT public.mo_phong_nhu_cau(995101, 'ban_nhanh') $$,
  '55000', 'MO_PHONG_CHUA_BAT', 'moPhong=false rejected with 55000');
RESET ROLE;

-- Case variants "TRUE" and "True" must be rejected with 55000 (exact AC#2 check)
UPDATE public."CAU_HINH_SU_KIEN"
   SET "TuyChonMoRong" = '{"moPhong": "TRUE"}'::jsonb
 WHERE "SuKienID" = 995101;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';
SELECT throws_ok(
  $$ SELECT public.mo_phong_nhu_cau(995101, 'ban_nhanh') $$,
  '55000', 'MO_PHONG_CHUA_BAT', 'moPhong="TRUE" rejected with 55000');
RESET ROLE;

UPDATE public."CAU_HINH_SU_KIEN"
   SET "TuyChonMoRong" = '{"moPhong": "True"}'::jsonb
 WHERE "SuKienID" = 995101;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';
SELECT throws_ok(
  $$ SELECT public.mo_phong_nhu_cau(995101, 'ban_nhanh') $$,
  '55000', 'MO_PHONG_CHUA_BAT', 'moPhong="True" rejected with 55000');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" BETWEEN 995101 AND 995120 AND "TrangThai" = 'DA_BAN'),
  0, 'rejections wrote zero DA_BAN seats');
SELECT is(
  (SELECT count(*)::int FROM public."MO_PHONG_GHE" WHERE "SuKienID" = 995101),
  0, 'rejections wrote zero MO_PHONG_GHE rows');

-- ============================================================================
-- 3. Closed-show-only event skips show with ZERO writes (assertions 21-25)
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';

SELECT is(
  public.mo_phong_nhu_cau(995301, 'ban_nhanh') ->> 'ketQua',
  'KHONG_CO_SUAT_HOP_LE', 'event with only closed shows returns KHONG_CO_SUAT_HOP_LE');
SELECT is(
  (public.mo_phong_nhu_cau(995301, 'ban_nhanh') -> 'moPhong')::boolean,
  TRUE, 'KHONG_CO_SUAT_HOP_LE payload keeps moPhong = true');
SELECT is(
  (public.mo_phong_nhu_cau(995301, 'ban_nhanh') -> 'suatBoQua' -> 0 ->> 'suatDienId')::bigint,
  995301::bigint, 'closed show is listed in suatBoQua');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "GheID" BETWEEN 995501 AND 995505 AND "TrangThai" <> 'TRONG'),
  0, 'closed-show-only event leaves all seats TRONG');
SELECT is(
  (SELECT count(*)::int FROM public."MO_PHONG_GHE" WHERE "SuKienID" = 995301),
  0, 'closed-show-only event inserts zero MO_PHONG_GHE rows');

-- ============================================================================
-- 4. Enable moPhong on Event A & run ban_nhanh (assertions 26-39)
-- ============================================================================
UPDATE public."CAU_HINH_SU_KIEN"
   SET "TuyChonMoRong" = '{"moPhong": true}'::jsonb
 WHERE "SuKienID" = 995101;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';

SELECT is(
  (SELECT ROW(r->>'ketQua', r->>'nhan', (r->>'moPhong')::boolean, r->>'kichBan')
     FROM (SELECT public.mo_phong_nhu_cau(995101, 'ban_nhanh') AS r) s),
  ROW('DA_MO_PHONG', 'MO_PHONG', TRUE, 'ban_nhanh'),
  'ban_nhanh succeeds with DA_MO_PHONG and MO_PHONG label');

-- Open shows include both DANG_MO_BAN (995101) and SAP_MO_BAN (995102); closed show (995103) is skipped
SELECT is(
  (SELECT ARRAY(
      SELECT (x)::bigint
        FROM jsonb_array_elements_text(public.mo_phong_nhu_cau(995101, 'ban_nhanh') -> 'suatDaMoPhong') AS x
       ORDER BY 1
   )),
  ARRAY[995101, 995102]::bigint[],
  'suatDaMoPhong includes both DANG_MO_BAN (995101) and open SAP_MO_BAN (995102)');
RESET ROLE;

-- Wait: verify suatDaMoPhong, suatBoQua, standing zone khongCoGhe, simulated timestamps, holds, closed show, other event
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';
SELECT is(
  (SELECT ROW(n_sold, so_ban_6h, mo_phong)
     FROM public.lay_so_lieu_dinh_gia(995101) WHERE khu_vuc_id = 995101),
  ROW(14, 14, TRUE),
  'ban_nhanh sells 14/20 seats all within 6h window (n_sold=14, so_ban_6h=14, mo_phong=true)');
SELECT is(
  (SELECT n_sold FROM public.lay_so_lieu_dinh_gia(995101) WHERE khu_vuc_id = 995104),
  7, 'SAP_MO_BAN show inside sale window is simulated (7/10 seats sold in ban_nhanh)');
SELECT is(
  (SELECT n_sold FROM public.lay_so_lieu_dinh_gia(995101) WHERE khu_vuc_id = 995102),
  0, 'standing zone without GHE rows stays at n_sold=0');
SELECT is(
  (SELECT n_sold FROM public.lay_so_lieu_dinh_gia(995101) WHERE khu_vuc_id = 995103),
  0, 'closed show on Event A is skipped and has n_sold=0');
RESET ROLE;

-- Simulated timestamp survived W1 trigger (earliest ban_nhanh seat is < NOW() - 3h, not stamped with NOW())
SELECT is(
  (SELECT MIN("NgayCapNhatTrangThai") < NOW() - INTERVAL '3 hours'
      AND MAX("NgayCapNhatTrangThai") <= NOW()
     FROM public."GHE"
    WHERE "KhuVucID" = 995101 AND "TrangThai" = 'DA_BAN'),
  TRUE, 'ban_nhanh simulated timestamps survive W1 trigger and remain <= NOW()');

-- ACTIVE-hold seats and hold records stayed intact (995119 DANG_GIU, 995120 TRONG)
SELECT is(
  (SELECT "TrangThai" FROM public."GHE" WHERE "GheID" = 995119),
  'DANG_GIU', 'ACTIVE-hold seat 995119 stays DANG_GIU');
SELECT is(
  (SELECT "TrangThai" FROM public."GHE" WHERE "GheID" = 995120),
  'TRONG', 'TRONG seat 995120 linked to ACTIVE hold is not sold');
SELECT is(
  (SELECT ROW(gc."TrangThai", (SELECT count(*)::int FROM public."CHI_TIET_GIU_CHO" ct WHERE ct."GiuChoID" = gc."GiuChoID"))
     FROM public."GIU_CHO" gc WHERE gc."GiuChoID" = '99510000-0000-0000-0000-000000000001'),
  ROW('ACTIVE'::varchar, 2),
  'ACTIVE GIU_CHO and its 2 CHI_TIET_GIU_CHO rows remain intact');

-- Closed show & Event B seats untouched; MO_PHONG_GHE has zero rows for closed show or Event B
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "KhuVucID" = 995103 AND "TrangThai" <> 'TRONG'),
  0, 'closed show 995103 seats remain TRONG');
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "KhuVucID" = 995201 AND "TrangThai" <> 'TRONG'),
  0, 'other event 995201 seats remain untouched');
SELECT is(
  (SELECT count(*)::int FROM public."MO_PHONG_GHE" WHERE "SuKienID" = 995201 OR "SuatDienID" = 995103),
  0, 'MO_PHONG_GHE records nothing for closed show or other event');

-- Listed price & pricing tables untouched
SELECT is(
  (SELECT "GiaVeNiemYet" FROM public."KHU_VUC" WHERE "KhuVucID" = 995101),
  300000.00::numeric, 'simulator does not alter KHU_VUC.GiaVeNiemYet');

-- ============================================================================
-- 5. ban_cham & ban_deu produce distinct n_sold / so_ban_6h & clean reset (assertions 40-45)
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';

SELECT is(
  (public.mo_phong_nhu_cau(995101, 'ban_cham') -> 'datLai' ->> 'tong')::int,
  21, 'switching to ban_cham resets all 21 prior simulated seats (14 in 995101 + 7 in 995104)');
SELECT is(
  (SELECT ROW(n_sold, so_ban_6h)
     FROM public.lay_so_lieu_dinh_gia(995101) WHERE khu_vuc_id = 995101),
  ROW(2, 0),
  'ban_cham sells 2/20 seats outside the 6h window (n_sold=2, so_ban_6h=0)');

SELECT is(
  (public.mo_phong_nhu_cau(995101, 'ban_deu') -> 'datLai' ->> 'tong')::int,
  3, 'switching to ban_deu resets all 3 prior simulated seats (2 in 995101 + 1 in 995104)');
SELECT is(
  (SELECT ROW(n_sold, so_ban_6h)
     FROM public.lay_so_lieu_dinh_gia(995101) WHERE khu_vuc_id = 995101),
  ROW(7, 2),
  'ban_deu sells 7/20 seats spread over 20h window (n_sold=7, so_ban_6h=2)');
RESET ROLE;

-- ACTIVE-hold seat still DANG_GIU and Event B still untouched after all 3 scenarios
SELECT is(
  (SELECT "TrangThai" FROM public."GHE" WHERE "GheID" = 995119),
  'DANG_GIU', 'ACTIVE-hold seat stays DANG_GIU across scenario resets');
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "KhuVucID" = 995201 AND "TrangThai" <> 'TRONG'),
  0, 'Event B seats remain untouched across all scenario runs');

-- ============================================================================
-- 6. Diverged seat guard on reset + normal status UPDATE still gets now() (assertions 46-48)
-- ============================================================================
-- Externally mutate one simulated seat's timestamp; next run must skip resetting it
UPDATE public."GHE"
   SET "NgayCapNhatTrangThai" = NOW() - INTERVAL '1 minute'
 WHERE "GheID" = (
   SELECT "GheID" FROM public."MO_PHONG_GHE" WHERE "KhuVucID" = 995101 ORDER BY "GheID" LIMIT 1
 );

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';
SELECT is(
  (public.mo_phong_nhu_cau(995101, 'ban_cham') -> 'datLai' ->> 'boQuaDaThayDoi')::int,
  1, 'diverged simulated seat is skipped by reset and counted in datLai.boQuaDaThayDoi');
RESET ROLE;

-- Normal status UPDATE on a non-simulated seat (dedicated fixture 995599) still stamps now() via W1 trigger
UPDATE public."GHE"
   SET "NgayCapNhatTrangThai" = NOW() - INTERVAL '2 days'
 WHERE "GheID" = 995599;

UPDATE public."GHE"
   SET "TrangThai" = 'DA_BAN'
 WHERE "GheID" = 995599;

SELECT is(
  (SELECT "NgayCapNhatTrangThai" FROM public."GHE" WHERE "GheID" = 995599),
  NOW(), 'normal status UPDATE on GHE still receives now() from W1 trigger');

-- Also verify standing zone khongCoGhe, zone boQuaDangGiu, ban_cham biKepVaoCuaSo6h=0, and skipped shows in JSON output
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';
SELECT is(
  (SELECT ROW(
      (SELECT (z->>'khongCoGhe')::boolean
         FROM jsonb_array_elements(r->'khuVuc') AS z
        WHERE (z->>'khuVucId')::int = 995102),
      (SELECT (z->>'boQuaDangGiu')::int
         FROM jsonb_array_elements(r->'khuVuc') AS z
        WHERE (z->>'khuVucId')::int = 995101),
      (SELECT (z->>'biKepVaoCuaSo6h')::int
         FROM jsonb_array_elements(r->'khuVuc') AS z
        WHERE (z->>'khuVucId')::int = 995101),
      (SELECT (s->>'lyDo')
         FROM jsonb_array_elements(r->'suatBoQua') AS s
        WHERE (s->>'suatDienId')::bigint = 995103)
    )
    FROM (SELECT public.mo_phong_nhu_cau(995101, 'ban_cham') AS r) t),
  ROW(TRUE, 1, 0, 'KHONG_MO_BAN'),
  'JSON response marks standing zone khongCoGhe=true, boQuaDangGiu=1, biKepVaoCuaSo6h=0 (>7h open), and closed show KHONG_MO_BAN');
RESET ROLE;

-- ============================================================================
-- 7. Restore ACTIVE-hold guard & scenario ordering sanity (assertions 49-53)
-- ============================================================================
-- Attach an ACTIVE hold detail to one currently simulated DA_BAN seat in zone 995101.
-- Next run must NOT restore that seat; it stays DA_BAN in MO_PHONG_GHE and counts in datLai.boQuaDangKhoa.
INSERT INTO public."CHI_TIET_GIU_CHO" ("GiuChoID", "KhuVucID", "GheID", "MaVe", "SoLuong")
SELECT '99510000-0000-0000-0000-000000000001', 995101, g."GheID", g."MaGheDayDu", 1
  FROM public."GHE" g
 WHERE g."GheID" = (
   SELECT MIN(m."GheID") FROM public."MO_PHONG_GHE" m WHERE m."KhuVucID" = 995101
 );

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';
SELECT is(
  (SELECT ROW((r->'datLai'->>'tong')::int, (r->'datLai'->>'boQuaDangKhoa')::int)
     FROM (SELECT public.mo_phong_nhu_cau(995101, 'ban_cham') AS r) t),
  ROW(2, 1),
  'restore skips simulated seat linked to an ACTIVE hold (datLai.tong=2, boQuaDangKhoa=1)');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public."MO_PHONG_GHE" m
     JOIN public."CHI_TIET_GIU_CHO" ct ON ct."GheID" = m."GheID"
    WHERE m."KhuVucID" = 995101),
  1, 'held simulated seat remains in MO_PHONG_GHE bookkeeping');

-- Verify so_ban_6h ordering across ban_nhanh > ban_deu >= ban_cham from lay_so_lieu_dinh_gia (>7h open show)
-- Use separate statements so each call sees the previous scenario's committed-in-tx GHE state.
CREATE TEMP TABLE t4_vel_check (kich_ban TEXT PRIMARY KEY, so_ban_6h INT NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON t4_vel_check TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444401';
INSERT INTO t4_vel_check (kich_ban, so_ban_6h)
SELECT 'ban_cham', so_ban_6h FROM public.lay_so_lieu_dinh_gia(995101) WHERE khu_vuc_id = 995101;

DO $$ BEGIN PERFORM public.mo_phong_nhu_cau(995101, 'ban_deu'); END $$;
INSERT INTO t4_vel_check (kich_ban, so_ban_6h)
SELECT 'ban_deu', so_ban_6h FROM public.lay_so_lieu_dinh_gia(995101) WHERE khu_vuc_id = 995101;

DO $$ BEGIN PERFORM public.mo_phong_nhu_cau(995101, 'ban_nhanh'); END $$;
INSERT INTO t4_vel_check (kich_ban, so_ban_6h)
SELECT 'ban_nhanh', so_ban_6h FROM public.lay_so_lieu_dinh_gia(995101) WHERE khu_vuc_id = 995101;

SELECT ok(
  (SELECT n.so_ban_6h > d.so_ban_6h AND d.so_ban_6h >= c.so_ban_6h
     FROM t4_vel_check n, t4_vel_check d, t4_vel_check c
    WHERE n.kich_ban = 'ban_nhanh' AND d.kich_ban = 'ban_deu' AND c.kich_ban = 'ban_cham'),
  'lay_so_lieu_dinh_gia.so_ban_6h satisfies ban_nhanh > ban_deu >= ban_cham');
RESET ROLE;

SELECT is(
  (SELECT "TrangThai" FROM public."GIU_CHO" WHERE "GiuChoID" = '99510000-0000-0000-0000-000000000001'),
  'ACTIVE', 'ACTIVE hold record remains untouched after all simulator runs');
SELECT is(
  (SELECT count(*)::int FROM public."GHE" WHERE "KhuVucID" = 995201 AND "TrangThai" <> 'TRONG'),
  0, 'Event B seats remain untouched at end of test suite');

SELECT * FROM finish();
ROLLBACK;
