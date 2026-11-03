import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {resolvePublicRoute} from '../src/domain/publicRoute.js';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');
const exists = (rel) => existsSync(new URL(rel, import.meta.url));
const NOT_FOUND = {kind: 'notfound'};

test('unknown explicit routes resolve to the 404 page, known ones are unchanged', () => {
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/khong-co-trang-nay'), NOT_FOUND);
  assert.deepEqual(resolvePublicRoute('/', 'x', '#/abc/def'), NOT_FOUND);
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/'), {kind: 'catalog'});
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/events'), {kind: 'catalog'});
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/login'), {kind: 'account', page: 'login'});
});

test('account/<unknown> and organizer/<unknown> are 404, their real pages are not', () => {
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/account/xyz'), NOT_FOUND);
  assert.deepEqual(resolvePublicRoute('/account/settings', 'x'), NOT_FOUND);
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/organizer/xyz'), NOT_FOUND);
  assert.deepEqual(resolvePublicRoute('/organizer/events/1', 'x'), NOT_FOUND);
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/account'), {kind: 'account', page: 'overview'});
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/account/login'), {kind: 'account', page: 'login'});
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/organizer'), {kind: 'organizer', page: 'dashboard'});
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/organizer/login'), {kind: 'organizer', page: 'login'});
});

test('event routes reject malformed show segments', () => {
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/events/a/nonsense'), NOT_FOUND);
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/events/a/shows'), NOT_FOUND);
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/events/a/shows/s/extra'), NOT_FOUND);
  assert.deepEqual(resolvePublicRoute('/', 'x', '', '?route=/events/a/shows/s'), {kind: 'detail', eventSlug: 'a', showSlug: 's'});
});

test('a path under the deployment base is 404 only when the base is known', () => {
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'x', '', '', '/EVENTTICKETING/'), {kind: 'catalog'});
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/index.html', 'x', '', '', '/EVENTTICKETING/'), {kind: 'catalog'});
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/foo', 'x', '', '', '/EVENTTICKETING/'), NOT_FOUND);
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/events/a', 'x', '', '', '/EVENTTICKETING/'), {kind: 'detail', eventSlug: 'a'});
  assert.deepEqual(resolvePublicRoute('/foo', 'x', '', '', '/'), NOT_FOUND);
  // without a base the prefix is indistinguishable from a page name, so the legacy catalog fallback stays
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'x'), {kind: 'catalog'});
});

test('the app renders the 404 page for the notfound route and passes the deployment base', async () => {
  const app = await read('../src/App.tsx');
  assert.match(app, /route\.kind === 'notfound'\) return <NotFoundPage \/>/);
  assert.match(app, /import\.meta\.env\.BASE_URL/);
  assert.ok(exists('../src/components/site/NotFoundPage.tsx'));
});

test('dead code and unrendered fragments are gone', async () => {
  for (const gone of [
    '../src/components/SiteChrome.tsx',
    '../src/legacy/fragments/hero.html',
    '../src/legacy/fragments/pricing.html',
    '../src/legacy/fragments/footer-modals.html',
    '../src/legacy/fragments/artist-lineup.html',
    '../scripts/audit_backend_vs_frontend.mjs',
  ]) {
    assert.equal(exists(gone), false, `${gone} should be removed`);
  }
  assert.ok(exists('../src/legacy/fragments/seating.html'), 'the seating fragment is still rendered');
  const concert = await read('../src/components/ConcertSections.tsx');
  for (const name of ['HeroSection', 'PricingSection', 'ConcertGuideSection', 'ConcertMobileSticky']) {
    assert.doesNotMatch(concert, new RegExp(`export function ${name}\\b`), `${name} removed`);
  }
  const states = await read('../src/components/SprintOneStates.tsx');
  assert.doesNotMatch(states, /SaleStatusBanner/);
});

test('small data mismatches are fixed', async () => {
  const meta = JSON.parse(await read('../metadata.json'));
  assert.doesNotMatch(meta.description, /96 ghế/);
  assert.match(meta.description, /48 ghế/);
  const seats = JSON.parse(await read('../public/data_seats.json'));
  assert.equal(seats.length, 48);
  const zones = JSON.parse(await read('../public/data_zones.json'));
  for (const zone of zones) {
    for (const key of ['SoGheMauDemo', 'SoGheTrong', 'SoGheDaBan', 'SoGheDangGiu', 'TyLeLapDayPhanTram']) {
      assert.equal(key in zone, false, `${key} is not a database column`);
    }
  }
});

test('database types match the migrations', async () => {
  const types = await read('../src/types/database.types.ts');
  const publicBlock = types.slice(types.indexOf('\n  public: {'));
  for (const table of ['SUAT_DIEN', 'TO_CHUC', 'THANH_VIEN_TO_CHUC', 'HO_SO_NGUOI_DUNG', 'DIA_DIEM', 'PHIEN_BAN_SO_DO', 'CAU_HINH_SU_KIEN']) {
    assert.match(publicBlock, new RegExp(`\\n      ${table}: \\{`), `${table} typed inside the public schema`);
  }
  assert.doesNotMatch(types, /LICH_TRINH: \{/, 'the dropped LICH_TRINH table is not typed');
  for (const column of ['Slug', 'ToChucID', 'TheLoai', 'TemplateKey', 'TrangThaiCongBo']) assert.match(publicBlock, new RegExp(`\\b${column}: `));
  assert.match(publicBlock, /SuatDienID\??: number/);
  assert.match(publicBlock, /SoVeToiDaMoiDon\??: number/);
  for (const rpc of ['tao_giu_cho_theo_suat', 'luu_su_kien_toan_dien', 'tao_to_chuc_cua_toi', 'cong_bo_su_kien', 'huy_giu_cho']) {
    assert.match(publicBlock, new RegExp(`\\n      ${rpc}: \\{`), `${rpc} typed`);
  }
  assert.match(publicBlock, /tao_giu_cho_theo_suat: \{\s*Args: \{ p_items: Json; p_phien_id: string; p_suat_dien_id: number \}/);
});

test('services use the typed client where the schema covers the call', async () => {
  const booking = await read('../src/services/bookingService.ts');
  assert.match(booking, /await supabase\.rpc\('tao_giu_cho_theo_suat'/);
  const catalog = await read('../src/services/ticketDataService.ts');
  assert.doesNotMatch(catalog, /requireSupabaseClient\(\) as any/);
});
