-- LOCAL-ONLY fixtures for the pgTAP suites (run by `supabase start` / `supabase db reset`; never applied to a remote project).
-- Several pgTAP files reference these auth users by fixed id instead of creating them. On staging they already existed;
-- on a fresh local database they must be created here. Every insert is idempotent. New pgTAP files should still create
-- their own fixtures inside their transaction and not rely on this file.
INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.com'),
  ('22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a2@example.com'),
  ('22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.com'),
  ('33333333-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'scanner-a@example.com'),
  ('44444444-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'member-c@example.com'),
  ('44444444-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'buyer-test@example.com'),
  ('55555555-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'organizer-test@example.com'),
  ('99999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated', 'outsider@example.com')
ON CONFLICT (id) DO NOTHING;

-- Editing rights also require an ORGANIZER (or ADMIN) account type (co_quyen_bien_tap_to_chuc). The profile row is created
-- by a trigger as USER, so set the type explicitly; the buyer fixture stays USER.
INSERT INTO public."HO_SO_NGUOI_DUNG" ("NguoiDungID", "HoTen", "LoaiTaiKhoan")
VALUES
  ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fixture owner A', 'ORGANIZER'),
  ('22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fixture owner A2', 'ORGANIZER'),
  ('22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Fixture owner B', 'ORGANIZER'),
  ('33333333-cccc-cccc-cccc-cccccccccccc', 'Fixture scanner A', 'ORGANIZER'),
  ('44444444-cccc-cccc-cccc-cccccccccccc', 'Fixture member C', 'ORGANIZER'),
  ('44444444-dddd-dddd-dddd-dddddddddddd', 'Fixture buyer', 'USER'),
  ('55555555-eeee-eeee-eeee-eeeeeeeeeeee', 'Fixture organizer', 'ORGANIZER'),
  ('99999999-9999-9999-9999-999999999999', 'Fixture outsider', 'ORGANIZER')
ON CONFLICT ("NguoiDungID") DO UPDATE SET "LoaiTaiKhoan" = EXCLUDED."LoaiTaiKhoan";
