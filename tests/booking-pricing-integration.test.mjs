import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {taoKhoGiuChoMoPhong} from '../src/domain/mockBooking.js';
import {buildHeldPriceSnapshot} from '../src/domain/pricePresentation.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRICING_KEY = 'eventticketing.pricing.mock.v1';

// Môi trường trình duyệt tối thiểu cho buyerAuthService và pricingService (localStorage, window, StorageEvent).
const store = new Map();
const storageAccessLog = [];
const localStorageStub = {
  getItem: (k) => {
    storageAccessLog.push(['get', k]);
    return store.has(k) ? store.get(k) : null;
  },
  setItem: (k, v) => {
    storageAccessLog.push(['set', k]);
    store.set(k, String(v));
  },
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

const DEMO_EVENT_SLUG = 'demo-dinh-gia-mo-phong';
const DEMO_EVENT_ID = 990001;
const DEMO_SHOW_ID = 990101;
const DEMO_VIP_KHU_ID = 990201;
const DEMO_VIP_SEED_PRICE = 1_500_000;
const NON_DEMO_EVENT_ID = 101;

let instance = 0;

async function loadBookingPricing() {
  instance += 1;
  const built = await build({
    stdin: {
      contents: `
        export {createSeatHold, releaseSeatHold} from './src/services/bookingService.ts';
        export {signInBuyer, signUpBuyer} from './src/services/buyerAuthService.ts';
        export {
          DEMO_NGUOI_DUNG,
          chayDinhGiaNgay,
          datLaiBoNhoMoPhong,
          docBangGiaChotDemo,
          duyetDeXuatGia,
          khoiTaoDemoDinhGia,
          layDanhSachDeXuat,
        } from './src/services/pricingService.ts';
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
        name: 'booking-pricing-harness',
        setup(b) {
          b.onResolve({filter: /config\/runtime$/}, () => ({path: 'runtime', namespace: 'bp-stub'}));
          b.onResolve({filter: /(services\/|\.\.?\/)supabaseClient$/}, (args) => {
            const resolved = path.resolve(args.resolveDir, args.path).replaceAll('\\', '/');
            return resolved.endsWith('/src/services/supabaseClient')
              ? {path: 'supabaseClient', namespace: 'bp-stub'}
              : undefined;
          });
          b.onLoad({filter: /^runtime$/, namespace: 'bp-stub'}, () => ({
            contents: `
              export const runtimeConfig = {
                apiBaseUrl: '',
                websocketUrl: '',
                supabaseUrl: '',
                supabaseAnonKey: '',
                eventId: '${DEMO_EVENT_SLUG}',
                eventDatabaseId: ${DEMO_EVENT_ID},
                get useMockData() {
                  return globalThis.__bpUseMock ?? true;
                },
              };
              export const isSupabaseConfigured = () => false;
              export const isApiConfigured = () => false;
              export const isWebSocketConfigured = () => false;
              export const getActiveEventContext = () => globalThis.__bookingCtx;
              export const setActiveEventContext = () => {};
            `,
            loader: 'js',
          }));
          b.onLoad({filter: /^supabaseClient$/, namespace: 'bp-stub'}, () => ({
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
  const source = `${built.outputFiles[0].text}\n// instance ${instance}\n`;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
  return import(dataUrl);
}

function setDemoContext() {
  globalThis.__bookingCtx = {
    eventId: DEMO_EVENT_SLUG,
    eventDatabaseId: DEMO_EVENT_ID,
    showId: DEMO_SHOW_ID,
    showSlug: 'suat-demo',
  };
}

function setNonDemoContext(eventDatabaseId = NON_DEMO_EVENT_ID, showId = 1) {
  globalThis.__bookingCtx = {
    eventId: `EV-${eventDatabaseId}`,
    eventDatabaseId,
    showId,
    showSlug: `show-${showId}`,
  };
}

async function setup({seedDemo = true} = {}) {
  globalThis.__bpUseMock = true;
  store.clear();
  storageAccessLog.length = 0;
  setDemoContext();
  const svc = await loadBookingPricing();
  svc.datLaiBoNhoMoPhong();
  if (seedDemo) {
    await svc.khoiTaoDemoDinhGia();
  }
  await svc.signUpBuyer('buyer@example.com', 'secret1');
  return svc;
}

test('(a) giữ chỗ demo lấy DonGiaChot từ giá niêm yết hiện hành, bỏ qua price/DonGiaChot của caller', async () => {
  const svc = await setup();
  const hold = await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [{ticketCode: 'DEMO_VIP-A17', zoneCode: 'DEMO_VIP', price: 1, DonGiaChot: 1}],
  });

  assert.equal(hold.status, 'ACTIVE');
  assert.equal('DonGiaChot' in hold, false);
  assert.equal(hold.items.length, 1);
  assert.equal(hold.items[0].DonGiaChot, DEMO_VIP_SEED_PRICE);
  assert.equal('price' in hold.items[0], false);

  const snapshot = buildHeldPriceSnapshot({
    selectedSeats: [{GheID: 990201017, KhuVucID: DEMO_VIP_KHU_ID, MaGheDayDu: 'DEMO_VIP-A17', GiaVeNiemYet: 1}],
    zones: [{KhuVucID: DEMO_VIP_KHU_ID, MaKhuVuc: 'DEMO_VIP', GiaVeNiemYet: 1}],
    holdRecord: hold,
  });
  assert.equal(snapshot.hasServerLockedPrice, true);
  assert.equal(snapshot.total, DEMO_VIP_SEED_PRICE);
});

test('(b) duyệt đề xuất giá: giữ chỗ cũ giữ nguyên DonGiaChot, giữ chỗ mới nhận giá đã duyệt', async () => {
  const svc = await setup();

  const h1 = await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [{ticketCode: 'DEMO_VIP-A17', zoneCode: 'DEMO_VIP'}],
  });
  assert.equal(h1.items[0].DonGiaChot, DEMO_VIP_SEED_PRICE);

  const run = await svc.chayDinhGiaNgay(DEMO_EVENT_ID);
  const vipRun = run.theoKhu.find((k) => k.khuVucId === DEMO_VIP_KHU_ID);
  assert.ok(vipRun && vipRun.ketQua === 'DA_LUU', 'Khu VIP demo phải tạo đề xuất DA_LUU');

  const danhSach = await svc.layDanhSachDeXuat(DEMO_EVENT_ID, {nguoiDung: svc.DEMO_NGUOI_DUNG});
  const vipZone = danhSach.khuVuc.find((k) => k.khuVucId === DEMO_VIP_KHU_ID);
  const pendingVip = vipZone?.deXuat.find((d) => d.trangThai === 'PENDING');
  assert.equal(pendingVip?.deXuatId, vipRun.deXuatId);

  const duyet = await svc.duyetDeXuatGia(vipRun.deXuatId, {}, {nguoiDung: svc.DEMO_NGUOI_DUNG});
  assert.equal(duyet.ketQua, 'DA_DUYET');
  assert.notEqual(duyet.giaMoi, DEMO_VIP_SEED_PRICE);

  const h2 = await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [{ticketCode: 'DEMO_VIP-A18', zoneCode: 'DEMO_VIP', price: 1, DonGiaChot: 1}],
  });
  assert.equal(h2.items[0].DonGiaChot, duyet.giaMoi);
  assert.equal(h1.items[0].DonGiaChot, DEMO_VIP_SEED_PRICE);
});

