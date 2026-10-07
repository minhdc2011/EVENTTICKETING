-- pgTAP acceptance test for Organizer Event Creation Slice:
-- Multi-show, multi-tier aggregate RPC, permissive draft, strict publish, RLS boundaries, and commercial locks.
BEGIN;
SELECT plan(19);

-- Fixture setup
INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES ('11111111-0000-0000-0000-000000000001', 'Org Alpha Slice', 'org-alpha-slice')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('11111111-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CHU_SO_HUU'),
  ('11111111-0000-0000-0000-000000000001', '33333333-cccc-cccc-cccc-cccccccccccc', 'SOAT_VE')
ON CONFLICT DO NOTHING;

-- 1-3. Verify additive columns exist on tables
SELECT has_column('public', 'SU_KIEN', 'LoaiHinhSuKien', 'SU_KIEN has LoaiHinhSuKien');
SELECT has_column('public', 'SUAT_DIEN', 'ThoiGianMoCua', 'SUAT_DIEN has ThoiGianMoCua');
SELECT has_column('public', 'KHU_VUC', 'SoVeToiDaMoiDon', 'KHU_VUC has SoVeToiDaMoiDon');

-- 4. Anonymous cannot call luu_su_kien_toan_dien
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien('{"name": "Anon Event"}'::jsonb) $$,
  '42501',
  'Can dang nhap de quan ly su kien',
  'Anonymous users cannot call luu_su_kien_toan_dien'
);

-- 5. Scanner role cannot call luu_su_kien_toan_dien
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '33333333-cccc-cccc-cccc-cccccccccccc';
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'organizationId', '11111111-0000-0000-0000-000000000001',
    'name', 'Scanner Event Attempt',
    'slug', 'scanner-event-attempt',
    'category', 'AM_NHAC'
  )) $$,
  '42501',
  'Khong co quyen bien tap su kien cua to chuc',
  'Scanner role cannot create event draft via luu_su_kien_toan_dien'
);
RESET ROLE;

-- 6. Owner creates multi-show, multi-tier draft event via luu_su_kien_toan_dien
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT set_config(
  'app.test_created_event_id',
  (public.luu_su_kien_toan_dien(jsonb_build_object(
    'organizationId', '11111111-0000-0000-0000-000000000001',
    'name', 'Festive Indie Night 2026',
    'slug', 'festive-indie-night-2026',
    'category', 'AM_NHAC',
    'slogan', 'Âm nhạc độc lập kết nối',
    'locationMode', 'OFFLINE',
    'venueName', 'Cung Triển Lãm',
    'address', 'Hà Nội',
    'bannerUrl', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
    'contactEmail', 'indie@fest.vn',
    'contactHotline', '0901234567',
    'refundPolicy', 'Không hoàn vé trừ khi hủy show',
    'shows', jsonb_build_array(
      jsonb_build_object(
        'slug', 'dem-1',
        'name', 'Đêm 1 · Acoustic',
        'startsAt', (NOW() + INTERVAL '10 days')::text,
        'endsAt', (NOW() + INTERVAL '10 days 3 hours')::text,
        'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
        'saleEndsAt', (NOW() + INTERVAL '9 days')::text,
        'ticketTiers', jsonb_build_array(
          jsonb_build_object('code', 'STANDARD', 'name', 'Vé Tiêu Chuẩn', 'price', 200000, 'capacity', 300),
          jsonb_build_object('code', 'VIP', 'name', 'Vé VIP', 'price', 450000, 'capacity', 100)
        )
      ),
      jsonb_build_object(
        'slug', 'dem-2',
        'name', 'Đêm 2 · Full Band',
        'startsAt', (NOW() + INTERVAL '11 days')::text,
        'endsAt', (NOW() + INTERVAL '11 days 4 hours')::text,
        'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
        'saleEndsAt', (NOW() + INTERVAL '10 days')::text,
        'ticketTiers', jsonb_build_array(
          jsonb_build_object('code', 'GENERAL', 'name', 'Vé GA', 'price', 250000, 'capacity', 500)
        )
      )
    )
  ))->>'eventId'),
  true
);
RESET ROLE;

-- 7. Verify draft event created with BAN_NHAP status
SELECT is(
  (SELECT "TrangThaiCongBo" FROM public."SU_KIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int),
  'BAN_NHAP',
  'Draft event created via luu_su_kien_toan_dien has BAN_NHAP status'
);

-- 8. Verify exactly 2 shows created for this event
SELECT is(
  (SELECT COUNT(*)::int FROM public."SUAT_DIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int),
  2,
  'Event aggregate has 2 shows created atomically'
);

-- 9. Verify 3 total ticket tiers created across both shows
SELECT is(
  (SELECT COUNT(*)::int FROM public."KHU_VUC" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int),
  3,
  'Event aggregate has 3 ticket tiers across both shows'
);

-- 10. Verify total capacity aggregated to SU_KIEN.SucChua (300+100+500 = 900)
SELECT is(
  (SELECT "SucChua" FROM public."SU_KIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int),
  900,
  'Total capacity correctly aggregated to SU_KIEN.SucChua'
);

-- 11. Permissive draft save: Can update basic info without breaking
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT lives_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'eventId', current_setting('app.test_created_event_id')::int,
    'organizationId', '11111111-0000-0000-0000-000000000001',
    'name', 'Festive Indie Night 2026 - Updated',
    'slug', 'festive-indie-night-2026',
    'category', 'AM_NHAC'
  )) $$,
  'Owner can permissively update draft basic info'
);
RESET ROLE;

