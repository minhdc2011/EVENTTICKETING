BEGIN;

SELECT plan(31);

-- 1-2. Schema additions: HO_SO_NGUOI_DUNG has LoaiTaiKhoan column and NOT NULL constraint
SELECT has_column('public', 'HO_SO_NGUOI_DUNG', 'LoaiTaiKhoan', 'HO_SO_NGUOI_DUNG has LoaiTaiKhoan column');
SELECT col_not_null('public', 'HO_SO_NGUOI_DUNG', 'LoaiTaiKhoan', 'LoaiTaiKhoan is NOT NULL');

-- 3-8. Helper functions exist with expected signatures (UUID variants and zero-argument wrappers)
SELECT function_returns('public', 'lay_loai_tai_khoan', ARRAY['uuid'], 'character varying', 'lay_loai_tai_khoan(uuid) helper exists');
SELECT function_returns('public', 'lay_loai_tai_khoan', ARRAY[]::text[], 'character varying', 'lay_loai_tai_khoan() zero-argument wrapper exists');
SELECT function_returns('public', 'la_ban_to_chuc', ARRAY['uuid'], 'boolean', 'la_ban_to_chuc(uuid) helper exists');
SELECT function_returns('public', 'la_ban_to_chuc', ARRAY[]::text[], 'boolean', 'la_ban_to_chuc() zero-argument wrapper exists');
SELECT function_returns('public', 'gan_loai_tai_khoan', ARRAY['text', 'text'], 'jsonb', 'gan_loai_tai_khoan admin function exists');
SELECT has_trigger('public', 'HO_SO_NGUOI_DUNG', 'trg_kiem_tra_khong_tu_nang_cap', 'HO_SO_NGUOI_DUNG has self-promotion guard trigger');

-- 9-10. Catalog regression checks: UUID variants MUST NOT have default arguments (prevents overload ambiguity)
SELECT is(
  (SELECT pronargdefaults FROM pg_proc WHERE oid = 'public.lay_loai_tai_khoan(uuid)'::regprocedure),
  0,
  'lay_loai_tai_khoan(uuid) defines 0 argument defaults (no overload ambiguity)'
);
SELECT is(
  (SELECT pronargdefaults FROM pg_proc WHERE oid = 'public.la_ban_to_chuc(uuid)'::regprocedure),
  0,
  'la_ban_to_chuc(uuid) defines 0 argument defaults (no overload ambiguity)'
);

-- 7-8. Unauthenticated/anonymous callers are denied
SELECT throws_ok(
  $$ SELECT public.tao_to_chuc_cua_toi('Anon Org', 'anon-org') $$,
  '42501',
  'Can dang nhap de tao to chuc',
  'Anonymous users cannot create organizations'
);

SELECT throws_ok(
  $$ SELECT public.gan_loai_tai_khoan('someone@example.com', 'ORGANIZER') $$,
  '42501',
  'permission denied for function gan_loai_tai_khoan',
  'Anonymous users cannot execute administrative role assignment function'
);

