-- pgTAP acceptance test for Organizer Schedule + Artist-Lineup Authoring Vertical Slice:
-- Transactional aggregate save RPC with schedule and artists, tenant boundaries, idempotency,
-- in-place UPDATE branch verification, deletion safety, auto-forking shared artist protection,
-- intentional clearing of bio/image, controlled time validation, and draft RLS visibility.
BEGIN;
SELECT plan(20);

-- ----------------------------------------------------------------------------
-- FIXTURE SETUP IN FK-SAFE ORDER
-- ----------------------------------------------------------------------------

-- 1. Authentication users
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-lineup@example.com'),
  ('44444444-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'scanner-lineup@example.com')
ON CONFLICT (id) DO NOTHING;

-- 2. User profile records with explicit ORGANIZER classification
INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lineup Slice Owner', 'ORGANIZER'),
  ('44444444-cccc-cccc-cccc-cccccccccccc', 'Lineup Slice Scanner', 'ORGANIZER')
ON CONFLICT ("NguoiDungID") DO UPDATE
SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";

-- 3. Organization record
INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES ('22222222-0000-0000-0000-000000000001', 'Org Lineup Slice', 'org-lineup-slice')
ON CONFLICT ("ToChucID") DO NOTHING;

-- 4. Organization memberships (Owner has CHU_SO_HUU, Scanner has SOAT_VE)
INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('22222222-0000-0000-0000-000000000001', '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CHU_SO_HUU'),
  ('22222222-0000-0000-0000-000000000001', '44444444-cccc-cccc-cccc-cccccccccccc', 'SOAT_VE')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- ACCEPTANCE TESTS
-- ----------------------------------------------------------------------------

-- 1. Anonymous cannot call luu_su_kien_toan_dien
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien('{"name": "Anon Event"}'::jsonb) $$,
  '42501',
  'Can dang nhap de quan ly su kien',
  'Anonymous users cannot call luu_su_kien_toan_dien'
);

-- 2. Scanner role cannot call luu_su_kien_toan_dien
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '44444444-cccc-cccc-cccc-cccccccccccc';
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'organizationId', '22222222-0000-0000-0000-000000000001',
    'name', 'Scanner Event Attempt',
    'slug', 'scanner-event-attempt',
    'category', 'AM_NHAC'
  )) $$,
  '42501',
  'Khong co quyen bien tap su kien cua to chuc',
  'Scanner role cannot create event draft via luu_su_kien_toan_dien'
);
RESET ROLE;

-- 3. Owner creates event draft with schedule and artist lineup
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT set_config(
  'app.test_lineup_event_id',
  (public.luu_su_kien_toan_dien(jsonb_build_object(
    'organizationId', '22222222-0000-0000-0000-000000000001',
    'name', 'Hanoi Indie Music Fest 2026',
    'slug', 'hanoi-indie-music-fest-2026',
    'category', 'AM_NHAC',
    'slogan', 'Âm nhạc độc lập kết nối',
    'locationMode', 'OFFLINE',
    'venueName', 'Cung Điền Kinh',
    'address', 'Hà Nội',
    'bannerUrl', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
    'contactEmail', 'indie@hanoifest.vn',
    'contactHotline', '0901234567',
    'refundPolicy', 'Vé không hoàn hủy trừ khi BTC hủy sự kiện',
    'shows', jsonb_build_array(
      jsonb_build_object(
        'slug', 'dem-chinh',
        'name', 'Đêm diễn chính',
        'startsAt', (NOW() + INTERVAL '15 days')::text,
        'endsAt', (NOW() + INTERVAL '15 days 4 hours')::text,
        'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
        'saleEndsAt', (NOW() + INTERVAL '14 days')::text,
        'ticketTiers', jsonb_build_array(
          jsonb_build_object('code', 'GA_EARLY', 'name', 'Vé GA Early', 'price', 250000, 'capacity', 400)
        )
      )
    ),
    'schedule', jsonb_build_array(
      jsonb_build_object(
        'title', 'Mở cổng check-in và soát vé',
        'startTime', '16:00',
        'endTime', '17:30',
        'location', 'Cổng an ninh',
        'order', 1
      ),
      jsonb_build_object(
        'title', 'Set diễn Indie Opening',
        'startTime', '18:00',
        'endTime', '19:30',
        'location', 'Sân khấu A',
        'order', 2
      ),
      jsonb_build_object(
        'title', 'Headliner Performance',
        'startTime', '20:00',
        'endTime', '22:30',
        'location', 'Sân khấu chính',
        'order', 3
      )
    ),
    'artists', jsonb_build_array(
      jsonb_build_object(
        'name', 'Vũ.',
        'realName', 'Hoàng Thái Vũ',
        'role', 'Indie Pop / Ballad',
        'bio', 'Hoàng tử indie pop Việt Nam',
        'imageUrl', 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7',
        'order', 1
      ),
      jsonb_build_object(
        'name', 'Ngọt',
        'realName', 'Ban nhạc Ngọt',
        'role', 'Indie Rock',
        'imageUrl', 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad',
        'order', 2
      )
    )
  ))->>'eventId'),
  true
);
RESET ROLE;