test('(c) sửa đối tượng trả về hoặc tiếp tục đổi giá bằng giaDieuChinh không làm đổi DonGiaChot của giữ chỗ trước đó', async () => {
  const svc = await setup();

  const h1 = await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [{ticketCode: 'DEMO_VIP-A17', zoneCode: 'DEMO_VIP'}],
  });
  assert.equal(h1.items[0].DonGiaChot, DEMO_VIP_SEED_PRICE);

  const run1 = await svc.chayDinhGiaNgay(DEMO_EVENT_ID);
  const vip1 = run1.theoKhu.find((k) => k.khuVucId === DEMO_VIP_KHU_ID);
  assert.ok(vip1 && vip1.ketQua === 'DA_LUU');
  const duyet1 = await svc.duyetDeXuatGia(vip1.deXuatId, {}, {nguoiDung: svc.DEMO_NGUOI_DUNG});
  assert.equal(duyet1.ketQua, 'DA_DUYET');

  const h2 = await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [{ticketCode: 'DEMO_VIP-A18', zoneCode: 'DEMO_VIP'}],
  });
  assert.equal(h2.items[0].DonGiaChot, duyet1.giaMoi);

  // Sửa đối tượng trả về của H2 không ảnh hưởng H1 hay kho pricing.
  h2.items[0].DonGiaChot = 999;
  assert.equal(h1.items[0].DonGiaChot, DEMO_VIP_SEED_PRICE);

  // Đợt 2: tạo đề xuất mới và duyệt với giaDieuChinh.
  const run2 = await svc.chayDinhGiaNgay(DEMO_EVENT_ID);
  const vip2 = run2.theoKhu.find((k) => k.khuVucId === DEMO_VIP_KHU_ID);
  assert.ok(vip2 && vip2.ketQua === 'DA_LUU');
  const giaDieuChinh = 1_950_000;
  const duyet2 = await svc.duyetDeXuatGia(
    vip2.deXuatId,
    {giaDieuChinh, ghiChu: 'Điều chỉnh thử nghiệm'},
    {nguoiDung: svc.DEMO_NGUOI_DUNG},
  );
  assert.equal(duyet2.ketQua, 'DA_DUYET');
  assert.equal(duyet2.giaMoi, giaDieuChinh);

  const h3 = await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [{ticketCode: 'DEMO_VIP-A19', zoneCode: 'DEMO_VIP'}],
  });
  assert.equal(h3.items[0].DonGiaChot, giaDieuChinh);
  assert.equal(h1.items[0].DonGiaChot, DEMO_VIP_SEED_PRICE);

  // Kiểm tra trực tiếp bản lưu đóng băng trong kho giữ chỗ mô phỏng không bị sửa khi caller mutate kết quả trả về.
  const kho = taoKhoGiuChoMoPhong({taoId: () => 'mock-frozen-check'});
  const bangGia1 = await svc.docBangGiaChotDemo();
  const storedReturn = kho.giuCho({
    taiKhoanId: 'u1',
    suKienId: DEMO_EVENT_ID,
    suatDienId: DEMO_SHOW_ID,
    eventId: DEMO_EVENT_SLUG,
    items: [{ticketCode: 'DEMO_VIP-A20', zoneCode: 'DEMO_VIP'}],
    bangGiaChot: bangGia1,
  });
  assert.equal(storedReturn.items[0].DonGiaChot, giaDieuChinh);
  storedReturn.items[0].DonGiaChot = 123;
  const [storedEntry] = kho.layDanhSach();
  assert.equal(Object.isFrozen(storedEntry.items), true);
  assert.equal(Object.isFrozen(storedEntry.items[0]), true);
  assert.equal(storedEntry.items[0].DonGiaChot, giaDieuChinh);
});