-- 12. Strict publish check: Online event missing online link throws 23514
INSERT INTO public."SU_KIEN" (
  "SuKienID", "TenSuKien", "Slug", "ToChucID", "TheLoai", "LoaiHinhSuKien",
  "ThoiGianBatDau", "ThoiGianKetThuc", "ThoiGianMoBanVe", "DiaDiem", "TenSanVanDong",
  "TrangThaiMoBan", "TrangThaiCongBo"
) VALUES (
  999992, 'Online Webinar Draft', 'online-webinar-draft', '11111111-0000-0000-0000-000000000001',
  'HOI_THAO', 'ONLINE', NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days 2 hours',
  NOW() + INTERVAL '1 day', 'Online', 'Zoom', 'SAP_MO_BAN', 'BAN_NHAP'
);

INSERT INTO public."SUAT_DIEN" (
  "SuatDienID", "SuKienID", "Slug", "TenSuatDien", "ThoiGianBatDau", "ThoiGianKetThuc",
  "ThoiGianMoBanVe", "TrangThai"
) VALUES (
  999992, 999992, 'suat-1', 'Buổi 1', NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days 2 hours',
  NOW() + INTERVAL '1 day', 'BAN_NHAP'
);

INSERT INTO public."KHU_VUC" (
  "SuKienID", "SuatDienID", "MaKhuVuc", "TenKhuVuc", "LoaiKhuVuc", "GiaVeNiemYet", "TongSoGhe"
) VALUES (
  999992, 999992, 'WEBINAR_PASS', 'Vé Tham Dự Online', 'DUNG_STAND', 0, 100
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT throws_ok(
  $$ SELECT public.cong_bo_su_kien(999992) $$,
  '23514',
  'Su kien truc tuyen can co duong dan tham gia de cong bo',
  'Publish rejects online event when onlineLink is empty'
);

-- 13. Publishing valid multi-show event succeeds
SELECT is(
  public.cong_bo_su_kien(current_setting('app.test_created_event_id')::int),
  TRUE,
  'Publishing valid multi-show event returns TRUE'
);
RESET ROLE;

-- 14. Both shows atomically transitioned to SAP_MO_BAN and event is CONG_KHAI
SELECT is(
  (SELECT COUNT(*)::int FROM public."SUAT_DIEN"
   WHERE "SuKienID" = current_setting('app.test_created_event_id')::int AND "TrangThai" = 'SAP_MO_BAN'),
  2,
  'All draft shows atomically transitioned to SAP_MO_BAN upon publish'
);

-- 15. Tenant boundary: Cross-tenant forged showId from another event throws 42501
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'eventId', current_setting('app.test_created_event_id')::int,
    'organizationId', '11111111-0000-0000-0000-000000000001',
    'name', 'Festive Indie Night 2026',
    'slug', 'festive-indie-night-2026',
    'category', 'AM_NHAC',
    'shows', jsonb_build_array(
      jsonb_build_object(
        'showId', 999992,
        'slug', 'dem-forged',
        'name', 'Đêm Forged',
        'startsAt', (NOW() + INTERVAL '10 days')::text,
        'endsAt', (NOW() + INTERVAL '10 days 3 hours')::text,
        'saleStartsAt', (NOW() + INTERVAL '1 day')::text
      )
    )
  )) $$,
  '42501',
  'Suat dien khong ton tai hoac khong thuoc su kien dang thao tac',
  'Forged showId from another event is rejected with 42501'
);

-- 16. Tenant boundary: Cross-tenant forged tierId from another show/event throws 42501
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'eventId', current_setting('app.test_created_event_id')::int,
    'organizationId', '11111111-0000-0000-0000-000000000001',
    'name', 'Festive Indie Night 2026',
    'slug', 'festive-indie-night-2026',
    'category', 'AM_NHAC',
    'shows', jsonb_build_array(
      jsonb_build_object(
        'showId', (SELECT "SuatDienID" FROM public."SUAT_DIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "SuatDienID" LIMIT 1),
        'slug', 'dem-1',
        'name', 'Đêm 1 · Acoustic',
        'startsAt', (NOW() + INTERVAL '10 days')::text,
        'endsAt', (NOW() + INTERVAL '10 days 3 hours')::text,
        'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
        'ticketTiers', jsonb_build_array(
          jsonb_build_object(
            'tierId', 999992,
            'code', 'FORGED_TIER',
            'name', 'Vé Forged',
            'price', 200000,
            'capacity', 300
          )
        )
      )
    )
  )) $$,
  '42501',
  'Phan khu khong ton tai hoac khong thuoc suat dien dang thao tac',
  'Forged tierId from another show or event is rejected with 42501'
);
RESET ROLE;

