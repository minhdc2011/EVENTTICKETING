-- pgTAP acceptance test: server-side seat generation + narrowed write access on GHE (NFR-09, BR-02.7).
-- Migration under test: 20261111090000_server_side_seat_generation.sql
--
-- STATUS: written but NOT executed yet (no local Supabase/Docker was available when this was authored).
-- Run with `supabase test db` against a database with every migration applied. Everything is rolled back.
--
-- Fixture assumption (same as organizer_event_creation_slice.sql): the auth users referenced below exist.
--   11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa  organization OWNER (can edit)
--   33333333-cccc-cccc-cccc-cccccccccccc  organization SOAT_VE member (read-only, cannot edit)
--   99999999-9999-9999-9999-999999999999  outsider (not a member of the organization)
BEGIN;
SELECT plan(27);

INSERT INTO public."TO_CHUC" ("ToChucID", "TenToChuc", "Slug")
VALUES ('44444444-0000-0000-0000-000000000001', 'Org Seat Gen', 'org-seat-gen')
ON CONFLICT ("ToChucID") DO NOTHING;

INSERT INTO public."THANH_VIEN_TO_CHUC" ("ToChucID", "NguoiDungID", "VaiTro")
VALUES
  ('44444444-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CHU_SO_HUU'),
  ('44444444-0000-0000-0000-000000000001', '33333333-cccc-cccc-cccc-cccccccccccc', 'SOAT_VE')
ON CONFLICT DO NOTHING;

-- 1-6. Row labels: 0 -> A, 25 -> Z, 26 -> AA, 51 -> AZ, 52 -> BA, 702 -> AAA
SELECT is(public.nhan_hang_ghe(0), 'A', 'row 0 is A');
SELECT is(public.nhan_hang_ghe(25), 'Z', 'row 25 is Z');
SELECT is(public.nhan_hang_ghe(26), 'AA', 'row 26 is AA');
SELECT is(public.nhan_hang_ghe(51), 'AZ', 'row 51 is AZ');
SELECT is(public.nhan_hang_ghe(52), 'BA', 'row 52 is BA');
SELECT is(public.nhan_hang_ghe(702), 'AAA', 'row 702 is AAA');

-- 7-10. Saving an event with a seated and a standing tier generates seats in the same call
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT set_config(
  'app.seat_event_id',
  (public.luu_su_kien_toan_dien(jsonb_build_object(
    'organizationId', '44444444-0000-0000-0000-000000000001',
    'name', 'Seat Generation Night 2026',
    'slug', 'seat-generation-night-2026',
    'category', 'AM_NHAC',
    'locationMode', 'OFFLINE',
    'venueName', 'Cung Test',
    'address', 'Hà Nội',
    'shows', jsonb_build_array(jsonb_build_object(
      'slug', 'dem-1',
      'name', 'Đêm 1',
      'startsAt', (NOW() + INTERVAL '10 days')::text,
      'endsAt', (NOW() + INTERVAL '10 days 3 hours')::text,
      'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
      'saleEndsAt', (NOW() + INTERVAL '9 days')::text,
      'ticketTiers', jsonb_build_array(
        jsonb_build_object('code', 'SEAT', 'name', 'Ghế ngồi', 'price', 300000, 'capacity', 25, 'type', 'GHE_NGOI'),
        jsonb_build_object('code', 'GA', 'name', 'Đứng', 'price', 150000, 'capacity', 100, 'type', 'DUNG_STAND')
      )
    ))
  ))->>'eventId'),
  true
);
RESET ROLE;