test('(d) giới hạn 4 vé và releaseSeatHold hoạt động đúng trên sự kiện demo', async () => {
  const svc = await setup();

  const h1 = await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [
      {ticketCode: 'DEMO_VIP-A17', zoneCode: 'DEMO_VIP'},
      {ticketCode: 'DEMO_VIP-A18', zoneCode: 'DEMO_VIP'},
    ],
  });
  await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [
      {ticketCode: 'DEMO_STANDARD-A15', zoneCode: 'DEMO_STANDARD'},
      {ticketCode: 'DEMO_ECONOMY-A5', zoneCode: 'DEMO_ECONOMY'},
    ],
  });

  await assert.rejects(
    () =>
      svc.createSeatHold({
        eventId: DEMO_EVENT_SLUG,
        items: [{ticketCode: 'DEMO_VIP-A19', zoneCode: 'DEMO_VIP'}],
      }),
    (err) => err.ma === 'VUOT_GIOI_HAN_VE' && err.gioiHan === 4 && err.dangGiu === 4 && err.conLai === 0,
  );

  await svc.releaseSeatHold(h1.holdId);

  const h3 = await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [
      {ticketCode: 'DEMO_VIP-A19', zoneCode: 'DEMO_VIP'},
      {ticketCode: 'DEMO_VIP-A20', zoneCode: 'DEMO_VIP'},
    ],
  });
  assert.equal(h3.status, 'ACTIVE');
  assert.equal(h3.items[0].DonGiaChot, DEMO_VIP_SEED_PRICE);
  assert.equal(h3.items[1].DonGiaChot, DEMO_VIP_SEED_PRICE);
});

