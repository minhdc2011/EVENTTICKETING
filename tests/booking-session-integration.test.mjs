import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUYER_KEY = 'eventticketing:mock-buyer-session';
const ORGANIZER_KEY = 'eventticketing:mock-organizer-session';

// Môi trường trình duyệt tối thiểu cho buyerAuthService (localStorage, window, StorageEvent).
const store = new Map();
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
};
// Dùng Object.defineProperty để tsc (allowJs) không suy luận kiểu constructor cho StorageEvent.
const browserStubs = {
  localStorage: localStorageStub,
  window: {
    localStorage: localStorageStub,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  },
  // Phải là function thường (không phải arrow) vì mã nguồn gọi `new StorageEvent(...)`.
  StorageEvent: function (type, init = {}) {
    return {type, key: init.key ?? null};
  },
};
for (const [name, value] of Object.entries(browserStubs)) {
  Object.defineProperty(globalThis, name, {value, writable: true, configurable: true});
}

// ID không có trong seed demo (seed đặt giới hạn riêng cho sự kiện 1..8) nên giới hạn là mặc định 4.
const EVENT_A = 101;
const EVENT_B = 202;

let instance = 0;

async function loadBooking() {
  instance += 1;
  const built = await build({
    stdin: {
      contents: `
        export {createSeatHold} from './src/services/bookingService.ts';
        export {signInBuyer, signUpBuyer, signOutBuyer} from './src/services/buyerAuthService.ts';
        // instance ${instance}
      `,
      resolveDir: repoRoot,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    define: {'import.meta.env.BASE_URL': '"/"'},
    plugins: [
      {
        name: 'booking-harness',
        setup(b) {
          b.onResolve({filter: /config\/runtime$/}, () => ({path: 'runtime', namespace: 'bk-stub'}));
          b.onResolve({filter: /(services\/|\.\.?\/)supabaseClient$/}, (args) => {
            const resolved = path.resolve(args.resolveDir, args.path).replaceAll('\\', '/');
            return resolved.endsWith('/src/services/supabaseClient')
              ? {path: 'supabaseClient', namespace: 'bk-stub'}
              : undefined;
          });
          b.onLoad({filter: /^runtime$/, namespace: 'bk-stub'}, () => ({
            contents: `
              export const runtimeConfig = {apiBaseUrl: '', websocketUrl: '', supabaseUrl: '', supabaseAnonKey: '',
                eventId: 'EV', eventDatabaseId: 1, useMockData: true};
              export const isSupabaseConfigured = () => false;
              export const isApiConfigured = () => false;
              export const isWebSocketConfigured = () => false;
              export const getActiveEventContext = () => globalThis.__bookingCtx;
              export const setActiveEventContext = () => {};
            `,
            loader: 'js',
          }));
          b.onLoad({filter: /^supabaseClient$/, namespace: 'bk-stub'}, () => ({
            contents: `
              export function requireSupabaseClient() { throw new Error('Không được gọi supabaseClient ở nhánh mock'); }
              export function getSupabaseClient() { throw new Error('Không được gọi supabaseClient ở nhánh mock'); }
            `,
            loader: 'js',
          }));
        },
      },
    ],
  });
  // esbuild bỏ comment trong đầu vào, nên gắn hậu tố riêng để mỗi lần tải là một URL (module) mới, kho giữ chỗ không dùng chung.
  const source = `${built.outputFiles[0].text}\n// instance ${instance}\n`;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
  return import(dataUrl);
}

function setContext(eventDatabaseId, showId) {
  globalThis.__bookingCtx = {
    eventId: `EV-${eventDatabaseId}`,
    eventDatabaseId,
    showId,
    showSlug: `show-${showId}`,
  };
}

function hold(svc, quantity) {
  return svc.createSeatHold({
    eventId: 'ignored',
    items: [{ticketCode: 'A-1', zoneCode: 'GA', quantity}],
  });
}

async function setup() {
  store.clear();
  setContext(EVENT_A, 1);
  return loadBooking();
}

test('hai người mua có số vé đang giữ độc lập trong cùng sự kiện', async () => {
  const svc = await setup();
  await svc.signUpBuyer('a@example.com', 'secret1');
  await hold(svc, 3);
  await svc.signUpBuyer('b@example.com', 'secret1');
  const b = await hold(svc, 4);
  assert.equal(b.status, 'ACTIVE');
  await svc.signInBuyer('a@example.com', 'secret1');
  await assert.rejects(() => hold(svc, 2), (err) => err.ma === 'VUOT_GIOI_HAN_VE' && err.dangGiu === 3 && err.gioiHan === 4);
  assert.equal((await hold(svc, 1)).status, 'ACTIVE');
});

test('cùng người mua được cộng dồn qua các suất của cùng sự kiện', async () => {
  const svc = await setup();
  await svc.signUpBuyer('a@example.com', 'secret1');
  setContext(EVENT_A, 1);
  await hold(svc, 2);
  setContext(EVENT_A, 2);
  await hold(svc, 2);
  await assert.rejects(() => hold(svc, 1), (err) => err.ma === 'VUOT_GIOI_HAN_VE' && err.dangGiu === 4 && err.conLai === 0);
});

test('khác sự kiện không cộng chéo', async () => {
  const svc = await setup();
  await svc.signUpBuyer('a@example.com', 'secret1');
  setContext(EVENT_A, 1);
  await hold(svc, 4);
  setContext(EVENT_B, 5);
  assert.equal((await hold(svc, 4)).status, 'ACTIVE');
});

test('đăng xuất hoặc xóa phiên thì không tạo giữ chỗ dưới danh tính cũ', async () => {
  const svc = await setup();
  await svc.signUpBuyer('a@example.com', 'secret1');
  await hold(svc, 1);
  await svc.signOutBuyer();
  await assert.rejects(() => hold(svc, 1), /đăng nhập/);

  await svc.signInBuyer('a@example.com', 'secret1');
  await hold(svc, 1);
  store.delete(BUYER_KEY);
  await assert.rejects(() => hold(svc, 1), /đăng nhập/);
});

test('đổi tài khoản: giữ chỗ tính cho tài khoản mới, không tính cho tài khoản cũ', async () => {
  const svc = await setup();
  await svc.signUpBuyer('a@example.com', 'secret1');
  await hold(svc, 2);
  await svc.signUpBuyer('b@example.com', 'secret1');
  await hold(svc, 4);
  await assert.rejects(() => hold(svc, 1), (err) => err.dangGiu === 4);
  await svc.signInBuyer('a@example.com', 'secret1');
  await hold(svc, 2);
  await assert.rejects(() => hold(svc, 1), (err) => err.dangGiu === 4);
});

test('phiên BTC không thay thế được phiên người mua', async () => {
  const svc = await setup();
  store.set(ORGANIZER_KEY, 'organizer@example.com');
  await assert.rejects(() => hold(svc, 1), /đăng nhập/);

  await svc.signUpBuyer('a@example.com', 'secret1');
  await hold(svc, 2);
  store.set(ORGANIZER_KEY, 'organizer@example.com');
  await hold(svc, 2);
  await assert.rejects(() => hold(svc, 1), (err) => err.dangGiu === 4);
  store.set(ORGANIZER_KEY, 'other-organizer@example.com');
  await assert.rejects(() => hold(svc, 1), (err) => err.dangGiu === 4);
});