SELECT is(
  (SELECT COUNT(*)::int FROM public."GHE" g JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
   WHERE kv."SuKienID" = current_setting('app.seat_event_id')::int AND kv."MaKhuVuc" = 'SEAT'),
  25,
  'seated tier gets exactly its capacity in seats from the save call'
);
SELECT is(
  (SELECT COUNT(*)::int FROM public."GHE" g JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
   WHERE kv."SuKienID" = current_setting('app.seat_event_id')::int AND kv."MaKhuVuc" = 'GA'),
  0,
  'standing tier gets no seats'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public."GHE" g JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
          WHERE kv."SuKienID" = current_setting('app.seat_event_id')::int AND g."MaGheDayDu" = 'SEAT-A-01')
  AND EXISTS (SELECT 1 FROM public."GHE" g JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
          WHERE kv."SuKienID" = current_setting('app.seat_event_id')::int AND g."MaGheDayDu" = 'SEAT-C-05')
  AND NOT EXISTS (SELECT 1 FROM public."GHE" g JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
          WHERE kv."SuKienID" = current_setting('app.seat_event_id')::int AND g."MaGheDayDu" = 'SEAT-C-06'),
  'codes follow <zone>-<row>-<NN>, 10 per row: SEAT-A-01 .. SEAT-C-05 and nothing beyond'
);
SELECT is(
  (SELECT COUNT(*)::int FROM public."GHE" g JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
   WHERE kv."SuKienID" = current_setting('app.seat_event_id')::int AND g."TrangThai" <> 'TRONG'),
  0,
  'every generated seat starts as TRONG'
);

-- 11. Idempotent: syncing again adds nothing
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT lives_ok(
  $$ SELECT public.dong_bo_ghe_su_kien(current_setting('app.seat_event_id')::int) $$,
  'owner can re-run the seat sync'
);
RESET ROLE;
SELECT is(
  (SELECT COUNT(*)::int FROM public."GHE" g JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
   WHERE kv."SuKienID" = current_setting('app.seat_event_id')::int AND kv."MaKhuVuc" = 'SEAT'),
  25,
  're-running the sync does not duplicate seats'
);

-- 13. Raising capacity adds only the missing seats
UPDATE public."KHU_VUC" SET "TongSoGhe" = 31
WHERE "SuKienID" = current_setting('app.seat_event_id')::int AND "MaKhuVuc" = 'SEAT';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT lives_ok(
  $$ SELECT public.dong_bo_ghe_su_kien(current_setting('app.seat_event_id')::int) $$,
  'owner can sync after raising capacity'
);
RESET ROLE;
SELECT is(
  (SELECT COUNT(*)::int FROM public."GHE" g JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
   WHERE kv."SuKienID" = current_setting('app.seat_event_id')::int AND kv."MaKhuVuc" = 'SEAT'),
  31,
  'raising capacity from 25 to 31 adds exactly 6 seats'
);

-- 14-16. Editors can no longer write GHE directly (NFR-09)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT throws_ok(
  $$ UPDATE public."GHE" SET "TrangThai" = 'DA_BAN' WHERE "MaGheDayDu" = 'SEAT-A-01' $$,
  '42501',
  NULL,
  'an organizer editor cannot set seat status directly'
);
SELECT throws_ok(
  $$ INSERT INTO public."GHE" ("KhuVucID", "SoHang", "SoGhe", "MaGheDayDu", "TrangThai")
     SELECT "KhuVucID", 'Z', '99', 'SEAT-Z-99', 'TRONG' FROM public."KHU_VUC" WHERE "MaKhuVuc" = 'SEAT' LIMIT 1 $$,
  '42501',
  NULL,
  'an organizer editor cannot insert seats directly'
);
SELECT throws_ok(
  $$ DELETE FROM public."GHE" WHERE "MaGheDayDu" = 'SEAT-A-01' $$,
  '42501',
  NULL,
  'an organizer editor cannot delete seats directly'
);

-- 17. Read-only members still see their organization's seats
SET LOCAL "request.jwt.claim.sub" = '33333333-cccc-cccc-cccc-cccccccccccc';
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM public."GHE" WHERE "MaGheDayDu" LIKE 'SEAT-%'),
  '>',
  0,
  'a member can still read the organization seats'
);