test('(e) ngữ cảnh không phải demo: trả items không có DonGiaChot và không đọc kho pricing', async () => {
  const svc = await setup({seedDemo: false});
  setNonDemoContext(NON_DEMO_EVENT_ID, 1);
  storageAccessLog.length = 0;

  const hold = await svc.createSeatHold({
    eventId: 'ignored',
    items: [{ticketCode: 'A-1', zoneCode: 'GA', quantity: 2, price: 250_000, DonGiaChot: 999}],
  });

  assert.equal(hold.status, 'ACTIVE');
  assert.equal(hold.items.length, 1);
  assert.equal('DonGiaChot' in hold.items[0], false);
  assert.equal('price' in hold.items[0], false);
  assert.deepEqual(hold.items[0], {ticketCode: 'A-1', zoneCode: 'GA', quantity: 2});

  const pricingTouches = storageAccessLog.filter(([, key]) => key === PRICING_KEY);
  assert.equal(pricingTouches.length, 0);
});

test('(f) giữ chỗ demo với zoneCode lạ hoặc thiếu dữ liệu pricing thì từ chối, không rơi về giá caller và không tốn hạn mức', async () => {
  const svc = await setup();

  await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [
      {ticketCode: 'DEMO_VIP-A17', zoneCode: 'DEMO_VIP'},
      {ticketCode: 'DEMO_VIP-A18', zoneCode: 'DEMO_VIP'},
      {ticketCode: 'DEMO_VIP-A19', zoneCode: 'DEMO_VIP'},
    ],
  });

  await assert.rejects(
    () =>
      svc.createSeatHold({
        eventId: DEMO_EVENT_SLUG,
        items: [{ticketCode: 'UNKNOWN-A1', zoneCode: 'UNKNOWN_ZONE', price: 999, DonGiaChot: 999}],
      }),
    (err) => err.code === '22023',
  );

  // Lần giữ lỗi ở trên không chiếm hạn mức còn lại (1 vé).
  const okHold = await svc.createSeatHold({
    eventId: DEMO_EVENT_SLUG,
    items: [{ticketCode: 'DEMO_VIP-A20', zoneCode: 'DEMO_VIP'}],
  });
  assert.equal(okHold.status, 'ACTIVE');
  assert.equal(okHold.items[0].DonGiaChot, DEMO_VIP_SEED_PRICE);

  // Nếu chưa khởi tạo seed demo trong kho pricing thì giữ chỗ demo cũng phải báo lỗi, không tự seed lại.
  const fresh = await setup({seedDemo: false});
  await assert.rejects(
    () =>
      fresh.createSeatHold({
        eventId: DEMO_EVENT_SLUG,
        items: [{ticketCode: 'DEMO_VIP-A17', zoneCode: 'DEMO_VIP', price: 999, DonGiaChot: 999}],
      }),
    (err) => err.code === '22023',
  );
  assert.equal(store.has(PRICING_KEY), false);

  // Ngoài chế độ mock, docBangGiaChotDemo phải ném lỗi nhánh thật, không trả seed demo.
  globalThis.__bpUseMock = false;
  try {
    await assert.rejects(() => fresh.docBangGiaChotDemo(), (err) => err.code === 'KHONG_HO_TRO_NHANH_THAT');
  } finally {
    globalThis.__bpUseMock = true;
  }
});