-- 4. Verify schedule rows were persisted with correct attributes
SELECT is(
  (SELECT COUNT(*)::int FROM public."LICH_TRINH" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int),
  3,
  'Creates exactly 3 schedule rows for the event'
);

-- 5. Verify schedule row times and ordering
SELECT is(
  (SELECT "TenHoatDong" FROM public."LICH_TRINH" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int AND "ThuTu" = 1),
  'Mở cổng check-in và soát vé',
  'First schedule item matches title'
);

-- 6. Verify artist master records and event links were persisted
SELECT is(
  (SELECT COUNT(*)::int FROM public."SU_KIEN_NGHE_SI" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int),
  2,
  'Creates exactly 2 artist links for the event'
);

-- 7. Verify artist link joins master artist profile correctly
SELECT is(
  (SELECT ns."NgheDanh"
   FROM public."SU_KIEN_NGHE_SI" skns
   JOIN public."NGHE_SI" ns ON ns."NgheSiID" = skns."NgheSiID"
   WHERE skns."SuKienID" = current_setting('app.test_lineup_event_id')::int AND skns."ThuTuHienThi" = 1),
  'Vũ.',
  'First linked artist resolves stage name Vũ.'
);

-- Capture the generated LichTrinhID for the first schedule item to exercise in-place UPDATE
SELECT set_config(
  'app.test_first_sched_id',
  (SELECT "LichTrinhID"::text FROM public."LICH_TRINH" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int AND "ThuTu" = 1),
  true
);

-- Capture Vũ's NgheSiID
SELECT set_config(
  'app.test_vu_artist_id',
  (SELECT ns."NgheSiID"::text
   FROM public."SU_KIEN_NGHE_SI" skns
   JOIN public."NGHE_SI" ns ON ns."NgheSiID" = skns."NgheSiID"
   WHERE skns."SuKienID" = current_setting('app.test_lineup_event_id')::int AND ns."NgheDanh" = 'Vũ.'),
  true
);

-- 8. Repeat save with captured scheduleId to exercise the in-place UPDATE branch
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
  'eventId', current_setting('app.test_lineup_event_id')::int,
  'organizationId', '22222222-0000-0000-0000-000000000001',
  'name', 'Hanoi Indie Music Fest 2026',
  'slug', 'hanoi-indie-music-fest-2026',
  'category', 'AM_NHAC',
  'locationMode', 'OFFLINE',
  'shows', jsonb_build_array(
    jsonb_build_object(
      'slug', 'dem-chinh',
      'name', 'Đêm diễn chính',
      'startsAt', (NOW() + INTERVAL '15 days')::text,
      'endsAt', (NOW() + INTERVAL '15 days 4 hours')::text,
      'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
      'saleEndsAt', (NOW() + INTERVAL '14 days')::text,
      'ticketTiers', jsonb_build_array(
        jsonb_build_object('code', 'GA_EARLY', 'name', 'Vé GA Early', 'price', 250000, 'capacity', 400)
      )
    )
  ),
  'schedule', jsonb_build_array(
    jsonb_build_object(
      'scheduleId', current_setting('app.test_first_sched_id')::int,
      'title', 'Mở cổng check-in an ninh VIP & GA',
      'startTime', '16:00',
      'endTime', '17:30',
      'order', 1
    )
  ),
  'artists', jsonb_build_array(
    jsonb_build_object(
      'artistId', current_setting('app.test_vu_artist_id')::int,
      'name', 'Vũ.',
      'role', 'Special Acoustic Headliner',
      'bio', '',
      'imageUrl', '',
      'order', 1
    )
  )
));
RESET ROLE;