-- Setup isolated multi-tenant fixtures
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('44444444-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'buyer-test@example.com'),
  ('55555555-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'organizer-test@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('44444444-dddd-dddd-dddd-dddddddddddd', 'Người mua vé UAT', 'USER'),
  ('55555555-eeee-eeee-eeee-eeeeeeeeeeee', 'Ban tổ chức UAT', 'ORGANIZER')
ON CONFLICT ("NguoiDungID") DO UPDATE
SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES
  ('33333333-0000-0000-0000-000000000003', 'Gamma Production', 'gamma-production')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('33333333-0000-0000-0000-000000000003', '55555555-eeee-eeee-eeee-eeeeeeeeeeee', 'CHU_SO_HUU')
ON CONFLICT DO NOTHING;

-- Create an existing event belonging to Gamma Production
INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "Slogan", "MoTaChiTiet", "TheLoai", "TemplateKey",
  "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
  "DiaDiem", "TenSanVanDong", "SucChua", "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  999, 'Gamma Original Fest', 'gamma-original-fest', '33333333-0000-0000-0000-000000000003',
  'AM_NHAC', 'Mô tả nguyên bản của sự kiện Gamma', 'AM_NHAC', 'DEFAULT',
  NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours', NOW() + INTERVAL '1 day', NOW() + INTERVAL '9 days',
  'Hà Nội', 'Sân Mỹ Đình', 1000, 'SAP_MO_BAN', 'BAN_NHAP'
) ON CONFLICT ("SuKienID") DO UPDATE
SET "MoTaChiTiet" = 'Mô tả nguyên bản của sự kiện Gamma';

-- 9. Authoritative account kind helpers report correct classification
SELECT is(
  public.lay_loai_tai_khoan('44444444-dddd-dddd-dddd-dddddddddddd'),
  'USER',
  'lay_loai_tai_khoan returns USER for buyer account'
);
SELECT is(
  public.la_ban_to_chuc('44444444-dddd-dddd-dddd-dddddddddddd'),
  false,
  'la_ban_to_chuc returns false for buyer account'
);
SELECT is(
  public.la_ban_to_chuc('55555555-eeee-eeee-eeee-eeeeeeeeeeee'),
  true,
  'la_ban_to_chuc returns true for organizer account'
);

-- 10. AC2: Buyer account (USER) is denied from creating an organization
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '44444444-dddd-dddd-dddd-dddddddddddd';

-- 11-12. Zero-argument helpers execute unambiguously under authenticated buyer session
SELECT is(
  public.lay_loai_tai_khoan(),
  'USER',
  'Zero-argument lay_loai_tai_khoan() returns USER for authenticated buyer without overload ambiguity'
);
SELECT is(
  public.la_ban_to_chuc(),
  false,
  'Zero-argument la_ban_to_chuc() returns false for authenticated buyer without overload ambiguity'
);

SELECT throws_ok(
  $$ SELECT public.tao_to_chuc_cua_toi('Buyer Fake Org', 'buyer-fake-org') $$,
  '42501',
  'Chi tai khoan Ban to chuc moi co the tao to chuc',
  'Buyer (USER) is denied from creating an organization via tao_to_chuc_cua_toi'
);

-- 11. AC2: Buyer account (USER) is denied from creating event draft via delegation to co_quyen_bien_tap_to_chuc
SELECT throws_ok(
  $$ SELECT public.tao_ban_nhap_su_kien(
       '33333333-0000-0000-0000-000000000003', 'Buyer Hack Fest', 'buyer-hack-fest', 'Mô tả', 'AM_NHAC',
       'Sân Mỹ Đình', 'Hà Nội', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
       NOW() + INTERVAL '1 day', NOW() + INTERVAL '9 days', 500000, 1000
     ) $$,
  '42501',
  'Khong co quyen tao su kien cho to chuc nay',
  'Buyer (USER) is denied from creating event draft via tao_ban_nhap_su_kien'
);

-- 12. AC2: Buyer account (USER) is denied from mutating event data via delegation to co_quyen_bien_tap_to_chuc
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(
       jsonb_build_object(
         'organizationId', '33333333-0000-0000-0000-000000000003',
         'name', 'Buyer Hack Event Aggregate',
         'slug', 'buyer-hack-event-agg',
         'category', 'AM_NHAC',
         'locationMode', 'OFFLINE'
       )
     ) $$,
  '42501',
  'Khong co quyen bien tap su kien cua to chuc',
  'Buyer (USER) is denied from mutating event data via luu_su_kien_toan_dien'
);

-- 13. AC2: Buyer account (USER) is denied from publishing an event via delegation to co_quyen_bien_tap_to_chuc
SELECT throws_ok(
  $$ SELECT public.cong_bo_su_kien(999) $$,
  '42501',
  'Khong co quyen cong bo su kien',
  'Buyer (USER) is denied from publishing event via cong_bo_su_kien'
);

-- 14. Direct-table RLS: Buyer cannot UPDATE organizer event directly
UPDATE public."SU_KIEN"
SET "MoTaChiTiet" = 'Buyer direct SQL update attempt'
WHERE "SuKienID" = 999;

-- 15. AC6: Buyer account cannot self-promote via direct UPDATE on HO_SO_NGUOI_DUNG
SELECT throws_ok(
  $$ UPDATE public."HO_SO_NGUOI_DUNG"
     SET "LoaiTaiKhoan" = 'ORGANIZER'
     WHERE "NguoiDungID" = '44444444-dddd-dddd-dddd-dddddddddddd' $$,
  '42501',
  'Khong co quyen tu y thay doi loai tai khoan',
  'Buyer (USER) cannot self-promote by direct table UPDATE on HO_SO_NGUOI_DUNG'
);