-- 18-19. Members without edit rights and outsiders cannot trigger generation
SELECT throws_ok(
  $$ SELECT public.dong_bo_ghe_su_kien(current_setting('app.seat_event_id')::int) $$,
  '42501',
  'Khong co quyen bien tap su kien cua to chuc',
  'a SOAT_VE member cannot generate seats'
);
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-9999-9999-999999999999';
SELECT throws_ok(
  $$ SELECT public.dong_bo_ghe_su_kien(current_setting('app.seat_event_id')::int) $$,
  '42501',
  'Khong co quyen bien tap su kien cua to chuc',
  'a user outside the organization cannot generate seats'
);
RESET ROLE;

-- 20. Anonymous callers have no EXECUTE on the sync
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.dong_bo_ghe_su_kien(current_setting('app.seat_event_id')::int) $$,
  '42501',
  NULL,
  'anon cannot execute dong_bo_ghe_su_kien'
);
RESET ROLE;

-- 21-23. Reducing capacity never removes sold or held seats
-- (commercial fixtures are set directly as the table owner, as the hold RPCs would)
UPDATE public."GHE" SET "TrangThai" = 'DA_BAN' WHERE "MaGheDayDu" = 'SEAT-D-01';
UPDATE public."GHE" SET "TrangThai" = 'DANG_GIU' WHERE "MaGheDayDu" = 'SEAT-A-02';
UPDATE public."KHU_VUC" SET "TongSoGhe" = 5
WHERE "SuKienID" = current_setting('app.seat_event_id')::int AND "MaKhuVuc" = 'SEAT';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT lives_ok(
  $$ SELECT public.dong_bo_ghe_su_kien(current_setting('app.seat_event_id')::int) $$,
  'owner can sync after reducing capacity'
);
RESET ROLE;
SELECT is(
  (SELECT "TrangThai" FROM public."GHE" WHERE "MaGheDayDu" = 'SEAT-D-01'),
  'DA_BAN',
  'a sold seat survives a capacity reduction untouched'
);
SELECT is(
  (SELECT "TrangThai" FROM public."GHE" WHERE "MaGheDayDu" = 'SEAT-A-02'),
  'DANG_GIU',
  'a held seat survives a capacity reduction untouched'
);
SELECT is(
  (SELECT COUNT(*)::int FROM public."GHE" g JOIN public."KHU_VUC" kv ON kv."KhuVucID" = g."KhuVucID"
   WHERE kv."SuKienID" = current_setting('app.seat_event_id')::int AND kv."MaKhuVuc" = 'SEAT'),
  5,
  'only free surplus seats are trimmed: 31 -> 5 (2 protected seats kept + 3 free)'
);

-- 26-27. BR-02.7: more than 50,000 seats rejects the WHOLE save
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT throws_ok(
  $$ SELECT public.luu_su_kien_toan_dien(jsonb_build_object(
    'organizationId', '44444444-0000-0000-0000-000000000001',
    'name', 'Too Many Seats 2026',
    'slug', 'too-many-seats-2026',
    'category', 'AM_NHAC',
    'locationMode', 'OFFLINE',
    'venueName', 'Cung Test',
    'address', 'Hà Nội',
    'shows', jsonb_build_array(jsonb_build_object(
      'slug', 'dem-1',
      'name', 'Đêm 1',
      'startsAt', (NOW() + INTERVAL '10 days')::text,
      'endsAt', (NOW() + INTERVAL '10 days 3 hours')::text,
      'saleStartsAt', (NOW() + INTERVAL '1 day')::text,
      'saleEndsAt', (NOW() + INTERVAL '9 days')::text,
      'ticketTiers', jsonb_build_array(
        jsonb_build_object('code', 'HUGE', 'name', 'Quá nhiều', 'price', 100000, 'capacity', 60000, 'type', 'GHE_NGOI')
      )
    ))
  )) $$,
  '22023',
  NULL,
  'more than 50,000 seats is rejected with 22023'
);
RESET ROLE;
SELECT is(
  (SELECT COUNT(*)::int FROM public."SU_KIEN" WHERE "Slug" = 'too-many-seats-2026'),
  0,
  'the rejected save left no event behind (seat generation is atomic with the save)'
);

SELECT * FROM finish();
ROLLBACK;
