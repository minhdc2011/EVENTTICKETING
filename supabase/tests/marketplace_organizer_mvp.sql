BEGIN;

SELECT plan(23);

-- 1-2. Schema additions
SELECT has_column('public', 'SU_KIEN', 'TemplateKey', 'Event has a template key');
SELECT has_column('public', 'SU_KIEN', 'TheLoai', 'Event has a marketplace category');

-- 3-6. Security and onboarding RPCs exist with expected signatures
SELECT function_returns('public', 'tao_to_chuc_cua_toi', ARRAY['text','text'], 'jsonb', 'Organization onboarding RPC exists');
SELECT function_returns('public', 'tao_ban_nhap_su_kien', ARRAY['uuid','text','text','text','text','text','text','timestamp with time zone','timestamp with time zone','timestamp with time zone','timestamp with time zone','numeric','integer'], 'jsonb', 'Draft event creation RPC exists');
SELECT function_returns('public', 'cong_bo_su_kien', ARRAY['integer'], 'boolean', 'Publish RPC exists');
SELECT function_returns('public', 'co_quyen_bien_tap_to_chuc', ARRAY['uuid'], 'boolean', 'Editor permission check helper exists');

-- 7. Trigger guarding against direct client-write bypass
SELECT has_trigger('public', 'SU_KIEN', 'trg_kiem_tra_cong_bo_su_kien', 'SU_KIEN has publish validation trigger');

-- 8-9. Backward compatibility for Event 1 (Super Concert 2026)
SELECT is((SELECT "TemplateKey" FROM public."SU_KIEN" WHERE "SuKienID" = 1), 'SUPER_CONCERT_2026', 'Existing concert keeps its custom template');
SELECT is((SELECT "TheLoai" FROM public."SU_KIEN" WHERE "SuKienID" = 1), 'AM_NHAC', 'Existing concert is categorized');

-- 10-12. Anonymous user restrictions (unauthenticated context)
SELECT throws_ok($$ SELECT public.tao_to_chuc_cua_toi('Test Org', 'test-org') $$, '42501', 'Can dang nhap de tao to chuc', 'Anonymous users cannot create organizations');
SELECT throws_ok(
  $$ SELECT public.tao_ban_nhap_su_kien(
       '00000000-0000-0000-0000-000000000001', 'Anon Event', 'anon-event', 'Mô tả', 'AM_NHAC',
       'Sân Mỹ Đình', 'Hà Nội', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
       NOW() + INTERVAL '1 day', NOW() + INTERVAL '9 days', 500000, 1000
     ) $$,
  '42501',
  'Khong co quyen tao su kien cho to chuc nay',
  'Anonymous users cannot create event drafts'
);
SELECT throws_ok($$ SELECT public.cong_bo_su_kien(-999) $$, '42501', 'Khong co quyen cong bo su kien', 'Anonymous users cannot publish events');