-- Setup active hold on show 1
INSERT INTO public."GIU_CHO" (
  "GiuChoID", "SuKienID", "SuatDienID", "PhienNguoiDung", "TrangThai", "HetHanLuc"
) SELECT
  '44444444-4444-4444-4444-444444444444', current_setting('app.test_created_event_id')::int,
  sd."SuatDienID", gen_random_uuid(), 'ACTIVE', NOW() + INTERVAL '5 minutes'
FROM public."SUAT_DIEN" sd WHERE sd."SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY sd."SuatDienID" LIMIT 1;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 17. Commercial price lock (isolated): Modifying price with identical start time throws 22023
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'eventId', current_setting('app.test_created_event_id')::int,
    'organizationId', '11111111-0000-0000-0000-000000000001',
    'name', 'Festive Indie Night 2026',
    'slug', 'festive-indie-night-2026',
    'category', 'AM_NHAC',
    'shows', jsonb_build_array(
      jsonb_build_object(
        'showId', (SELECT "SuatDienID" FROM public."SUAT_DIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "SuatDienID" LIMIT 1),
        'slug', 'dem-1',
        'name', 'Đêm 1 · Acoustic',
        'startsAt', (SELECT "ThoiGianBatDau"::text FROM public."SUAT_DIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "SuatDienID" LIMIT 1),
        'endsAt', (SELECT "ThoiGianKetThuc"::text FROM public."SUAT_DIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "SuatDienID" LIMIT 1),
        'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
        'ticketTiers', jsonb_build_array(
          jsonb_build_object(
            'tierId', (SELECT "KhuVucID" FROM public."KHU_VUC" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "KhuVucID" LIMIT 1),
            'code', 'STANDARD',
            'name', 'Vé Tiêu Chuẩn',
            'price', 999999,
            'capacity', 300
          )
        )
      )
    )
  )) $$,
  '22023',
  'Khong the thay doi gia ve hoac giam suc chua khi da phat sinh luot giu cho hoac ban ve',
  'Commercial lock prevents modifying price when active hold exists'
);

-- 18. Commercial start-time lock (isolated): Modifying start time with identical price throws 22023
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'eventId', current_setting('app.test_created_event_id')::int,
    'organizationId', '11111111-0000-0000-0000-000000000001',
    'name', 'Festive Indie Night 2026',
    'slug', 'festive-indie-night-2026',
    'category', 'AM_NHAC',
    'shows', jsonb_build_array(
      jsonb_build_object(
        'showId', (SELECT "SuatDienID" FROM public."SUAT_DIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "SuatDienID" LIMIT 1),
        'slug', 'dem-1',
        'name', 'Đêm 1 · Acoustic',
        'startsAt', (NOW() + INTERVAL '14 days')::text,
        'endsAt', (NOW() + INTERVAL '14 days 3 hours')::text,
        'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
        'ticketTiers', jsonb_build_array(
          jsonb_build_object(
            'tierId', (SELECT "KhuVucID" FROM public."KHU_VUC" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "KhuVucID" LIMIT 1),
            'code', 'STANDARD',
            'name', 'Vé Tiêu Chuẩn',
            'price', 200000,
            'capacity', 300
          )
        )
      )
    )
  )) $$,
  '22023',
  'Khong the thay doi gio bat dau khi da phat sinh luot giu cho hoac ban ve',
  'Commercial lock prevents modifying show start time when active hold exists'
);

-- 19. Deletion safety: Omitting a show that has active holds throws 22023
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'eventId', current_setting('app.test_created_event_id')::int,
    'organizationId', '11111111-0000-0000-0000-000000000001',
    'name', 'Festive Indie Night 2026',
    'slug', 'festive-indie-night-2026',
    'category', 'AM_NHAC',
    'shows', jsonb_build_array(
      jsonb_build_object(
        'showId', (SELECT "SuatDienID" FROM public."SUAT_DIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "SuatDienID" DESC LIMIT 1),
        'slug', 'dem-2',
        'name', 'Đêm 2 · Full Band',
        'startsAt', (SELECT "ThoiGianBatDau"::text FROM public."SUAT_DIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "SuatDienID" DESC LIMIT 1),
        'endsAt', (SELECT "ThoiGianKetThuc"::text FROM public."SUAT_DIEN" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "SuatDienID" DESC LIMIT 1),
        'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
        'ticketTiers', jsonb_build_array(
          jsonb_build_object(
            'tierId', (SELECT "KhuVucID" FROM public."KHU_VUC" WHERE "SuKienID" = current_setting('app.test_created_event_id')::int ORDER BY "KhuVucID" DESC LIMIT 1),
            'code', 'GENERAL',
            'name', 'Vé GA',
            'price', 250000,
            'capacity', 500
          )
        )
      )
    )
  )) $$,
  '22023',
  'Khong the xoa suat dien da phat sinh luot giu cho hoac ban ve',
  'Deletion safety prevents omitting a show that has active holds'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