-- 9. Retained schedule row preserves identical LichTrinhID via UPDATE in place
SELECT is(
  (SELECT "LichTrinhID"::int FROM public."LICH_TRINH" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int),
  current_setting('app.test_first_sched_id')::int,
  'Retained schedule row preserves identical LichTrinhID via UPDATE in place'
);

-- 10. Verify schedule omission deletion: 2 items omitted, exactly 1 remains
SELECT is(
  (SELECT COUNT(*)::int FROM public."LICH_TRINH" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int),
  1,
  'Omitted schedule rows safely removed'
);

-- 11. Verify updated schedule item has new title
SELECT is(
  (SELECT "TenHoatDong" FROM public."LICH_TRINH" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int),
  'Mở cổng check-in an ninh VIP & GA',
  'Retained schedule item updated with new title'
);

-- 12. Verify artist link count is now 1 (omitted link removed)
SELECT is(
  (SELECT COUNT(*)::int FROM public."SU_KIEN_NGHE_SI" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int),
  1,
  'Omitted artist link safely removed from SU_KIEN_NGHE_SI'
);

-- 13. Safe master artist retention: master record 'Ngọt' must NOT be deleted from NGHE_SI
SELECT ok(
  EXISTS (SELECT 1 FROM public."NGHE_SI" WHERE "NgheDanh" = 'Ngọt'),
  'Master artist row in NGHE_SI is never deleted when unlinked from event'
);

-- 14. Support intentionally clearing bio/image for an unshared artist: explicit empty string clears to NULL
SELECT ok(
  (SELECT "TieuSu" IS NULL AND "HinhAnhURL" IS NULL
   FROM public."NGHE_SI"
   WHERE "NgheSiID" = current_setting('app.test_vu_artist_id')::int),
  'Intentionally clearing bio and image on unshared artist sets columns to NULL'
);

-- Setup a second event to test shared artist master behavior
INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "TheLoai", "TemplateKey",
  "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "ThoiGianDongBanVe",
  "DiaDiem", "TenSanVanDong", "SucChua", "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  777, 'Shared Showcase 2026', 'shared-showcase-2026', '22222222-0000-0000-0000-000000000001',
  'AM_NHAC', 'DEFAULT', NOW() + INTERVAL '20 days', NOW() + INTERVAL '20 days 3 hours',
  NOW() + INTERVAL '2 days', NOW() + INTERVAL '19 days',
  'Hà Nội', 'Sân Mỹ Đình', 1000, 'SAP_MO_BAN', 'BAN_NHAP'
) ON CONFLICT ("SuKienID") DO NOTHING;

-- Create shared master artist 'Suboi' linked to Event 777
INSERT INTO public."NGHE_SI" ("NgheSiID", "HoTen", "NgheDanh", "VaiTroChinh", "TieuSu", "HinhAnhURL")
VALUES (888, 'Hàng Lâm Trang Anh', 'Suboi', 'Hip-hop / Rap', 'Queen of Rap', 'https://example.com/suboi.jpg')
ON CONFLICT ("NgheSiID") DO UPDATE
SET "TieuSu" = 'Queen of Rap', "HinhAnhURL" = 'https://example.com/suboi.jpg';

INSERT INTO public."SU_KIEN_NGHE_SI" ("SuKienID", "NgheSiID", "VaiTroTrongSuKien", "ThuTuHienThi")
VALUES (777, 888, 'Special Guest', 1)
ON CONFLICT DO NOTHING;

-- 15. Shared artist with unchanged profile reuses shared master without auto-forking
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
  'eventId', current_setting('app.test_lineup_event_id')::int,
  'organizationId', '22222222-0000-0000-0000-000000000001',
  'name', 'Hanoi Indie Music Fest 2026',
  'slug', 'hanoi-indie-music-fest-2026',
  'category', 'AM_NHAC',
  'locationMode', 'OFFLINE',
  'artists', jsonb_build_array(
    jsonb_build_object(
      'artistId', 888,
      'name', 'Suboi',
      'realName', 'Hàng Lâm Trang Anh',
      'role', 'Hip-hop / Rap',
      'bio', 'Queen of Rap',
      'imageUrl', 'https://example.com/suboi.jpg',
      'order', 1
    )
  )
));
RESET ROLE;