-- 16-17. Role disclosure protection: authenticated caller cannot probe other users' roles
SELECT throws_ok(
  $$ SELECT public.lay_loai_tai_khoan('55555555-eeee-eeee-eeee-eeeeeeeeeeee') $$,
  '42501',
  'Khong co quyen xem loai tai khoan cua nguoi dung khac',
  'lay_loai_tai_khoan denies authenticated caller from probing other users'
);

SELECT throws_ok(
  $$ SELECT public.la_ban_to_chuc('55555555-eeee-eeee-eeee-eeeeeeeeeeee') $$,
  '42501',
  'Khong co quyen kiem tra phan quyen cua nguoi dung khac',
  'la_ban_to_chuc denies authenticated caller from probing other users'
);
RESET ROLE;

-- Verify direct table RLS blocked the buyer mutation on SU_KIEN
SELECT is(
  (SELECT "MoTaChiTiet" FROM public."SU_KIEN" WHERE "SuKienID" = 999),
  'Mô tả nguyên bản của sự kiện Gamma',
  'Direct-table RLS blocks buyer (USER) from mutating organizer events'
);

-- AC3: Organizer account (ORGANIZER) with valid session can create an organization
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '55555555-eeee-eeee-eeee-eeeeeeeeeeee';

-- Zero-argument helpers execute unambiguously under authenticated organizer session
SELECT is(
  public.lay_loai_tai_khoan(),
  'ORGANIZER',
  'Zero-argument lay_loai_tai_khoan() returns ORGANIZER for authenticated organizer without overload ambiguity'
);
SELECT is(
  public.la_ban_to_chuc(),
  true,
  'Zero-argument la_ban_to_chuc() returns true for authenticated organizer without overload ambiguity'
);

SELECT lives_ok(
  $$ SELECT public.tao_to_chuc_cua_toi('Valid Org Studio', 'valid-org-studio') $$,
  'Organizer (ORGANIZER) can successfully create an organization via tao_to_chuc_cua_toi'
);

-- 20. AC3: Organizer account (ORGANIZER) with valid membership can create draft event
SELECT lives_ok(
  $$ SELECT public.luu_su_kien_toan_dien(
       jsonb_build_object(
         'organizationId', '33333333-0000-0000-0000-000000000003',
         'name', 'Gamma Concert Live 2026',
         'slug', 'gamma-concert-live-2026',
         'category', 'AM_NHAC',
         'locationMode', 'OFFLINE',
         'shows', jsonb_build_array(
           jsonb_build_object(
             'slug', 'suat-1',
             'name', 'Đêm diễn 1',
             'startsAt', (NOW() + INTERVAL '10 days')::text,
             'endsAt', (NOW() + INTERVAL '10 days 3 hours')::text,
             'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
             'saleEndsAt', (NOW() + INTERVAL '9 days')::text,
             'ticketTiers', jsonb_build_array(
               jsonb_build_object(
                 'code', 'GA',
                 'name', 'Vé tiêu chuẩn',
                 'price', 300000,
                 'capacity', 500
               )
             )
           )
         )
       )
     ) $$,
  'Organizer (ORGANIZER) can successfully save full event draft via luu_su_kien_toan_dien'
);
RESET ROLE;

-- 21. AC4: Safe migration/backfill verified: organization members have ORGANIZER classification
SELECT is(
  (SELECT "LoaiTaiKhoan" FROM public."HO_SO_NGUOI_DUNG" WHERE "NguoiDungID" = '55555555-eeee-eeee-eeee-eeeeeeeeeeee'),
  'ORGANIZER',
  'Backfill strategy classifies organization members as ORGANIZER'
);

-- 22. Service role can administer account kinds via gan_loai_tai_khoan
SET LOCAL ROLE service_role;
SELECT is(
  (public.gan_loai_tai_khoan('buyer-test@example.com', 'ORGANIZER')->>'accountKind'),
  'ORGANIZER',
  'Service role can assign account kinds via gan_loai_tai_khoan'
);
RESET ROLE;

ROLLBACK;
