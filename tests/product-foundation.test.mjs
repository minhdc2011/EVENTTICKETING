import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {buildPublicPath, resolvePublicRoute} from '../src/domain/publicRoute.js';

test('resolves catalog, event and show routes behind a GitHub Pages base path', () => {
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/events', 'fallback'), {kind: 'catalog'});
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/events/super-concert-2026', 'fallback'), {
    kind: 'detail', eventSlug: 'super-concert-2026',
  });
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/events/super-concert-2026/shows/dem-chinh', 'fallback'), {
    kind: 'detail', eventSlug: 'super-concert-2026', showSlug: 'dem-chinh',
  });
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'super-concert-2026'), {kind: 'catalog'});
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '#/events/super-concert-2026/shows/dem-chinh'), {
    kind: 'detail', eventSlug: 'super-concert-2026', showSlug: 'dem-chinh',
  });
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '', '?route=/events/super-concert-2026'), {
    kind: 'detail', eventSlug: 'super-concert-2026',
  });
});

test('resolves organizer routes without confusing them with public events', () => {
  assert.deepEqual(resolvePublicRoute('/organizer', 'fallback'), {kind: 'organizer', page: 'dashboard'});
  assert.deepEqual(resolvePublicRoute('/organizer/login', 'fallback'), {kind: 'organizer', page: 'login'});
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '', '?route=/organizer/login'), {kind: 'organizer', page: 'login'});
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '', '?route=/organizer'), {kind: 'organizer', page: 'dashboard'});
});

test('builds stable event links at localhost and behind a GitHub Pages base path', () => {
  assert.equal(buildPublicPath('/events/super-concert-2026', 'events/other-event'), '/?route=/events/other-event');
  assert.equal(buildPublicPath('/EVENTTICKING/', 'events/other-event'), '/EVENTTICKING/?route=/events/other-event');
  assert.equal(buildPublicPath('/EVENTTICKING/events/super-concert-2026', 'events/other-event'), '/EVENTTICKING/?route=/events/other-event');
  assert.equal(buildPublicPath('/EVENTTICKETING/', 'organizer/login'), '/EVENTTICKETING/?route=/organizer/login');
  assert.equal(buildPublicPath('/', 'events/uat-acoustic-night-2026'), '/?route=/events/uat-acoustic-night-2026');
  assert.equal(
    buildPublicPath('/', 'events/uat-acoustic-night-2026?preview=1'),
    '/?route=/events/uat-acoustic-night-2026&preview=1',
  );
  assert.deepEqual(
    resolvePublicRoute('/', 'fallback', '', '?route=/events/uat-acoustic-night-2026?preview=1'),
    {kind: 'detail', eventSlug: 'uat-acoustic-night-2026'},
  );
  assert.equal(buildPublicPath('/', 'events/uat-acoustic-night-2026uat-acoustic-night-2026'), '/?route=/events/uat-acoustic-night-2026');
});

test('marketplace and organizer migration is additive, themed and permission-gated', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261005150000_marketplace_organizer_mvp.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "TemplateKey"/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.tao_to_chuc_cua_toi/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.tao_ban_nhap_su_kien/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cong_bo_su_kien/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.doesNotMatch(sql, /DROP TABLE/);

  // Security hardening assertions
  assert.match(sql, /"TongSoGhe" > 0/, 'Publishing must validate a sellable zone with positive capacity');
  assert.match(sql, /"GiaVeNiemYet" >= 0/, 'Publishing must validate a sellable zone with non-negative price');
  assert.match(sql, /trg_kiem_tra_cong_bo_su_kien/, 'Must include trigger preventing direct client-write bypass to CONG_KHAI');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.kiem_tra_trang_thai_cong_bo_su_kien\(\) FROM PUBLIC;/, 'Must revoke PUBLIC execute on trigger function');
  assert.match(sql, /co_quyen_bien_tap_to_chuc/, 'Must restrict management to authorized editor roles');
  assert.match(sql, /CREATE POLICY "Editors manage their events"/, 'Must define editor-restricted event management policy');
  assert.match(sql, /CREATE POLICY "Members read their events"/, 'Must define member read-only policy for workspace');
});

test('product foundation migration remains additive, show-aware and safe', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261005090000_product_foundation.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\."SUAT_DIEN"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\."THANH_VIEN_TO_CHUC"/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.tao_giu_cho_theo_suat/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.tao_giu_cho\(/);
  assert.match(sql, /AND "TrangThai" <> 'BAN_NHAP'/, 'tao_giu_cho adapter must never bind to a draft show');
  assert.doesNotMatch(sql, /DROP TABLE/);
});