-- Setup isolated multi-tenant fixtures within transaction (plain SQL, Supabase SQL Editor compatible)
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.com'),
  ('22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.com'),
  ('33333333-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'scanner-a@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Org Alpha', 'org-alpha'),
  ('22222222-0000-0000-0000-000000000002', 'Org Beta', 'org-beta')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('11111111-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CHU_SO_HUU'),
  ('22222222-0000-0000-0000-000000000002', '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CHU_SO_HUU'),
  ('11111111-0000-0000-0000-000000000001', '33333333-cccc-cccc-cccc-cccccccccccc', 'SOAT_VE')
ON CONFLICT DO NOTHING;

-- 13. Multi-tenant boundary: User A cannot create an event for Org Beta
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT throws_ok(
  $$ SELECT public.tao_ban_nhap_su_kien(
       '22222222-0000-0000-0000-000000000002', 'Event In Beta', 'event-in-beta', 'Mô tả', 'AM_NHAC',
       'Sân Mỹ Đình', 'Hà Nội', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 3 hours',
       NOW() + INTERVAL '1 day', NOW() + INTERVAL '9 days', 500000, 1000
     ) $$,
  '42501',
  'Khong co quyen tao su kien cho to chuc nay',
  'Member of Org Alpha cannot create draft for Org Beta'
);

-- User A creates a valid draft in Org Alpha and stores ID via transaction config
SELECT set_config(
  'app.test_alpha_event_id',
  (public.tao_ban_nhap_su_kien(
    '11111111-0000-0000-0000-000000000001', 'Alpha Rock Fest', 'alpha-rock-fest', 'Mô tả chi tiết', 'AM_NHAC',
    'Cung Điền Kinh', 'Trần Hữu Dực, Hà Nội', NOW() + INTERVAL '15 days', NOW() + INTERVAL '15 days 4 hours',
    NOW() + INTERVAL '2 days', NOW() + INTERVAL '14 days', 350000, 2000
  )->>'eventId'),
  true
);
RESET ROLE;

-- 14. Direct-table RLS: Scanner cannot UPDATE Org Alpha event
-- Attempt mutation under restricted scanner role, then verify in trusted verification context
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '33333333-cccc-cccc-cccc-cccccccccccc';
UPDATE public."SU_KIEN"
SET "MoTaChiTiet" = 'Scanner update attempt'
WHERE "SuKienID" = current_setting('app.test_alpha_event_id')::int;
RESET ROLE;

SELECT is(
  (SELECT "MoTaChiTiet" FROM public."SU_KIEN" WHERE "SuKienID" = current_setting('app.test_alpha_event_id')::int),
  'Mô tả chi tiết',
  'Scanner cannot UPDATE event via direct table write (RLS blocks mutation)'
);

-- 15. Direct-table RLS: Org B owner cannot UPDATE Org A event
-- Attempt mutation under Org B owner, then RESET ROLE before asserting stored value is unchanged
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
UPDATE public."SU_KIEN"
SET "MoTaChiTiet" = 'Org B hijack attempt'
WHERE "SuKienID" = current_setting('app.test_alpha_event_id')::int;
RESET ROLE;

SELECT is(
  (SELECT "MoTaChiTiet" FROM public."SU_KIEN" WHERE "SuKienID" = current_setting('app.test_alpha_event_id')::int),
  'Mô tả chi tiết',
  'Org B owner cannot UPDATE Org A event via direct table write'
);

-- 16-17. Direct-table RLS: Org A owner can UPDATE its own draft without publishing
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
UPDATE public."SU_KIEN"
SET "MoTaChiTiet" = 'Mô tả cập nhật bởi chủ sở hữu'
WHERE "SuKienID" = current_setting('app.test_alpha_event_id')::int;
RESET ROLE;

SELECT is(
  (SELECT "MoTaChiTiet" FROM public."SU_KIEN" WHERE "SuKienID" = current_setting('app.test_alpha_event_id')::int),
  'Mô tả cập nhật bởi chủ sở hữu',
  'Org A owner can update its own draft via direct table write without publishing'
);

SELECT is(
  (SELECT "TrangThaiCongBo" FROM public."SU_KIEN" WHERE "SuKienID" = current_setting('app.test_alpha_event_id')::int),
  'BAN_NHAP',
  'Direct table update by owner preserves BAN_NHAP draft status'
);

-- 18. Multi-tenant publish RPC: User B (Org Beta) cannot publish Org Alpha event
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT throws_ok(
  $$ SELECT public.cong_bo_su_kien(current_setting('app.test_alpha_event_id')::int) $$,
  '42501',
  'Khong co quyen cong bo su kien',
  'Member of Org Beta cannot publish Org Alpha event'
);
RESET ROLE;

-- 19. Role boundary publish RPC: Scanner role in Org Alpha cannot publish event
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '33333333-cccc-cccc-cccc-cccccccccccc';
SELECT throws_ok(
  $$ SELECT public.cong_bo_su_kien(current_setting('app.test_alpha_event_id')::int) $$,
  '42501',
  'Khong co quyen cong bo su kien',
  'Scanner role cannot publish event'
);
RESET ROLE;

-- Setup an unsellable event fixture with zero capacity using plain SQL
INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  999991, 'No Zone Event', 'no-zone-event', '11111111-0000-0000-0000-000000000001',
  NOW() + INTERVAL '20 days', NOW() + INTERVAL '20 days 2 hours',
  NOW() + INTERVAL '1 day', NOW() + INTERVAL '19 days', 'Hà Nội', 'Venue X',
  'SAP_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "ThoiGianDongBanVe", "TrangThai"
) VALUES (
  999991, 999991, 'suat-1', 'Suất 1',
  NOW() + INTERVAL '20 days', NOW() + INTERVAL '20 days 2 hours',
  NOW() + INTERVAL '1 day', NOW() + INTERVAL '19 days', 'BAN_NHAP'
);

INSERT INTO public."KHU_VUC" (
  "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "MauSacHex", "TongSoGhe"
) VALUES (
  999991, 999991, 'ZERO_CAP', 'Khu Hết Chỗ', 'DUNG_STAND', 100000, '#ff0000', 0
);

-- 20. Publish validation: Event with no sellable zone (capacity 0) cannot be published
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT throws_ok(
  $$ SELECT public.cong_bo_su_kien(999991) $$,
  '23514',
  'Su kien chua co suat dien va phan khu hop le',
  'Cannot publish an event whose show has no sellable zone (capacity 0)'
);

-- 21. Direct client-write bypass: Cannot bypass cong_bo_su_kien via direct UPDATE on SU_KIEN
SELECT throws_ok(
  $$ UPDATE public."SU_KIEN" SET "TrangThaiCongBo" = 'CONG_KHAI' WHERE "SuKienID" = 999991 $$,
  '23514',
  'Su kien chua co suat dien va phan khu hop le',
  'Trigger prevents direct client-write bypass to CONG_KHAI when show is draft/unsellable'
);
RESET ROLE;

-- 22. Valid publish succeeds under authorized Org A editor
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  public.cong_bo_su_kien(current_setting('app.test_alpha_event_id')::int),
  TRUE,
  'Publishing valid event with sellable zone returns TRUE'
);
RESET ROLE;

-- 23. Atomic state transition: event is CONG_KHAI and draft show is now SAP_MO_BAN
SELECT is(
  (SELECT ("TrangThaiCongBo" = 'CONG_KHAI' AND sd."TrangThai" = 'SAP_MO_BAN')
   FROM public."SU_KIEN" sk
   JOIN public."SUAT_DIEN" sd ON sd."SuKienID" = sk."SuKienID"
   WHERE sk."SuKienID" = current_setting('app.test_alpha_event_id')::int),
  TRUE,
  'Published event transitions atomically to CONG_KHAI and show to SAP_MO_BAN'
);

SELECT * FROM finish();
ROLLBACK;