SELECT is(
  (SELECT "NgheSiID"::int FROM public."SU_KIEN_NGHE_SI" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int),
  888,
  'Shared artist with unchanged profile reuses shared master NgheSiID 888 without auto-forking'
);

-- 16. Shared artist with CHANGED profile auto-forks a new NGHE_SI row and leaves original shared row untouched
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
  'eventId', current_setting('app.test_lineup_event_id')::int,
  'organizationId', '22222222-0000-0000-0000-000000000001',
  'name', 'Hanoi Indie Music Fest 2026',
  'slug', 'hanoi-indie-music-fest-2026',
  'category', 'AM_NHAC',
  'locationMode', 'OFFLINE',
  'artists', jsonb_build_array(
    jsonb_build_object(
      'artistId', 888,
      'name', 'Suboi',
      'realName', 'Hàng Lâm Trang Anh',
      'role', 'Alternative Rap Headliner',
      'bio', 'Modified bio for Indie Fest',
      'imageUrl', 'https://example.com/suboi-alt.jpg',
      'order', 1
    )
  )
));
RESET ROLE;

SELECT ok(
  (SELECT "NgheSiID" <> 888 FROM public."SU_KIEN_NGHE_SI" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int)
  AND (SELECT "TieuSu" = 'Queen of Rap' FROM public."NGHE_SI" WHERE "NgheSiID" = 888),
  'Shared artist with changed profile auto-forks new NGHE_SI row and leaves original shared row untouched'
);

-- 17. Forged scheduleId from another event is rejected with 42501
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'eventId', current_setting('app.test_lineup_event_id')::int,
    'organizationId', '22222222-0000-0000-0000-000000000001',
    'name', 'Hanoi Indie Music Fest 2026',
    'slug', 'hanoi-indie-music-fest-2026',
    'category', 'AM_NHAC',
    'locationMode', 'OFFLINE',
    'schedule', jsonb_build_array(
      jsonb_build_object('scheduleId', 999999, 'title', 'Forged Item', 'startTime', '10:00', 'endTime', '11:00')
    )
  )) $$,
  '42501',
  'Muc lich trinh khong ton tai hoac khong thuoc su kien dang thao tac',
  'Forged scheduleId from another event is rejected with 42501'
);
RESET ROLE;

-- 18. Malformed schedule time (endTime <= startTime) is rejected with 22023
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'eventId', current_setting('app.test_lineup_event_id')::int,
    'organizationId', '22222222-0000-0000-0000-000000000001',
    'name', 'Hanoi Indie Music Fest 2026',
    'slug', 'hanoi-indie-music-fest-2026',
    'category', 'AM_NHAC',
    'locationMode', 'OFFLINE',
    'schedule', jsonb_build_array(
      jsonb_build_object('title', 'Invalid Time Item', 'startTime', '18:00', 'endTime', '17:00')
    )
  )) $$,
  '22023',
  'Gio ket thuc hoat dong phai sau gio bat dau',
  'Schedule item with endTime <= startTime is rejected with 22023'
);
RESET ROLE;

-- 19. Empty startTime produces controlled 22023 rather than raw 22007 cast failure
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'eventId', current_setting('app.test_lineup_event_id')::int,
    'organizationId', '22222222-0000-0000-0000-000000000001',
    'name', 'Hanoi Indie Music Fest 2026',
    'slug', 'hanoi-indie-music-fest-2026',
    'category', 'AM_NHAC',
    'locationMode', 'OFFLINE',
    'schedule', jsonb_build_array(
      jsonb_build_object('title', 'Empty Time Item', 'startTime', '', 'endTime', '17:00')
    )
  )) $$,
  '22023',
  'Moc thoi gian cua muc lich trinh khong duoc de trong',
  'Schedule item with empty startTime produces controlled 22023 rather than raw 22007'
);
RESET ROLE;

-- 20. Draft schedule visibility for organization member via RLS
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT COUNT(*)::int FROM public."LICH_TRINH" WHERE "SuKienID" = current_setting('app.test_lineup_event_id')::int),
  1,
  'Organization member can read draft schedule via RLS policy'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