test('all SECURITY DEFINER functions in migrations enforce search_path = public', async () => {
  const files = [
    '../supabase/migrations/20261005090000_product_foundation.sql',
    '../supabase/migrations/20261005150000_marketplace_organizer_mvp.sql',
    '../supabase/migrations/20261006190000_organizer_event_creation_slice.sql',
    '../supabase/migrations/20261006210000_user_organizer_boundary.sql',
  ];
  for (const file of files) {
    const content = await readFile(new URL(file, import.meta.url), 'utf8');
    const matches = content.matchAll(/SECURITY DEFINER[^\n;]*AS/gi);
    for (const match of matches) {
      assert.match(match[0], /SET search_path = public/i, `Function in ${file} missing search_path = public`);
    }
  }
});

test('product foundation SQL acceptance test queries draft elements directly by ID under anon', async () => {
  const sql = await readFile(new URL('../supabase/tests/product_foundation.sql', import.meta.url), 'utf8');
  assert.match(sql, /current_setting\('app\.test_draft_show_id'\)/, 'Must query draft show directly by ID without vacuous join');
  assert.match(sql, /current_setting\('app\.test_draft_zone_id'\)/, 'Must query draft zone directly by ID without vacuous join');
  assert.match(sql, /current_setting\('app\.test_draft_seat_id'\)/, 'Must query draft seat directly by ID without vacuous join');
});

test('marketplace organizer pgTAP test file is plain SQL and asserts direct-table RLS', async () => {
  const sql = await readFile(new URL('../supabase/tests/marketplace_organizer_mvp.sql', import.meta.url), 'utf8');
  assert.match(sql, /SELECT plan\(23\);/);
  assert.doesNotMatch(sql, /\\gset/, 'Must not contain psql meta-commands like \\gset');
  assert.match(sql, /Anonymous users cannot create organizations/);
  assert.match(sql, /Anonymous users cannot create event drafts/);
  assert.match(sql, /Anonymous users cannot publish events/);
  assert.match(sql, /Member of Org Alpha cannot create draft for Org Beta/);
  assert.match(sql, /Scanner cannot UPDATE event via direct table write/);
  assert.match(sql, /Org B owner cannot UPDATE Org A event via direct table write/);
  assert.match(sql, /Org A owner can update its own draft via direct table write without publishing/);
  assert.match(sql, /Direct table update by owner preserves BAN_NHAP draft status/);
  assert.match(sql, /Member of Org Beta cannot publish Org Alpha event/);
  assert.match(sql, /Scanner role cannot publish event/);
  assert.match(sql, /Cannot publish an event whose show has no sellable zone/);
  assert.match(sql, /Trigger prevents direct client-write bypass/);
});

test('organizer event creation slice migration defines luu_su_kien_toan_dien with tenant boundary and deletion safety', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261006190000_organizer_event_creation_slice.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.luu_su_kien_toan_dien/);
  assert.match(sql, /SET search_path = public/);
  assert.match(sql, /Suat dien khong ton tai hoac khong thuoc su kien dang thao tac/, 'Must enforce showId tenant boundary');
  assert.match(sql, /Phan khu khong ton tai hoac khong thuoc suat dien dang thao tac/, 'Must enforce tierId tenant boundary');
  assert.match(sql, /Khong the thay doi gia ve hoac giam suc chua khi da phat sinh luot giu cho hoac ban ve/, 'Must lock price/capacity');
  assert.match(sql, /Khong the thay doi gio bat dau khi da phat sinh luot giu cho hoac ban ve/, 'Must lock show start time');
  assert.match(sql, /Khong the xoa phan khu da phat sinh luot giu cho hoac ban ve/, 'Must safely guard tier deletion');
  assert.match(sql, /Khong the xoa suat dien da phat sinh luot giu cho hoac ban ve/, 'Must safely guard show deletion');
});

test('organizer event creation slice pgTAP test file is plain SQL and asserts tenant boundaries and commercial locks', async () => {
  const sql = await readFile(new URL('../supabase/tests/organizer_event_creation_slice.sql', import.meta.url), 'utf8');
  assert.match(sql, /SELECT plan\(19\);/);
  assert.doesNotMatch(sql, /\\gset/, 'Must not contain psql meta-commands like \\gset');
  assert.match(sql, /Anonymous users cannot call luu_su_kien_toan_dien/);
  assert.match(sql, /Scanner role cannot create event draft via luu_su_kien_toan_dien/);
  assert.match(sql, /Draft event created via luu_su_kien_toan_dien has BAN_NHAP status/);
  assert.match(sql, /Publish rejects online event when onlineLink is empty/);
  assert.match(sql, /Forged showId from another event is rejected with 42501/);
  assert.match(sql, /Forged tierId from another show or event is rejected with 42501/);
  assert.match(sql, /Commercial lock prevents modifying price when active hold exists/);
  assert.match(sql, /Commercial lock prevents modifying show start time when active hold exists/);
  assert.match(sql, /Deletion safety prevents omitting a show that has active holds/);
});
