import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';

import {
  HELD_PRICE_NOTE_CLIENT,
  HELD_PRICE_NOTE_SERVER,
  applyPriceSnapshotToCatalog,
  applyPriceSnapshotToInspectedSeat,
  applyPriceSnapshotToSelection,
  applyPriceSnapshotToTiers,
  applyPriceUpdateToCatalog,
  applyPriceUpdateToInspectedSeat,
  applyPriceUpdateToSelection,
  applyPriceUpdateToTiers,
  buildHeldPriceSnapshot,
  describePriceConnectionStatus,
} from '../src/domain/pricePresentation.js';
import {PRICE_MOCK_EVENT, phatThongBaoGiaMock, subscribeToMockPriceUpdates} from '../src/domain/priceRealtime.js';

const scope = {suKienId: 1, suatDienId: 10};
const ev = (khuVucId, gia, extra = {}) => ({
  type: 'ZONE_PRICE_CHANGED',
  suKienId: 1,
  suatDienId: 10,
  khuVucId,
  gia,
  occurredAt: 'x',
  nguon: 'REALTIME',
  ...extra,
});

const tiers = [
  {id: 5, code: 'VIP', name: 'VIP', price: 1000, color: '#fff', capacity: 10, available: 3},
  {id: 6, code: 'STD', name: 'STD', price: 500, color: '#000', capacity: 10, available: 4},
];
const catalog = {
  zones: [
    {KhuVucID: 5, MaKhuVuc: 'VIP', TenKhuVuc: 'VIP', GiaVeNiemYet: 1000},
    {KhuVucID: 6, MaKhuVuc: 'STD', TenKhuVuc: 'STD', GiaVeNiemYet: 500, LoaiKhuVuc: 'DUNG_STAND'},
  ],
  seats: [
    {GheID: 1, KhuVucID: 5, SoHang: 'A', SoGhe: '1', MaGheDayDu: 'VIP-A1', TrangThai: 'DANG_GIU', GiaVeNiemYet: 1000},
    {GheID: 2, KhuVucID: 5, SoHang: 'A', SoGhe: '2', MaGheDayDu: 'VIP-A2', TrangThai: 'DA_BAN', GiaVeNiemYet: 1000},
    {GheID: 3, KhuVucID: 7, SoHang: 'B', SoGhe: '1', MaGheDayDu: 'X-B1', TrangThai: 'TRONG', GiaVeNiemYet: 300},
  ],
};

test('tiers: giá mới cập nhật đúng tier, giữ tham chiếu tier khác', () => {
  const next = applyPriceUpdateToTiers(tiers, ev(5, 1200), scope);
  assert.equal(next[0].price, 1200);
  assert.equal(next[0].available, 3);
  assert.equal(next[1], tiers[1]);
  assert.equal(tiers[0].price, 1000, 'không đột biến đầu vào');
});

test('tiers: giá trùng, không hợp lệ hoặc sai phạm vi giữ nguyên tham chiếu', () => {
  assert.equal(applyPriceUpdateToTiers(tiers, ev(5, 1000), scope), tiers);
  assert.equal(applyPriceUpdateToTiers(tiers, ev(5, 0), scope), tiers);
  assert.equal(applyPriceUpdateToTiers(tiers, ev(5, NaN), scope), tiers);
  assert.equal(applyPriceUpdateToTiers(tiers, ev(5, 1200, {suKienId: 2}), scope), tiers);
  assert.equal(applyPriceUpdateToTiers(tiers, ev(5, 1200, {suatDienId: 11}), scope), tiers);
  assert.equal(applyPriceUpdateToTiers(tiers, ev(5, 1200, {suatDienId: null}), scope), tiers);
  assert.equal(applyPriceUpdateToTiers(tiers, ev(99, 1200), scope), tiers);
  assert.equal(applyPriceUpdateToTiers(tiers, {type: 'OTHER', khuVucId: 5, gia: 1}, scope), tiers);
});

test('tiers: snapshot áp nhiều khu một lần', () => {
  const next = applyPriceSnapshotToTiers(tiers, new Map([[5, 1100], [6, 450], [99, 1]]));
  assert.deepEqual(next.map((t) => t.price), [1100, 450]);
  assert.equal(applyPriceSnapshotToTiers(tiers, new Map([[5, 1000]])), tiers);
  assert.equal(applyPriceSnapshotToTiers(tiers, new Map()), tiers);
});

test('catalog: cập nhật zone + ghế cùng khu và bảo toàn TrangThai', () => {
  const next = applyPriceUpdateToCatalog(catalog, ev(5, 1300), scope);
  assert.equal(next.zones[0].GiaVeNiemYet, 1300);
  assert.equal(next.zones[1], catalog.zones[1]);
  assert.deepEqual(next.seats.map((s) => s.GiaVeNiemYet), [1300, 1300, 300]);
  assert.deepEqual(next.seats.map((s) => s.TrangThai), ['DANG_GIU', 'DA_BAN', 'TRONG']);
  assert.equal(next.seats[2], catalog.seats[2]);
  assert.equal(catalog.seats[0].GiaVeNiemYet, 1000);
});

test('catalog: sai phạm vi / trùng giá / null giữ nguyên', () => {
  assert.equal(applyPriceUpdateToCatalog(catalog, ev(5, 1300, {suatDienId: 99}), scope), catalog);
  assert.equal(applyPriceUpdateToCatalog(catalog, ev(5, 1000), scope), catalog);
  assert.equal(applyPriceUpdateToCatalog(null, ev(5, 1300), scope), null);
  assert.equal(applyPriceSnapshotToCatalog(catalog, new Map([[5, -1]])), catalog);
});

test('selection chưa giữ: cập nhật giá nhưng giữ nguyên danh sách chọn', () => {
  const selected = [catalog.seats[0], catalog.seats[2]];
  const next = applyPriceUpdateToSelection(selected, ev(5, 1400), scope, {hasActiveHold: false});
  assert.equal(next.length, 2);
  assert.deepEqual(next.map((s) => s.MaGheDayDu), ['VIP-A1', 'X-B1']);
  assert.equal(next[0].GiaVeNiemYet, 1400);
  assert.equal(next[1], selected[1]);
  assert.equal(next[0].TrangThai, 'DANG_GIU');
});

test('selection đang giữ: bảo toàn nguyên vẹn', () => {
  const selected = [catalog.seats[0]];
  assert.equal(applyPriceUpdateToSelection(selected, ev(5, 1400), scope, {hasActiveHold: true}), selected);
  assert.equal(applyPriceSnapshotToSelection(selected, new Map([[5, 1400]]), {hasActiveHold: true}), selected);
});

test('inspectedSeat: cập nhật giá tooltip, null và sai phạm vi an toàn', () => {
  const seat = catalog.seats[1];
  const next = applyPriceUpdateToInspectedSeat(seat, ev(5, 1500), scope);
  assert.equal(next.GiaVeNiemYet, 1500);
  assert.equal(next.TrangThai, 'DA_BAN');
  assert.equal(applyPriceUpdateToInspectedSeat(null, ev(5, 1500), scope), null);
  assert.equal(applyPriceUpdateToInspectedSeat(seat, ev(5, 1500, {suKienId: 3}), scope), seat);
});

test('held snapshot: không có DonGiaChot -> đóng băng giá hiển thị, ghi chú trung thực', () => {
  const snap = buildHeldPriceSnapshot({
    selectedSeats: [catalog.seats[0]],
    standing: {STD: 2},
    zones: catalog.zones,
    holdRecord: {items: [{ticketCode: 'VIP-A1', zoneCode: 'VIP'}, {ticketCode: '', zoneCode: 'STD', quantity: 2}]},
  });
  assert.equal(snap.seats[0].unitPrice, 1000);
  assert.equal(snap.seats[0].serverLocked, false);
  assert.equal(snap.standingLines[0].unitPrice, 500);
  assert.equal(snap.standingLines[0].subtotal, 1000);
  assert.equal(snap.total, 2000);
  assert.equal(snap.hasServerLockedPrice, false);
  assert.equal(snap.note, HELD_PRICE_NOTE_CLIENT);
  assert.ok(!/bảo đảm giá chốt/i.test(snap.note));
});

test('held snapshot: snapshot độc lập với cập nhật giá sau đó', () => {
  const snap = buildHeldPriceSnapshot({selectedSeats: [catalog.seats[0]], standing: {}, zones: catalog.zones});
  const live = applyPriceUpdateToCatalog(catalog, ev(5, 9999), scope);
  assert.equal(live.zones[0].GiaVeNiemYet, 9999);
  assert.equal(snap.seats[0].unitPrice, 1000);
});

test('held snapshot: ưu tiên DonGiaChot cho ghế ngồi và vé đứng', () => {
  const snap = buildHeldPriceSnapshot({
    selectedSeats: [catalog.seats[0]],
    standing: {STD: 3},
    zones: catalog.zones,
    holdRecord: {
      items: [
        {ticketCode: 'VIP-A1', zoneCode: 'VIP', DonGiaChot: 900},
        {ticketCode: '', zoneCode: 'STD', quantity: 3, DonGiaChot: '400'},
      ],
    },
  });
  assert.equal(snap.seats[0].unitPrice, 900);
  assert.equal(snap.standingLines[0].unitPrice, 400);
  assert.equal(snap.standingLines[0].subtotal, 1200);
  assert.equal(snap.total, 2100);
  assert.equal(snap.hasServerLockedPrice, true);
  assert.equal(snap.note, HELD_PRICE_NOTE_SERVER);
});

test('held snapshot: DonGiaChot không hợp lệ bị bỏ qua; chốt một phần không tuyên bố chốt toàn bộ', () => {
  const snap = buildHeldPriceSnapshot({
    selectedSeats: [catalog.seats[0], catalog.seats[1]],
    zones: catalog.zones,
    holdRecord: {
      items: [
        {ticketCode: 'VIP-A1', zoneCode: 'VIP', DonGiaChot: 900},
        {ticketCode: 'VIP-A2', zoneCode: 'VIP', DonGiaChot: 0},
      ],
    },
  });
  assert.deepEqual(snap.seats.map((s) => [s.unitPrice, s.serverLocked]), [[900, true], [1000, false]]);
  assert.equal(snap.hasServerLockedPrice, false);
  assert.equal(snap.note, HELD_PRICE_NOTE_CLIENT);
});

test('held snapshot: DonGiaChot cấp bản ghi chỉ dùng khi có đúng một dòng', () => {
  const one = buildHeldPriceSnapshot({
    selectedSeats: [], standing: {STD: 1}, zones: catalog.zones, holdRecord: {DonGiaChot: 450, items: []},
  });
  assert.equal(one.standingLines[0].unitPrice, 450);
  assert.equal(one.hasServerLockedPrice, true);
  const two = buildHeldPriceSnapshot({
    selectedSeats: [catalog.seats[0], catalog.seats[1]], zones: catalog.zones, holdRecord: {DonGiaChot: 450, items: []},
  });
  assert.equal(two.hasServerLockedPrice, false);
  assert.equal(two.seats[0].unitPrice, 1000);
});

test('held snapshot: rỗng không tuyên bố giá chốt', () => {
  const snap = buildHeldPriceSnapshot({});
  assert.equal(snap.total, 0);
  assert.equal(snap.hasServerLockedPrice, false);
});

test('held snapshot: latestPriceMap áp giá hiển thị mới nhất cho ghế ngồi & vé đứng, vẫn ưu tiên DonGiaChot', () => {
  const latestPriceMap = new Map([
    [5, 1350],
    [6, 650],
  ]);

  // Không có DonGiaChot -> dùng giá từ latestPriceMap cho cả ghế ngồi và vé đứng
  const withoutServerLock = buildHeldPriceSnapshot({
    selectedSeats: [catalog.seats[0]],
    standing: {STD: 2},
    zones: catalog.zones,
    holdRecord: {items: [{ticketCode: 'VIP-A1', zoneCode: 'VIP'}, {ticketCode: '', zoneCode: 'STD', quantity: 2}]},
    latestPriceMap,
  });
  assert.equal(withoutServerLock.seats[0].unitPrice, 1350);
  assert.equal(withoutServerLock.seats[0].serverLocked, false);
  assert.equal(withoutServerLock.standingLines[0].unitPrice, 650);
  assert.equal(withoutServerLock.standingLines[0].subtotal, 1300);
  assert.equal(withoutServerLock.total, 2650);
  assert.equal(withoutServerLock.hasServerLockedPrice, false);
  assert.equal(withoutServerLock.note, HELD_PRICE_NOTE_CLIENT);

  // Có DonGiaChot -> DonGiaChot vẫn thắng latestPriceMap cho cả ghế ngồi và vé đứng
  const withServerLock = buildHeldPriceSnapshot({
    selectedSeats: [catalog.seats[0]],
    standing: {STD: 2},
    zones: catalog.zones,
    holdRecord: {
      items: [
        {ticketCode: 'VIP-A1', zoneCode: 'VIP', DonGiaChot: 1100},
        {ticketCode: '', zoneCode: 'STD', quantity: 2, DonGiaChot: 450},
      ],
    },
    latestPriceMap,
  });
  assert.equal(withServerLock.seats[0].unitPrice, 1100);
  assert.equal(withServerLock.seats[0].serverLocked, true);
  assert.equal(withServerLock.standingLines[0].unitPrice, 450);
  assert.equal(withServerLock.standingLines[0].subtotal, 900);
  assert.equal(withServerLock.total, 2000);
  assert.equal(withServerLock.hasServerLockedPrice, true);
  assert.equal(withServerLock.note, HELD_PRICE_NOTE_SERVER);
});

test('kết nối giá: mất kết nối có chữ rõ ràng, độc lập với trạng thái ghế', () => {
  const d = describePriceConnectionStatus('DISCONNECTED');
  assert.equal(d.visible, true);
  assert.match(d.text, /Đang kết nối lại/);
  const e = describePriceConnectionStatus('ERROR');
  assert.equal(e.visible, true);
  assert.equal(e.tone, 'error');
  assert.match(e.text, /Đang thử kết nối lại/);
  assert.equal(describePriceConnectionStatus('CONNECTING').visible, false);
  const re = describePriceConnectionStatus('CONNECTING', {hasConnectedBefore: true});
  assert.equal(re.visible, true);
  assert.match(re.text, /Đang kết nối lại/);
  assert.equal(describePriceConnectionStatus('CONNECTED').visible, false);
  assert.equal(describePriceConnectionStatus('LOCAL_ONLY').visible, true);
  assert.equal(describePriceConnectionStatus(undefined).visible, false);
});


const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loadBundledTsxModule(relativePath) {
  const entry = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: {'.css': 'empty', '.svg': 'text', '.html': 'text'},
    plugins: [
      {
        name: 'resolve-react-esm',
        setup(b) {
          b.onResolve({filter: /^react(-dom)?(\/jsx-runtime|\/jsx-dev-runtime)?$/}, (args) => ({
            path: import.meta.resolve(args.path),
            external: true,
          }));
        },
      },
    ],
  });
  const code = result.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
  return import(dataUrl);
}

test('tích hợp luồng giá mock: cập nhật bảng giá, sơ đồ, tooltip, lựa chọn chưa giữ, giữ chỗ & đổi suất', async () => {
  let mockPrices = {5: 1000, 6: 500};
  const target = new EventTarget();
  const readState = async () => ({
    state: {
      khuVuc: {
        5: {KhuVucID: 5, SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: mockPrices[5]},
        6: {KhuVucID: 6, SuKienID: 1, SuatDienID: 10, GiaVeNiemYet: mockPrices[6]},
        77: {KhuVucID: 77, SuKienID: 1, SuatDienID: 99, GiaVeNiemYet: 9999}, // suất khác
      },
    },
    meta: {luuTru: 'LOCAL_STORAGE'},
  });

  let uiTiers = structuredClone(tiers);
  let uiCatalog = structuredClone(catalog);
  let uiSelection = [catalog.seats[0]];
  let uiInspected = catalog.seats[1];
  let hasActiveHold = false;
  const statuses = [];

  const unsubscribe = subscribeToMockPriceUpdates({
    scope,
    readState,
    eventTarget: target,
    canWriteStorage: () => true,
    onSnapshot: (priceMap) => {
      uiTiers = applyPriceSnapshotToTiers(uiTiers, priceMap);
      uiCatalog = applyPriceSnapshotToCatalog(uiCatalog, priceMap);
      uiSelection = applyPriceSnapshotToSelection(uiSelection, priceMap, {hasActiveHold});
      uiInspected = applyPriceSnapshotToInspectedSeat(uiInspected, priceMap);
    },
    listener: (event) => {
      uiTiers = applyPriceUpdateToTiers(uiTiers, event, scope);
      uiCatalog = applyPriceUpdateToCatalog(uiCatalog, event, scope);
      uiSelection = applyPriceUpdateToSelection(uiSelection, event, scope, {hasActiveHold});
      uiInspected = applyPriceUpdateToInspectedSeat(uiInspected, event, scope);
    },
    onConnectionStatus: (status) => statuses.push(status),
  });

  await flushMicrotasks();
  assert.deepEqual(statuses, ['CONNECTING', 'CONNECTED']);

  // 1. Giá mới đẩy qua mock event -> cập nhật đồng thời tiers, zones, seats, tooltip và lựa chọn chưa giữ
  mockPrices = {5: 1350, 6: 550};
  phatThongBaoGiaMock(target, {suKienId: 1});
  await flushMicrotasks();

  assert.deepEqual(uiTiers.map((t) => t.price), [1350, 550]);
  assert.equal(uiCatalog.zones[0].GiaVeNiemYet, 1350);
  assert.equal(uiCatalog.zones[1].GiaVeNiemYet, 550);
  assert.equal(uiCatalog.seats[0].GiaVeNiemYet, 1350);
  assert.equal(uiCatalog.seats[0].TrangThai, 'DANG_GIU', 'Cập nhật giá không làm đổi trạng thái ghế');
  assert.equal(uiSelection.length, 1);
  assert.equal(uiSelection[0].GiaVeNiemYet, 1350);
  assert.equal(uiInspected.GiaVeNiemYet, 1350);

  // 2. Khi đang giữ chỗ: đóng băng snapshot giá (ghế + vé đứng), bảng giá & sơ đồ vẫn cập nhật
  hasActiveHold = true;
  const heldSnapshot = buildHeldPriceSnapshot({
    selectedSeats: uiSelection,
    standing: {STD: 2},
    zones: uiCatalog.zones,
    holdRecord: {items: [{ticketCode: 'VIP-A1', zoneCode: 'VIP'}, {ticketCode: '', zoneCode: 'STD', quantity: 2}]},
  });
  assert.equal(heldSnapshot.total, 1350 + 550 * 2);

  mockPrices = {5: 1900, 6: 700};
  phatThongBaoGiaMock(target);
  await flushMicrotasks();

  assert.deepEqual(uiTiers.map((t) => t.price), [1900, 700]);
  assert.equal(uiCatalog.zones[0].GiaVeNiemYet, 1900);
  assert.equal(uiInspected.GiaVeNiemYet, 1900);
  assert.equal(uiSelection[0].GiaVeNiemYet, 1350, 'Ghế đang giữ không đổi giá theo thị trường');
  assert.equal(heldSnapshot.total, 2450);

  // 3. Đổi suất / hủy listener -> cập nhật sau khi hủy bị chặn hoàn toàn
  unsubscribe();
  mockPrices = {5: 2500, 6: 900};
  target.dispatchEvent(new Event(PRICE_MOCK_EVENT));
  await flushMicrotasks();
  assert.equal(uiTiers[0].price, 1900);
});

test('render React component: TicketTiersSection, MobileStickyBar, SelectionSummary, HoldConfirmationDialog, SeatTooltip, ZoneSeatGrid', async () => {
  const [
    {TicketTiersSection},
    {MobileStickyBar},
    {SelectionSummary},
    {HoldConfirmationDialog},
    {SeatTooltip},
    {ZoneSeatGrid},
  ] = await Promise.all([
    loadBundledTsxModule('../src/components/event-template/TicketTiersSection.tsx'),
    loadBundledTsxModule('../src/components/event-template/MobileStickyBar.tsx'),
    loadBundledTsxModule('../src/components/event-template/SelectionSummary.tsx'),
    loadBundledTsxModule('../src/components/event-template/HoldConfirmationDialog.tsx'),
    loadBundledTsxModule('../src/components/event-template/SeatTooltip.tsx'),
    loadBundledTsxModule('../src/components/event-template/ZoneSeatGrid.tsx'),
  ]);

  const updatedTiers = applyPriceUpdateToTiers(
    [
      {id: 5, code: 'VIP', name: 'Hạng VIP', price: 1000000, color: '#fbbf24', capacity: 50, available: 12},
      {id: 6, code: 'STD', name: 'Hạng Phổ Thông', price: 500000, color: '#38bdf8', capacity: 100, available: 40},
    ],
    ev(6, 420000),
    scope,
  );

  // 1. TicketTiersSection + trạng thái mất kết nối giá bằng chữ
  const tiersHtml = renderToStaticMarkup(
    React.createElement(TicketTiersSection, {
      tiers: updatedTiers,
      tierState: 'ready',
      priceConnectionStatus: 'DISCONNECTED',
    }),
  );
  assert.match(tiersHtml, /420\.000\s*₫/);
  assert.match(tiersHtml, /Kết nối giá vé đang gián đoạn · Đang kết nối lại…/);

  // 2. MobileStickyBar nhận cùng mảng tiers đã cập nhật (minPrice = 420.000)
  const stickyHtml = renderToStaticMarkup(
    React.createElement(MobileStickyBar, {
      event: {
        id: 1,
        code: 'E1',
        slug: 'e1',
        name: 'Sự kiện thử',
        templateKey: 'DEFAULT',
        category: 'AM_NHAC',
        startsAt: '2026-11-25T19:00:00+07:00',
        endsAt: '2026-11-25T22:00:00+07:00',
        saleStartsAt: '2026-10-01T00:00:00+07:00',
        venueName: 'Sân khấu',
        address: 'Hà Nội',
        capacity: 150,
        databaseSaleStatus: 'DANG_MO_BAN',
        publicationStatus: 'CONG_KHAI',
        selectedShow: {
          id: 10,
          slug: 's1',
          name: 'Suất 1',
          startsAt: '2026-11-25T19:00:00+07:00',
          endsAt: '2026-11-25T22:00:00+07:00',
          saleStartsAt: '2026-10-01T00:00:00+07:00',
          timezone: 'Asia/Ho_Chi_Minh',
          databaseSaleStatus: 'DANG_MO_BAN',
        },
        shows: [],
      },
      tiers: updatedTiers,
      saleStatus: 'ON_SALE',
    }),
  );
  assert.match(stickyHtml, /420\.000\s*₫/);

  // 3. SelectionSummary & HoldConfirmationDialog khi chưa có DonGiaChot -> dùng snapshot tạm tính trung thực
  const heldSeat = {
    GheID: 1,
    KhuVucID: 5,
    TenKhuVuc: 'VIP',
    SoHang: 'A',
    SoGhe: '1',
    MaGheDayDu: 'VIP-A1',
    TrangThai: 'TRONG',
    GiaVeNiemYet: 1000000,
  };
  const standingLines = [{zoneCode: 'STD', name: 'Vé đứng STD', quantity: 2, price: 420000}];
  const clientSnap = buildHeldPriceSnapshot({
    selectedSeats: [heldSeat],
    standing: {STD: 2},
    zones: [
      {KhuVucID: 5, MaKhuVuc: 'VIP', TenKhuVuc: 'VIP', GiaVeNiemYet: 1000000},
      {KhuVucID: 6, MaKhuVuc: 'STD', TenKhuVuc: 'Vé đứng STD', GiaVeNiemYet: 420000, LoaiKhuVuc: 'DUNG_STAND'},
    ],
    holdRecord: {items: [{ticketCode: 'VIP-A1', zoneCode: 'VIP'}, {ticketCode: '', zoneCode: 'STD', quantity: 2}]},
  });

  const summaryClientHtml = renderToStaticMarkup(
    React.createElement(SelectionSummary, {
      selectedSeats: [heldSeat],
      standingLines,
      standingTotal: 840000,
      heldPriceSnapshot: clientSnap,
      saleOpen: true,
      isPending: false,
      hasActiveHold: true,
      isConnectionTrusted: true,
      onRemoveSeat: () => {},
      onClearAll: () => {},
      onProceedHold: () => {},
    }),
  );
  assert.match(summaryClientHtml, /1\.840\.000\s*₫/);
  assert.ok(summaryClientHtml.includes(HELD_PRICE_NOTE_CLIENT));
  assert.doesNotMatch(summaryClientHtml, /Đã chốt/);

  const dialogClientHtml = renderToStaticMarkup(
    React.createElement(HoldConfirmationDialog, {
      isOpen: true,
      onClose: () => {},
      onRelease: () => {},
      holdId: 'hold-1',
      selectedSeats: [heldSeat],
      standingLines,
      heldPriceSnapshot: clientSnap,
      remainingSeconds: 240,
    }),
  );
  assert.match(dialogClientHtml, /1 ghế.*2 vé đứng/);
  assert.match(dialogClientHtml, /1\.840\.000\s*₫/);
  assert.ok(dialogClientHtml.includes(HELD_PRICE_NOTE_CLIENT));

  // 4. SelectionSummary & HoldConfirmationDialog khi có DonGiaChot từ máy chủ
  const lockedSnap = buildHeldPriceSnapshot({
    selectedSeats: [heldSeat],
    standing: {STD: 2},
    zones: [
      {KhuVucID: 5, MaKhuVuc: 'VIP', TenKhuVuc: 'VIP', GiaVeNiemYet: 1200000},
      {KhuVucID: 6, MaKhuVuc: 'STD', TenKhuVuc: 'Vé đứng STD', GiaVeNiemYet: 500000, LoaiKhuVuc: 'DUNG_STAND'},
    ],
    holdRecord: {
      items: [
        {ticketCode: 'VIP-A1', zoneCode: 'VIP', DonGiaChot: 950000},
        {ticketCode: '', zoneCode: 'STD', quantity: 2, DonGiaChot: 400000},
      ],
    },
  });
  const summaryLockedHtml = renderToStaticMarkup(
    React.createElement(SelectionSummary, {
      selectedSeats: [heldSeat],
      standingLines: [{zoneCode: 'STD', name: 'Vé đứng STD', quantity: 2, price: 500000}],
      standingTotal: 1000000,
      heldPriceSnapshot: lockedSnap,
      saleOpen: true,
      isPending: false,
      hasActiveHold: true,
      isConnectionTrusted: true,
      onRemoveSeat: () => {},
      onClearAll: () => {},
      onProceedHold: () => {},
    }),
  );
  assert.match(summaryLockedHtml, /1\.750\.000\s*₫/);
  assert.match(summaryLockedHtml, /Đã chốt/);
  assert.ok(summaryLockedHtml.includes(HELD_PRICE_NOTE_SERVER));

  const dialogLockedHtml = renderToStaticMarkup(
    React.createElement(HoldConfirmationDialog, {
      isOpen: true,
      onClose: () => {},
      onRelease: () => {},
      holdId: 'hold-2',
      selectedSeats: [heldSeat],
      standingLines: [{zoneCode: 'STD', name: 'Vé đứng STD', quantity: 2, price: 500000}],
      heldPriceSnapshot: lockedSnap,
      remainingSeconds: 240,
    }),
  );
  assert.match(dialogLockedHtml, /1\.750\.000\s*₫/);
  assert.match(dialogLockedHtml, /Đã chốt/);
  assert.ok(dialogLockedHtml.includes(HELD_PRICE_NOTE_SERVER));

  // 5. SeatTooltip & ZoneSeatGrid hiển thị giá cập nhật với et-num
  const tooltipHtml = renderToStaticMarkup(
    React.createElement(SeatTooltip, {
      visible: true,
      x: 10,
      y: 20,
      seatCode: 'VIP-A1',
      zoneName: 'VIP',
      row: 'A',
      number: '1',
      priceFormatted: '1.350.000 VNĐ',
      status: 'available',
      statusText: 'Còn trống',
    }),
  );
  assert.match(tooltipHtml, /id="tooltip-price"[^>]*et-num/);
  assert.match(tooltipHtml, /1\.350\.000 VNĐ/);

  const gridHtml = renderToStaticMarkup(
    React.createElement(ZoneSeatGrid, {
      zone: {KhuVucID: 5, MaKhuVuc: 'VIP', TenKhuVuc: 'VIP', GiaVeNiemYet: 1350000},
      rows: [{rowLabel: 'A', seats: [{...heldSeat, GiaVeNiemYet: 1350000}]}],
      selectedSeats: [],
      searchQuery: '',
      saleOpen: true,
      isPending: false,
      hasActiveHold: false,
      inspectedSeat: {...heldSeat, GiaVeNiemYet: 1350000},
      onInspectSeat: () => {},
      onToggleSeat: () => {},
      onBackToOverview: () => {},
    }),
  );
  assert.match(gridHtml, /1\.350\.000\s*₫/);
  assert.match(gridHtml, /class="et-num"/);
});

test('kiểm tra hợp đồng tích hợp UI & CSS: scope, cleanup, kết nối độc lập, không sửa RPC giữ chỗ', async () => {
  const [
    genericPageTsx,
    seatMapTsx,
    eventTemplateTsx,
    bookingServiceTs,
    seatMapCss,
    templateCss,
  ] = await Promise.all([
    readFile(new URL('../src/components/GenericEventPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/event-template/SeatMapSection.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/event-template/EventTemplate.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/bookingService.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/event-template/SeatMapSection.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/event-template/event-template.css', import.meta.url), 'utf8'),
  ]);

  // GenericEventPage tích hợp subscribeToPriceUpdates theo event.id & selectedShow?.id, hủy & chặn cập nhật cũ + generation ID chống race A→B→A
  assert.match(genericPageTsx, /subscribeToPriceUpdates\(/);
  assert.match(genericPageTsx, /suKienId:\s*event\.id[\s\S]*?suatDienId:\s*event\.selectedShow\?\.id/);
  assert.match(genericPageTsx, /activeScopeKeyRef\.current\s*!==\s*effectScopeKey/);
  assert.match(genericPageTsx, /tierReqIdRef/);
  assert.match(genericPageTsx, /isMountedRef/);
  assert.match(genericPageTsx, /tierReqIdRef\.current\s*\+=\s*1/);
  assert.match(genericPageTsx, /applyPriceSnapshotToTiers/);
  assert.match(genericPageTsx, /applyPriceUpdateToTiers/);
  assert.match(genericPageTsx, /unsubscribe\(\)/);
  assert.match(eventTemplateTsx, /<MobileStickyBar[\s\S]*tiers=\{tiers\}/);

  // SeatMapSection tích hợp subscribeToPriceUpdates theo currentScopeKey, bảo toàn pan/zoom, seat realtime, countdown + generation ID chống race A→B→A
  assert.match(seatMapTsx, /subscribeToPriceUpdates\(/);
  assert.match(seatMapTsx, /catalogReqIdRef/);
  assert.match(seatMapTsx, /catalogReqIdRef\.current\s*\+=\s*1/);
  assert.match(seatMapTsx, /const isStale\s*=/);
  assert.match(seatMapTsx, /applyPriceUpdateToCatalog/);
  assert.match(seatMapTsx, /applyPriceUpdateToSelection/);
  assert.match(seatMapTsx, /applyPriceUpdateToInspectedSeat/);
  assert.match(seatMapTsx, /buildHeldPriceSnapshot/);
  assert.match(seatMapTsx, /setHeldPriceSnapshot\(null\)/);
  assert.match(seatMapTsx, /const isConnectionTrusted = isMock \|\| connectionStatus === 'CONNECTED';/);
  assert.match(seatMapTsx, /data-od-id="price-connection-status"/);
  assert.doesNotMatch(seatMapTsx, /isConnectionTrusted\s*=.*priceConnectionStatus/);

  // Không sửa RPC giữ chỗ trong bookingService.ts
  assert.match(bookingServiceTs, /supabase\.rpc\('tao_giu_cho_theo_suat'/);
  assert.match(bookingServiceTs, /supabase\.rpc\('tao_giu_cho'/);
  assert.match(bookingServiceTs, /supabase\.rpc\('huy_giu_cho'/);

  // CSS hỗ trợ tabular-nums, reduced-motion và kích thước chữ hợp lệ
  assert.match(seatMapCss, /\.et-price-status-bar/);
  assert.match(seatMapCss, /\.et-num/);
  assert.match(templateCss, /\.et-price-sync-status/);
  assert.match(templateCss, /prefers-reduced-motion:\s*reduce/);
});

// ---- Kiểm thử hành vi SeatMapSection thật với deferred RPC ----

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function createSeatMapTestDom() {
  const docListeners = new Map();
  const winListeners = new Map();
  const intervals = new Map();
  let nextTimerId = 1;

  class DomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = init.bubbles ?? true;
      this.cancelable = init.cancelable ?? true;
      this.key = init.key;
      this.shiftKey = Boolean(init.shiftKey);
      this.detail = init.detail;
      this.defaultPrevented = false;
      this._stopped = false;
      this.target = null;
      this.currentTarget = null;
      this._path = [];
    }
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    }
    stopPropagation() {
      this._stopped = true;
    }
    stopImmediatePropagation() {
      this._stopped = true;
    }
    composedPath() {
      return this._path;
    }
  }

  class DomNode {
    constructor(nodeType, doc) {
      this.nodeType = nodeType;
      this.ownerDocument = doc;
      this.parentNode = null;
      this.childNodes = [];
      this._listeners = new Map();
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    get firstChild() {
      return this.childNodes[0] ?? null;
    }
    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] ?? null;
    }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 ? (this.parentNode.childNodes[idx + 1] ?? null) : null;
    }
    get previousSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx > 0 ? this.parentNode.childNodes[idx - 1] : null;
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === doc.documentElement || cur === doc) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    appendChild(child) {
      return this.insertBefore(child, null);
    }
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      if (ref == null) this.childNodes.push(child);
      else {
        const idx = this.childNodes.indexOf(ref);
        if (idx >= 0) this.childNodes.splice(idx, 0, child);
        else this.childNodes.push(child);
      }
      return child;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    replaceChild(newChild, oldChild) {
      this.insertBefore(newChild, oldChild);
      this.removeChild(oldChild);
      return oldChild;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this._listeners.get(type)?.delete(fn);
    }
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      const path = [];
      for (let cur = this; cur; cur = cur.parentNode) path.push(cur);
      path.push(doc);
      event._path = path;
      for (const node of path) {
        if (event._stopped) break;
        event.currentTarget = node;
        const set = node === doc ? docListeners.get(event.type) : node._listeners.get(event.type);
        if (set) {
          for (const fn of [...set]) fn.call(node, event);
        }
        if (!event.bubbles) break;
      }
      return !event.defaultPrevented;
    }
    contains(other) {
      for (let cur = other; cur; cur = cur.parentNode) {
        if (cur === this) return true;
      }
      return false;
    }
  }

  class DomText extends DomNode {
    constructor(text, doc) {
      super(3, doc);
      this.nodeName = '#text';
      this._text = String(text);
    }
    get nodeValue() {
      return this._text;
    }
    set nodeValue(v) {
      this._text = String(v);
    }
    get textContent() {
      return this._text;
    }
    set textContent(v) {
      this._text = String(v);
    }
  }

  class DomComment extends DomNode {
    constructor(text, doc) {
      super(8, doc);
      this.nodeName = '#comment';
      this.data = String(text);
    }
  }

  class DomElement extends DomNode {
    constructor(tag, doc, ns = 'http://www.w3.org/1999/xhtml') {
      super(1, doc);
      this.tagName = String(tag).toUpperCase();
      this.nodeName = this.tagName;
      this.namespaceURI = ns;
      this._attrs = new Map();
      this.style = {
        setProperty(k, v) {
          this[k] = v;
        },
        removeProperty(k) {
          delete this[k];
        },
      };
      this.dataset = {};
      this.disabled = false;
      this.hidden = false;
      this.inert = false;
      this._value = '';
    }
    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1);
    }
    get id() {
      return this._attrs.get('id') ?? '';
    }
    set id(v) {
      this.setAttribute('id', v);
    }
    get className() {
      return this._attrs.get('class') ?? '';
    }
    set className(v) {
      if (v === '' || v == null) this.removeAttribute('class');
      else this.setAttribute('class', v);
    }
    get type() {
      return this._attrs.get('type') ?? (this.tagName === 'BUTTON' ? 'submit' : 'text');
    }
    set type(v) {
      this.setAttribute('type', v);
    }
    get tabIndex() {
      const raw = this._attrs.get('tabindex');
      return raw != null ? Number.parseInt(raw, 10) : -1;
    }
    set tabIndex(v) {
      this.setAttribute('tabindex', String(v));
    }
    get value() {
      return this._value;
    }
    set value(v) {
      this._value = String(v ?? '');
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent ?? '').join('');
    }
    set textContent(v) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      if (v !== '' && v != null) this.appendChild(new DomText(String(v), this.ownerDocument));
    }
    setAttribute(name, value) {
      const k = String(name).toLowerCase();
      this._attrs.set(k, String(value));
      if (k === 'disabled') this.disabled = true;
      if (k === 'hidden') this.hidden = true;
      if (k === 'inert') this.inert = true;
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        this.dataset[camel] = String(value);
      }
    }
    getAttribute(name) {
      const k = String(name).toLowerCase();
      return this._attrs.has(k) ? this._attrs.get(k) : null;
    }
    hasAttribute(name) {
      return this._attrs.has(String(name).toLowerCase());
    }
    removeAttribute(name) {
      const k = String(name).toLowerCase();
      this._attrs.delete(k);
      if (k === 'disabled') this.disabled = false;
      if (k === 'hidden') this.hidden = false;
      if (k === 'inert') this.inert = false;
    }
    getBoundingClientRect() {
      return {left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600};
    }
    scrollIntoView() {}
    descendants() {
      const out = [];
      for (const c of this.children) out.push(c, ...c.descendants());
      return out;
    }
    matchesSimple(part) {
      const p = part.trim();
      if (!p) return false;
      const attrMatch = p.match(/^([a-z0-9_-]*)\[([a-z0-9_-]+)(?:(\^?=)"([^"]*)")?\]$/i);
      if (attrMatch) {
        const [, tag, attr, op, expected] = attrMatch;
        if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
        const k = attr.toLowerCase();
        if (k === 'hidden') return this.hidden || this.hasAttribute('hidden');
        if (k === 'inert') return this.inert || this.hasAttribute('inert');
        if (!this.hasAttribute(k)) return false;
        if (!op) return true;
        const actual = this.getAttribute(k) ?? '';
        return op === '^=' ? actual.startsWith(expected) : actual === expected;
      }
      if (p.startsWith('.')) return this.className.split(/\s+/).includes(p.slice(1));
      if (p.startsWith('#')) return this.id === p.slice(1);
      return this.tagName.toLowerCase() === p.toLowerCase();
    }
    closest(selector) {
      const parts = String(selector).split(',');
      for (let cur = this; cur && cur.nodeType === 1; cur = cur.parentElement) {
        if (parts.some((p) => cur.matchesSimple(p))) return cur;
      }
      return null;
    }
    querySelectorAll(selector) {
      const parts = String(selector).split(',');
      return this.descendants().filter((el) => parts.some((p) => el.matchesSimple(p)));
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    focus() {
      if (!this.isConnected || this.disabled || this.closest('[hidden],[inert]')) return;
      doc.activeElement = this;
      this.dispatchEvent(new DomEvent('focusin', {bubbles: true}));
    }
  }

  class DomIFrameElement extends DomElement {}

  const doc = {
    nodeType: 9,
    activeElement: null,
    documentElement: null,
    body: null,
    defaultView: null,
    createElement: (tag) => new DomElement(tag, doc),
    createElementNS: (ns, tag) => new DomElement(tag, doc, ns),
    createTextNode: (t) => new DomText(t, doc),
    createComment: (t) => new DomComment(t, doc),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    querySelectorAll: (sel) => doc.body.querySelectorAll(sel),
    querySelector: (sel) => doc.body.querySelector(sel),
    getElementById: (id) => doc.body.querySelector(`#${id}`),
  };
  const html = new DomElement('html', doc);
  const body = new DomElement('body', doc);
  html.appendChild(body);
  doc.documentElement = html;
  doc.body = body;
  doc.activeElement = body;

  const win = {
    document: doc,
    location: {
      pathname: '/',
      search: '',
      hash: '',
      origin: 'http://localhost',
      href: 'http://localhost/',
    },
    setInterval(fn, ms) {
      const id = nextTimerId++;
      const handle = globalThis.setInterval(fn, ms);
      intervals.set(id, {fn, ms, handle});
      return id;
    },
    clearInterval(id) {
      const entry = intervals.get(id);
      if (entry) {
        globalThis.clearInterval(entry.handle);
        intervals.delete(id);
      }
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    requestAnimationFrame: (fn) => globalThis.setTimeout(() => fn(Date.now()), 0),
    cancelAnimationFrame: globalThis.clearTimeout.bind(globalThis),
    matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}}),
    getComputedStyle: () => ({display: 'block', visibility: 'visible'}),
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    dispatchEvent(event) {
      const set = winListeners.get(event.type);
      if (set) {
        for (const fn of [...set]) fn.call(win, event);
      }
      return true;
    },
    HTMLElement: DomElement,
    HTMLIFrameElement: DomIFrameElement,
    SVGElement: DomElement,
    Element: DomElement,
    Node: DomNode,
    Event: DomEvent,
    CustomEvent: DomEvent,
  };
  doc.defaultView = win;

  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  function click(el) {
    assert.ok(el, 'Không tìm thấy phần tử để click');
    assert.equal(el.disabled, false, `Phần tử đang bị disabled: ${el.textContent}`);
    const ev = new DomEvent('click', {bubbles: true, cancelable: true});
    el.dispatchEvent(ev);
  }

  function tickIntervals(ms) {
    for (const entry of [...intervals.values()]) {
      if (entry.ms === ms) entry.fn();
    }
  }

  function cleanupAllIntervals() {
    for (const id of [...intervals.keys()]) win.clearInterval(id);
  }

  return {doc, win, body, click, tickIntervals, cleanupAllIntervals, DomEvent, MockResizeObserver};
}

function makeSeatMapMockCatalog() {
  return {
    zones: [
      {KhuVucID: 5, MaKhuVuc: 'VIP', TenKhuVuc: 'VIP Ngồi', GiaVeNiemYet: 1_000_000, TongSoGhe: 10, LoaiKhuVuc: 'NGOI_GE'},
      {KhuVucID: 6, MaKhuVuc: 'STD', TenKhuVuc: 'Vé Đứng STD', GiaVeNiemYet: 500_000, TongSoGhe: 50, LoaiKhuVuc: 'DUNG_STAND'},
    ],
    seats: [
      {GheID: 1, KhuVucID: 5, TenKhuVuc: 'VIP Ngồi', SoHang: 'A', SoGhe: '1', MaGheDayDu: 'VIP-A1', TrangThai: 'TRONG', GiaVeNiemYet: 1_000_000},
      {GheID: 2, KhuVucID: 5, TenKhuVuc: 'VIP Ngồi', SoHang: 'A', SoGhe: '2', MaGheDayDu: 'VIP-A2', TrangThai: 'TRONG', GiaVeNiemYet: 1_000_000},
    ],
  };
}

function makeSeatMapEvent(showId = 10) {
  return {
    id: 1,
    code: 'E1',
    slug: 'e1',
    name: 'Đêm nhạc thử nghiệm',
    templateKey: 'DEFAULT',
    category: 'AM_NHAC',
    startsAt: '2026-11-25T19:00:00+07:00',
    endsAt: '2026-11-25T22:00:00+07:00',
    saleStartsAt: '2026-10-01T00:00:00+07:00',
    saleEndsAt: '2026-12-31T23:59:59+07:00',
    venueName: 'Sân khấu A',
    address: 'Hà Nội',
    capacity: 150,
    databaseSaleStatus: 'DANG_MO_BAN',
    publicationStatus: 'CONG_KHAI',
    selectedShow: {
      id: showId,
      slug: `s-${showId}`,
      name: `Suất ${showId}`,
      startsAt: '2026-11-25T19:00:00+07:00',
      endsAt: '2026-11-25T22:00:00+07:00',
      saleStartsAt: '2026-10-01T00:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
      databaseSaleStatus: 'DANG_MO_BAN',
    },
    shows: [],
  };
}

let cachedSeatMapHarnessPromise = null;
async function loadSeatMapSectionWithHarness() {
  if (!cachedSeatMapHarnessPromise) {
    cachedSeatMapHarnessPromise = (async () => {
      const entry = fileURLToPath(new URL('../src/components/event-template/SeatMapSection.tsx', import.meta.url));
      const built = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'node',
        loader: {'.css': 'empty', '.svg': 'text', '.html': 'text'},
        plugins: [
          {
            name: 'seatmap-test-stubs',
            setup(b) {
              b.onResolve({filter: /^react(-dom)?(\/jsx-runtime|\/jsx-dev-runtime)?$/}, (args) => ({
                path: import.meta.resolve(args.path),
                external: true,
              }));
              b.onResolve({filter: /services\/ticketDataService$/}, () => ({path: 'ticketDataService', namespace: 'seatmap-stub'}));
              b.onResolve({filter: /services\/bookingService$/}, () => ({path: 'bookingService', namespace: 'seatmap-stub'}));
              b.onResolve({filter: /services\/seatRealtimeService$/}, () => ({path: 'seatRealtimeService', namespace: 'seatmap-stub'}));
              b.onResolve({filter: /services\/priceRealtimeService$/}, () => ({path: 'priceRealtimeService', namespace: 'seatmap-stub'}));
              b.onResolve({filter: /services\/eventService$/}, () => ({path: 'eventService', namespace: 'seatmap-stub'}));
              b.onResolve({filter: /config\/runtime$/}, () => ({path: 'runtime', namespace: 'seatmap-stub'}));

              b.onLoad({filter: /^ticketDataService$/, namespace: 'seatmap-stub'}, () => ({
                contents: `export const loadTicketingCatalog = (...args) => globalThis.__SEATMAP_TEST_MOCK__.loadTicketingCatalog(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^bookingService$/, namespace: 'seatmap-stub'}, () => ({
                contents: `
                  export const createSeatHold = (...args) => globalThis.__SEATMAP_TEST_MOCK__.createSeatHold(...args);
                  export const releaseSeatHold = (...args) => globalThis.__SEATMAP_TEST_MOCK__.releaseSeatHold(...args);
                `,
                loader: 'js',
              }));
              b.onLoad({filter: /^seatRealtimeService$/, namespace: 'seatmap-stub'}, () => ({
                contents: `export const subscribeToSeatUpdates = (...args) => globalThis.__SEATMAP_TEST_MOCK__.subscribeToSeatUpdates(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^priceRealtimeService$/, namespace: 'seatmap-stub'}, () => ({
                contents: `export const subscribeToPriceUpdates = (...args) => globalThis.__SEATMAP_TEST_MOCK__.subscribeToPriceUpdates(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^eventService$/, namespace: 'seatmap-stub'}, () => ({
                contents: `export const loadEventPurchaseConfig = (...args) => globalThis.__SEATMAP_TEST_MOCK__.loadEventPurchaseConfig(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^runtime$/, namespace: 'seatmap-stub'}, () => ({
                contents: `
                  export const runtimeConfig = {useMockData: true, eventId: 'e1'};
                  export const getActiveEventContext = () => globalThis.__SEATMAP_TEST_MOCK__.getActiveEventContext();
                `,
                loader: 'js',
              }));
            },
          },
        ],
      });
      const dataUrl = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, 'utf8').toString('base64')}`;
      return (await import(dataUrl)).SeatMapSection;
    })();
  }
  return cachedSeatMapHarnessPromise;
}

async function withMountedSeatMap({initialEvent = makeSeatMapEvent(10), mockOverrides = {}} = {}, fn) {
  const SeatMapSection = await loadSeatMapSectionWithHarness();
  const dom = createSeatMapTestDom();

  const priceSubscribers = new Set();
  const seatSubscribers = new Set();
  let currentShowId = initialEvent.selectedShow?.id ?? 10;

  const defaultMocks = {
    loadTicketingCatalog: async () => structuredClone(makeSeatMapMockCatalog()),
    createSeatHold: async () => ({holdId: 'hold-default', expiresAt: new Date(Date.now() + 300_000).toISOString(), items: []}),
    releaseSeatHold: async () => ({ok: true}),
    subscribeToSeatUpdates: (_onEvent, onStatus) => {
      const sub = {onStatus};
      seatSubscribers.add(sub);
      onStatus?.('CONNECTED');
      return () => seatSubscribers.delete(sub);
    },
    subscribeToPriceUpdates: (onEvent, onStatus, options = {}) => {
      const sub = {onEvent, onStatus, options};
      priceSubscribers.add(sub);
      onStatus?.('CONNECTED');
      return () => priceSubscribers.delete(sub);
    },
    loadEventPurchaseConfig: async () => ({maxTicketsPerOrder: 4, holdMinutes: 5}),
    getActiveEventContext: () => ({eventId: 'e1', eventDatabaseId: 1, showId: currentShowId}),
  };

  const mockApi = {...defaultMocks, ...mockOverrides};
  const emitPrice = (eventPayload) => {
    for (const sub of [...priceSubscribers]) {
      sub.onEvent(eventPayload);
    }
  };
  const emitPriceSnapshot = (priceMap) => {
    for (const sub of [...priceSubscribers]) {
      sub.options?.onSnapshot?.(priceMap);
    }
  };

  const prev = {
    actEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLIFrameElement: globalThis.HTMLIFrameElement,
    SVGElement: globalThis.SVGElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    CustomEvent: globalThis.CustomEvent,
    ResizeObserver: globalThis.ResizeObserver,
    mock: globalThis.__SEATMAP_TEST_MOCK__,
  };

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = dom.win;
  globalThis.document = dom.doc;
  globalThis.HTMLElement = dom.win.HTMLElement;
  globalThis.HTMLIFrameElement = dom.win.HTMLIFrameElement;
  globalThis.SVGElement = dom.win.SVGElement;
  globalThis.Element = dom.win.Element;
  globalThis.Node = dom.win.Node;
  globalThis.CustomEvent = dom.win.CustomEvent;
  globalThis.ResizeObserver = dom.MockResizeObserver;
  globalThis.__SEATMAP_TEST_MOCK__ = mockApi;

  const container = dom.doc.createElement('div');
  dom.body.appendChild(container);
  const root = createRoot(container);

  const renderEvent = async (nextEvent) => {
    currentShowId = nextEvent.selectedShow?.id ?? currentShowId;
    await act(async () => {
      root.render(React.createElement(SeatMapSection, {event: nextEvent}));
    });
  };
  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  try {
    await renderEvent(initialEvent);
    await flush();
    await fn({container, dom, renderEvent, flush, emitPrice, emitPriceSnapshot, priceSubscribers});
  } finally {
    dom.cleanupAllIntervals();
    await act(async () => {
      root.unmount();
    });
    globalThis.IS_REACT_ACT_ENVIRONMENT = prev.actEnv;
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.HTMLElement = prev.HTMLElement;
    globalThis.HTMLIFrameElement = prev.HTMLIFrameElement;
    globalThis.SVGElement = prev.SVGElement;
    globalThis.Element = prev.Element;
    globalThis.Node = prev.Node;
    globalThis.CustomEvent = prev.CustomEvent;
    globalThis.ResizeObserver = prev.ResizeObserver;
    globalThis.__SEATMAP_TEST_MOCK__ = prev.mock;
  }
}

test('SeatMapSection hành vi: giá đổi qua realtime khi createSeatHold đang chờ cho cả ghế ngồi và vé đứng (không DonGiaChot & có DonGiaChot)', async () => {
  // (1a) Không có DonGiaChot -> lấy giá hiển thị mới nhất tại lúc createSeatHold resolve
  let pendingHold = createDeferred();
  await withMountedSeatMap(
    {
      mockOverrides: {
        createSeatHold: () => pendingHold.promise,
      },
    },
    async ({container, dom, flush, emitPrice}) => {
      // Mở khu VIP và chọn ghế VIP-A1 (giá ban đầu 1.000.000)
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="zone-vip"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-code="VIP-A1"]'));
      });
      // Chọn 2 vé đứng STD (giá ban đầu 500.000)
      const addStandingBtn = container.querySelector('button[aria-label^="Tăng số lượng vé"]');
      await act(async () => {
        dom.click(addStandingBtn);
      });
      await act(async () => {
        dom.click(addStandingBtn);
      });
      assert.match(container.querySelector('[data-od-id="total-amount"]').textContent, /2\.000\.000\s*₫/);

      // Bấm giữ chỗ -> createSeatHold đang chờ
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="temporary-hold-cta"]'));
      });

      // Trong lúc RPC đang chờ, giá cả khu VIP (ngồi) và STD (đứng) cập nhật qua realtime
      await act(async () => {
        emitPrice(ev(5, 1_350_000));
        emitPrice(ev(6, 650_000));
      });

      // Hoàn tất giữ chỗ không có DonGiaChot -> snapshot phải dùng 1.350.000 + 2 * 650.000 = 2.650.000
      pendingHold.resolve({
        holdId: 'hold-live-1',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        items: [
          {ticketCode: 'VIP-A1', zoneCode: 'VIP'},
          {ticketCode: '', zoneCode: 'STD', quantity: 2},
        ],
      });
      await flush();

      const dialog = container.querySelector('[data-od-id="hold-dialog"]');
      assert.ok(dialog, 'Dialog giữ chỗ phải mở khi giữ thành công');
      assert.match(dialog.textContent, /2\.650\.000\s*₫/);
      assert.match(dialog.textContent, /1\.350\.000\s*₫/);
      assert.match(dialog.textContent, /1\.300\.000\s*₫/);
      assert.ok(dialog.textContent.includes(HELD_PRICE_NOTE_CLIENT));
      assert.match(container.querySelector('[data-od-id="total-amount"]').textContent, /2\.650\.000\s*₫/);

      // Cập nhật giá sau khi giữ thành công không làm thay đổi giá đang giữ
      await act(async () => {
        emitPrice(ev(5, 2_000_000));
        emitPrice(ev(6, 900_000));
      });
      assert.match(container.querySelector('[data-od-id="hold-dialog"]').textContent, /2\.650\.000\s*₫/);
      assert.match(container.querySelector('[data-od-id="total-amount"]').textContent, /2\.650\.000\s*₫/);
    },
  );

  // (1b) Có DonGiaChot -> máy chủ vẫn được ưu tiên dù giá realtime thay đổi trong lúc chờ
  pendingHold = createDeferred();
  await withMountedSeatMap(
    {
      mockOverrides: {
        createSeatHold: () => pendingHold.promise,
      },
    },
    async ({container, dom, flush, emitPrice}) => {
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="zone-vip"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-code="VIP-A1"]'));
      });
      const addStandingBtn = container.querySelector('button[aria-label^="Tăng số lượng vé"]');
      await act(async () => {
        dom.click(addStandingBtn);
      });
      await act(async () => {
        dom.click(addStandingBtn);
      });

      await act(async () => {
        dom.click(container.querySelector('[data-od-id="temporary-hold-cta"]'));
      });
      await act(async () => {
        emitPrice(ev(5, 1_350_000));
        emitPrice(ev(6, 650_000));
      });

      pendingHold.resolve({
        holdId: 'hold-locked-1',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        items: [
          {ticketCode: 'VIP-A1', zoneCode: 'VIP', DonGiaChot: 1_100_000},
          {ticketCode: '', zoneCode: 'STD', quantity: 2, DonGiaChot: 450_000},
        ],
      });
      await flush();

      const dialog = container.querySelector('[data-od-id="hold-dialog"]');
      assert.ok(dialog);
      assert.match(dialog.textContent, /2\.000\.000\s*₫/);
      assert.match(dialog.textContent, /Đã chốt/);
      assert.ok(dialog.textContent.includes(HELD_PRICE_NOTE_SERVER));
      assert.match(container.querySelector('[data-od-id="total-amount"]').textContent, /2\.000\.000\s*₫/);
    },
  );
});

test('SeatMapSection hành vi: đổi suất khi createSeatHold đang chờ không ghi đè suất mới và tự giải phóng hold mồ côi', async () => {
  const show10Hold = createDeferred();
  const show20Hold = createDeferred();
  const releasedIds = [];
  let holdCallIndex = 0;

  await withMountedSeatMap(
    {
      initialEvent: makeSeatMapEvent(10),
      mockOverrides: {
        createSeatHold: () => {
          holdCallIndex += 1;
          return holdCallIndex === 1 ? show10Hold.promise : show20Hold.promise;
        },
        releaseSeatHold: async (holdId) => {
          releasedIds.push(holdId);
          return {ok: true};
        },
      },
    },
    async ({container, dom, renderEvent, flush}) => {
      // Suất 10: chọn ghế và gửi giữ chỗ (đang chờ)
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="zone-vip"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-code="VIP-A1"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="temporary-hold-cta"]'));
      });
      assert.equal(container.querySelector('[data-od-id="temporary-hold-cta"]').disabled, true);

      // Đổi sang suất 20 trước khi hold suất 10 hoàn tất
      await renderEvent(makeSeatMapEvent(20));
      await flush();

      assert.equal(container.querySelector('[data-od-id="hold-dialog"]'), null);
      assert.match(container.querySelector('[data-od-id="selected-tickets"]').textContent, /Chọn một chỗ thật ưng ý/);

      // Suất 20 chọn ghế mới và bắt đầu hold riêng (đang chờ)
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="zone-vip"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-code="VIP-A2"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="temporary-hold-cta"]'));
      });
      assert.equal(container.querySelector('[data-od-id="temporary-hold-cta"]').disabled, true);

      // Hold cũ của suất 10 hoàn tất muộn -> phải bị loại bỏ, tự gọi releaseSeatHold('hold-orphan-10'),
      // không mở dialog, không đặt activeHold, và không tắt trạng thái pending của suất 20!
      show10Hold.resolve({
        holdId: 'hold-orphan-10',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        items: [{ticketCode: 'VIP-A1', zoneCode: 'VIP'}],
      });
      await flush();

      assert.deepEqual(releasedIds, ['hold-orphan-10']);
      assert.equal(container.querySelector('[data-od-id="hold-dialog"]'), null);
      assert.equal(container.querySelector('[data-od-id="temporary-hold-cta"]').disabled, true, 'isPending suất 20 vẫn giữ nguyên');
      assert.ok(container.querySelector('[data-od-id="ticket-vip-a2"]'));
      assert.equal(container.querySelector('[data-od-id="ticket-vip-a1"]'), null);

      // Hold của suất 20 hoàn tất bình thường
      show20Hold.resolve({
        holdId: 'hold-valid-20',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        items: [{ticketCode: 'VIP-A2', zoneCode: 'VIP'}],
      });
      await flush();

      const dialog = container.querySelector('[data-od-id="hold-dialog"]');
      assert.ok(dialog);
      assert.match(dialog.textContent, /hold-valid-20/);
      assert.match(dialog.textContent, /VIP-A2/);
    },
  );
});

test('SeatMapSection hành vi: releaseSeatHold cũ hoàn tất muộn sau khi đã có hold mới không xóa hold mới, snapshot, lựa chọn, dialog hay bộ đếm', async () => {
  let releaseDeferred = createDeferred();
  let holdCall = 0;

  // Kịch bản A: hold-1 hết hạn trong lúc releaseSeatHold(hold-1) đang chờ -> tạo hold-2 -> releaseSeatHold(hold-1) hoàn tất muộn
  await withMountedSeatMap(
    {
      initialEvent: makeSeatMapEvent(10),
      mockOverrides: {
        createSeatHold: async () => {
          holdCall += 1;
          if (holdCall === 1) {
            return {
              holdId: 'hold-old-1',
              expiresAt: new Date(Date.now() + 80).toISOString(),
              items: [{ticketCode: 'VIP-A1', zoneCode: 'VIP'}],
            };
          }
          return {
            holdId: 'hold-new-2',
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
            items: [{ticketCode: 'VIP-A2', zoneCode: 'VIP'}],
          };
        },
        releaseSeatHold: () => releaseDeferred.promise,
      },
    },
    async ({container, dom, flush}) => {
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="zone-vip"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-code="VIP-A1"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="temporary-hold-cta"]'));
      });
      await flush();

      // Kích hoạt hủy hold-old-1 (RPC giữ lại ở trạng thái pending)
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="release-hold"]'));
      });
      assert.equal(container.querySelector('[data-od-id="release-hold"]').disabled, true);

      // Chờ hold-old-1 hết hạn qua timer 1000ms trước khi releaseSeatHold hoàn tất
      await new Promise((r) => setTimeout(r, 100));
      await act(async () => {
        dom.tickIntervals(1000);
      });
      await flush();
      assert.equal(container.querySelector('[data-od-id="hold-dialog"]'), null);

      // Tạo hold-new-2 cho ghế VIP-A2
      await act(async () => {
        dom.click(container.querySelector('[data-code="VIP-A2"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="temporary-hold-cta"]'));
      });
      await flush();

      assert.ok(container.querySelector('[data-od-id="hold-dialog"]'));
      assert.match(container.querySelector('[data-od-id="hold-dialog"]').textContent, /hold-new-2/);

      // releaseSeatHold('hold-old-1') hoàn tất muộn -> không được xóa hold-new-2, snapshot, lựa chọn, dialog hay bộ đếm
      releaseDeferred.resolve({ok: true});
      await flush();

      const dialog = container.querySelector('[data-od-id="hold-dialog"]');
      assert.ok(dialog, 'Dialog của hold mới phải còn mở');
      assert.match(dialog.textContent, /hold-new-2/);
      assert.match(dialog.textContent, /VIP-A2/);
      assert.match(dialog.textContent, /1\.000\.000\s*₫/);
      assert.match(container.querySelector('#countdown').textContent, /0[45]:\d{2}/);
      assert.ok(container.querySelector('[data-od-id="ticket-vip-a2"]'));
      assert.equal(container.querySelector('[data-od-id="release-hold"]').disabled, false);
    },
  );

  // Kịch bản B: đổi suất trong lúc releaseSeatHold(hold-1) đang chờ, tạo hold-2 trên suất 20, rồi release cũ reject muộn
  releaseDeferred = createDeferred();
  holdCall = 0;
  await withMountedSeatMap(
    {
      initialEvent: makeSeatMapEvent(10),
      mockOverrides: {
        createSeatHold: async () => {
          holdCall += 1;
          return {
            holdId: holdCall === 1 ? 'hold-show-10' : 'hold-show-20',
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
            items: [{ticketCode: holdCall === 1 ? 'VIP-A1' : 'VIP-A2', zoneCode: 'VIP'}],
          };
        },
        releaseSeatHold: () => releaseDeferred.promise,
      },
    },
    async ({container, dom, renderEvent, flush}) => {
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="zone-vip"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-code="VIP-A1"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="temporary-hold-cta"]'));
      });
      await flush();

      await act(async () => {
        dom.click(container.querySelector('[data-od-id="release-hold"]'));
      });

      // Đổi sang suất 20 và tạo hold mới hold-show-20
      await renderEvent(makeSeatMapEvent(20));
      await flush();
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="zone-vip"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-code="VIP-A2"]'));
      });
      await act(async () => {
        dom.click(container.querySelector('[data-od-id="temporary-hold-cta"]'));
      });
      await flush();

      // release cũ reject muộn -> không ghi đè banner lỗi hay xóa trạng thái hold-show-20
      releaseDeferred.reject(new Error('Network timeout'));
      await flush();

      const dialog = container.querySelector('[data-od-id="hold-dialog"]');
      assert.ok(dialog);
      assert.match(dialog.textContent, /hold-show-20/);
      assert.match(container.querySelector('[data-od-id="realtime-banner"]').textContent, /Đã giữ chỗ tạm/);
      assert.ok(container.querySelector('[data-od-id="ticket-vip-a2"]'));
    },
  );
});

test('SeatMapSection hành vi A→B→A: phản hồi catalog cũ của A (resolve và reject) không ghi đè dữ liệu, giá, TrangThai ghế hay trạng thái ready của A mới', async () => {
  const makeCatalogA1Stale = () => ({
    zones: [
      {KhuVucID: 5, MaKhuVuc: 'VIP', TenKhuVuc: 'VIP Ngồi', GiaVeNiemYet: 800_000, TongSoGhe: 10, LoaiKhuVuc: 'NGOI_GE'},
      {KhuVucID: 6, MaKhuVuc: 'STD', TenKhuVuc: 'Vé Đứng STD', GiaVeNiemYet: 300_000, TongSoGhe: 50, LoaiKhuVuc: 'DUNG_STAND'},
    ],
    seats: [
      {GheID: 1, KhuVucID: 5, TenKhuVuc: 'VIP Ngồi', SoHang: 'A', SoGhe: '1', MaGheDayDu: 'VIP-A1', TrangThai: 'DA_BAN', GiaVeNiemYet: 800_000},
      {GheID: 2, KhuVucID: 5, TenKhuVuc: 'VIP Ngồi', SoHang: 'A', SoGhe: '2', MaGheDayDu: 'VIP-A2', TrangThai: 'TRONG', GiaVeNiemYet: 800_000},
    ],
  });

  const makeCatalogA2Current = () => ({
    zones: [
      {KhuVucID: 5, MaKhuVuc: 'VIP', TenKhuVuc: 'VIP Ngồi', GiaVeNiemYet: 1_200_000, TongSoGhe: 10, LoaiKhuVuc: 'NGOI_GE'},
      {KhuVucID: 6, MaKhuVuc: 'STD', TenKhuVuc: 'Vé Đứng STD', GiaVeNiemYet: 500_000, TongSoGhe: 50, LoaiKhuVuc: 'DUNG_STAND'},
    ],
    seats: [
      {GheID: 1, KhuVucID: 5, TenKhuVuc: 'VIP Ngồi', SoHang: 'A', SoGhe: '1', MaGheDayDu: 'VIP-A1', TrangThai: 'TRONG', GiaVeNiemYet: 1_200_000},
      {GheID: 2, KhuVucID: 5, TenKhuVuc: 'VIP Ngồi', SoHang: 'A', SoGhe: '2', MaGheDayDu: 'VIP-A2', TrangThai: 'DA_BAN', GiaVeNiemYet: 1_200_000},
    ],
  });

  // Nhánh 1: Yêu cầu A1 cũ resolve muộn với giá và TrangThai cũ
  {
    const reqA1 = createDeferred();
    const reqB = createDeferred();
    const reqA2 = createDeferred();
    let callIdx = 0;

    await withMountedSeatMap(
      {
        initialEvent: makeSeatMapEvent(10),
        mockOverrides: {
          loadTicketingCatalog: () => {
            callIdx += 1;
            if (callIdx === 1) return reqA1.promise;
            if (callIdx === 2) return reqB.promise;
            return reqA2.promise;
          },
        },
      },
      async ({container, dom, renderEvent, flush, emitPrice}) => {
        await renderEvent(makeSeatMapEvent(20));
        await renderEvent(makeSeatMapEvent(10));
        assert.equal(callIdx, 3);

        // A2 hoàn tất trước -> ready, chọn ghế VIP-A1 và nhận giá realtime mới
        reqA2.resolve(makeCatalogA2Current());
        await flush();

        assert.ok(container.querySelector('[data-od-id="zone-vip"]'), 'Sơ đồ A2 phải ở trạng thái ready');
        await act(async () => {
          dom.click(container.querySelector('[data-od-id="zone-vip"]'));
        });
        await act(async () => {
          dom.click(container.querySelector('[data-code="VIP-A1"]'));
        });
        await act(async () => {
          emitPrice(ev(5, 1_450_000));
        });

        assert.equal(container.querySelector('[data-code="VIP-A1"]').getAttribute('data-status'), 'selected');
        assert.equal(container.querySelector('[data-code="VIP-A2"]').getAttribute('data-status'), 'sold');
        assert.match(container.querySelector('[data-od-id="total-amount"]').textContent, /1\.450\.000\s*₫/);

        // A1 cũ resolve muộn với dữ liệu cũ -> không được ghi đè catalog, giá, TrangThai hay lựa chọn của A2
        reqA1.resolve(makeCatalogA1Stale());
        await flush();

        assert.equal(container.querySelector('[data-code="VIP-A1"]').getAttribute('data-status'), 'selected');
        assert.equal(container.querySelector('[data-code="VIP-A2"]').getAttribute('data-status'), 'sold');
        assert.match(container.querySelector('[data-code="VIP-A1"]').getAttribute('aria-label'), /1\.450\.000/);
        assert.match(container.querySelector('[data-od-id="total-amount"]').textContent, /1\.450\.000\s*₫/);
        assert.ok(container.querySelector('[data-od-id="ticket-vip-a1"]'));
        assert.doesNotMatch(container.textContent, /Không thể tải dữ liệu sơ đồ ghế/);
      },
    );
  }

  // Nhánh 2: Yêu cầu A1 cũ reject muộn -> không chuyển catalogState sang error và không ghi log console.error
  {
    const reqA1 = createDeferred();
    const reqB = createDeferred();
    const reqA2 = createDeferred();
    let callIdx = 0;

    const origError = console.error;
    const loggedErrors = [];
    console.error = (...args) => {
      loggedErrors.push(args);
    };

    try {
      await withMountedSeatMap(
        {
          initialEvent: makeSeatMapEvent(10),
          mockOverrides: {
            loadTicketingCatalog: () => {
              callIdx += 1;
              if (callIdx === 1) return reqA1.promise;
              if (callIdx === 2) return reqB.promise;
              return reqA2.promise;
            },
          },
        },
        async ({container, dom, renderEvent, flush, emitPrice}) => {
          await renderEvent(makeSeatMapEvent(20));
          await renderEvent(makeSeatMapEvent(10));

          reqA2.resolve(makeCatalogA2Current());
          await flush();

          await act(async () => {
            dom.click(container.querySelector('[data-od-id="zone-vip"]'));
          });
          await act(async () => {
            dom.click(container.querySelector('[data-code="VIP-A1"]'));
          });
          await act(async () => {
            emitPrice(ev(5, 1_450_000));
          });

          reqA1.reject(new Error('stale A1 catalog network error'));
          await flush();

          assert.equal(loggedErrors.length, 0, 'Không log console.error khi reject từ yêu cầu A1 cũ');
          assert.doesNotMatch(container.textContent, /Không thể tải dữ liệu sơ đồ ghế/);
          assert.equal(container.querySelector('[data-code="VIP-A1"]').getAttribute('data-status'), 'selected');
          assert.equal(container.querySelector('[data-code="VIP-A2"]').getAttribute('data-status'), 'sold');
          assert.match(container.querySelector('[data-od-id="total-amount"]').textContent, /1\.450\.000\s*₫/);
          assert.ok(container.querySelector('[data-od-id="ticket-vip-a1"]'));
        },
      );
    } finally {
      console.error = origError;
    }
  }
});

// ---- Kiểm thử hành vi GenericEventPage thật với deferred loadPublicTicketTiers ----

let cachedGenericPageHarnessPromise = null;
async function loadGenericEventPageWithHarness() {
  if (!cachedGenericPageHarnessPromise) {
    cachedGenericPageHarnessPromise = (async () => {
      const entry = fileURLToPath(new URL('../src/components/GenericEventPage.tsx', import.meta.url));
      const built = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'node',
        define: {'import.meta.env': '{}'},
        loader: {'.css': 'empty', '.svg': 'text', '.html': 'text'},
        plugins: [
          {
            name: 'generic-page-test-stubs',
            setup(b) {
              b.onResolve({filter: /^react(-dom)?(\/jsx-runtime|\/jsx-dev-runtime)?$/}, (args) => ({
                path: import.meta.resolve(args.path),
                external: true,
              }));
              b.onResolve({filter: /services\/eventService$/}, () => ({path: 'eventService', namespace: 'generic-stub'}));
              b.onResolve({filter: /services\/priceRealtimeService$/}, () => ({path: 'priceRealtimeService', namespace: 'generic-stub'}));
              b.onResolve({filter: /services\/scheduleService$/}, () => ({path: 'scheduleService', namespace: 'generic-stub'}));
              b.onResolve({filter: /services\/artistService$/}, () => ({path: 'artistService', namespace: 'generic-stub'}));
              b.onResolve({filter: /config\/runtime$/}, () => ({path: 'runtime', namespace: 'generic-stub'}));
              b.onResolve({filter: /ConcertSections$/}, () => ({path: 'ConcertSections', namespace: 'generic-stub'}));
              b.onResolve({filter: /SeatMapSection$/}, () => ({path: 'SeatMapSection', namespace: 'generic-stub'}));
              b.onResolve({filter: /concertRuntime\.js$/}, () => ({path: 'concertRuntime', namespace: 'generic-stub'}));

              b.onLoad({filter: /^eventService$/, namespace: 'generic-stub'}, () => ({
                contents: `export const loadPublicTicketTiers = (...args) => globalThis.__GENERIC_PAGE_TEST_MOCK__.loadPublicTicketTiers(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^priceRealtimeService$/, namespace: 'generic-stub'}, () => ({
                contents: `export const subscribeToPriceUpdates = (...args) => globalThis.__GENERIC_PAGE_TEST_MOCK__.subscribeToPriceUpdates(...args);`,
                loader: 'js',
              }));
              b.onLoad({filter: /^scheduleService$/, namespace: 'generic-stub'}, () => ({
                contents: `export const loadPublicSchedule = async () => [];`,
                loader: 'js',
              }));
              b.onLoad({filter: /^artistService$/, namespace: 'generic-stub'}, () => ({
                contents: `export const loadPublicArtists = async () => [];`,
                loader: 'js',
              }));
              b.onLoad({filter: /^runtime$/, namespace: 'generic-stub'}, () => ({
                contents: `
                  export const runtimeConfig = {useMockData: true, eventId: 'e1'};
                  export const isSupabaseConfigured = () => false;
                  export const getActiveEventContext = () => ({eventId: 'e1', eventDatabaseId: 1, showId: 10});
                `,
                loader: 'js',
              }));
              b.onLoad({filter: /^ConcertSections$/, namespace: 'generic-stub'}, () => ({
                contents: `
                  export const ArtistLineup = () => null;
                  export const ConcertRuntimeOverlays = () => null;
                  export const SeatingSection = () => null;
                `,
                loader: 'js',
              }));
              b.onLoad({filter: /^SeatMapSection$/, namespace: 'generic-stub'}, () => ({
                contents: `
                  export const SeatMapSection = () => null;
                  export const SeatingSection = () => null;
                `,
                loader: 'js',
              }));
              b.onLoad({filter: /^concertRuntime$/, namespace: 'generic-stub'}, () => ({
                contents: `
                  export const initConcertRuntime = async () => {};
                  export const teardownConcertRuntime = () => {};
                `,
                loader: 'js',
              }));
            },
          },
        ],
      });
      const dataUrl = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, 'utf8').toString('base64')}`;
      return (await import(dataUrl)).GenericEventPage;
    })();
  }
  return cachedGenericPageHarnessPromise;
}

async function withMountedGenericEventPage({initialEvent = makeSeatMapEvent(10), mockOverrides = {}} = {}, fn) {
  const GenericEventPage = await loadGenericEventPageWithHarness();
  const dom = createSeatMapTestDom();

  const priceSubscribers = new Set();
  const defaultMocks = {
    loadPublicTicketTiers: async () => [],
    subscribeToPriceUpdates: (onEvent, onStatus, options = {}) => {
      const sub = {onEvent, onStatus, options};
      priceSubscribers.add(sub);
      onStatus?.('CONNECTED');
      return () => priceSubscribers.delete(sub);
    },
  };
  const mockApi = {...defaultMocks, ...mockOverrides};

  const emitPrice = (eventPayload) => {
    for (const sub of [...priceSubscribers]) {
      sub.onEvent(eventPayload);
    }
  };

  const prev = {
    actEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLIFrameElement: globalThis.HTMLIFrameElement,
    SVGElement: globalThis.SVGElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    CustomEvent: globalThis.CustomEvent,
    ResizeObserver: globalThis.ResizeObserver,
    mock: globalThis.__GENERIC_PAGE_TEST_MOCK__,
  };

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = dom.win;
  globalThis.document = dom.doc;
  globalThis.HTMLElement = dom.win.HTMLElement;
  globalThis.HTMLIFrameElement = dom.win.HTMLIFrameElement;
  globalThis.SVGElement = dom.win.SVGElement;
  globalThis.Element = dom.win.Element;
  globalThis.Node = dom.win.Node;
  globalThis.CustomEvent = dom.win.CustomEvent;
  globalThis.ResizeObserver = dom.MockResizeObserver;
  globalThis.__GENERIC_PAGE_TEST_MOCK__ = mockApi;

  const container = dom.doc.createElement('div');
  dom.body.appendChild(container);
  const root = createRoot(container);

  const renderEvent = async (nextEvent) => {
    await act(async () => {
      root.render(React.createElement(GenericEventPage, {event: nextEvent}));
    });
  };
  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  try {
    await renderEvent(initialEvent);
    await flush();
    await fn({container, dom, renderEvent, flush, emitPrice, priceSubscribers});
  } finally {
    dom.cleanupAllIntervals();
    await act(async () => {
      root.unmount();
    });
    globalThis.IS_REACT_ACT_ENVIRONMENT = prev.actEnv;
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.HTMLElement = prev.HTMLElement;
    globalThis.HTMLIFrameElement = prev.HTMLIFrameElement;
    globalThis.SVGElement = prev.SVGElement;
    globalThis.Element = prev.Element;
    globalThis.Node = prev.Node;
    globalThis.CustomEvent = prev.CustomEvent;
    globalThis.ResizeObserver = prev.ResizeObserver;
    globalThis.__GENERIC_PAGE_TEST_MOCK__ = prev.mock;
  }
}

test('GenericEventPage hành vi A→B→A: phản hồi loadPublicTicketTiers cũ của A (resolve và reject) không ghi đè tiers, giá hay trạng thái ready của A mới', async () => {
  const tiersA1Stale = [
    {id: 5, code: 'VIP', name: 'Hạng VIP Cũ', price: 900_000, color: '#fbbf24', capacity: 50, available: 5},
    {id: 6, code: 'STD', name: 'Hạng Phổ Thông Cũ', price: 300_000, color: '#38bdf8', capacity: 100, available: 20},
  ];
  const tiersA2Current = [
    {id: 5, code: 'VIP', name: 'Hạng VIP Mới', price: 1_200_000, color: '#fbbf24', capacity: 50, available: 12},
    {id: 6, code: 'STD', name: 'Hạng Phổ Thông Mới', price: 500_000, color: '#38bdf8', capacity: 100, available: 40},
  ];

  // Nhánh 1: Yêu cầu A1 cũ resolve muộn sau khi A2 đã xong và nhận giá realtime
  {
    const reqA1 = createDeferred();
    const reqB = createDeferred();
    const reqA2 = createDeferred();
    let callIdx = 0;

    await withMountedGenericEventPage(
      {
        initialEvent: makeSeatMapEvent(10),
        mockOverrides: {
          loadPublicTicketTiers: () => {
            callIdx += 1;
            if (callIdx === 1) return reqA1.promise;
            if (callIdx === 2) return reqB.promise;
            return reqA2.promise;
          },
        },
      },
      async ({container, renderEvent, flush, emitPrice}) => {
        await renderEvent(makeSeatMapEvent(20));
        await renderEvent(makeSeatMapEvent(10));
        assert.equal(callIdx, 3);

        reqA2.resolve(tiersA2Current);
        await flush();

        await act(async () => {
          emitPrice(ev(5, 1_450_000));
          emitPrice(ev(6, 550_000));
        });

        const ticketsSection = container.querySelector('#tickets');
        const stickyBar = container.querySelector('.et-mobile-sticky');
        assert.ok(ticketsSection);
        assert.match(ticketsSection.textContent, /Hạng VIP Mới/);
        assert.match(ticketsSection.textContent, /1\.450\.000\s*₫/);
        assert.match(ticketsSection.textContent, /550\.000\s*₫/);
        assert.ok(stickyBar);
        assert.match(stickyBar.textContent, /550\.000\s*₫/);

        // A1 cũ resolve muộn với giá/tên cũ -> không ghi đè A2
        reqA1.resolve(tiersA1Stale);
        await flush();

        assert.match(container.querySelector('#tickets').textContent, /Hạng VIP Mới/);
        assert.doesNotMatch(container.querySelector('#tickets').textContent, /Hạng VIP Cũ/);
        assert.match(container.querySelector('#tickets').textContent, /1\.450\.000\s*₫/);
        assert.match(container.querySelector('#tickets').textContent, /550\.000\s*₫/);
        assert.match(container.querySelector('.et-mobile-sticky').textContent, /550\.000\s*₫/);
        assert.doesNotMatch(container.querySelector('#tickets').textContent, /Không thể tải thông tin hạng vé lúc này/);
      },
    );
  }

  // Nhánh 2: Yêu cầu A1 cũ reject muộn -> tierState vẫn ready và không log console.error
  {
    const reqA1 = createDeferred();
    const reqB = createDeferred();
    const reqA2 = createDeferred();
    let callIdx = 0;

    const origError = console.error;
    const loggedErrors = [];
    console.error = (...args) => {
      loggedErrors.push(args);
    };

    try {
      await withMountedGenericEventPage(
        {
          initialEvent: makeSeatMapEvent(10),
          mockOverrides: {
            loadPublicTicketTiers: () => {
              callIdx += 1;
              if (callIdx === 1) return reqA1.promise;
              if (callIdx === 2) return reqB.promise;
              return reqA2.promise;
            },
          },
        },
        async ({container, renderEvent, flush, emitPrice}) => {
          await renderEvent(makeSeatMapEvent(20));
          await renderEvent(makeSeatMapEvent(10));

          reqA2.resolve(tiersA2Current);
          await flush();

          await act(async () => {
            emitPrice(ev(5, 1_450_000));
            emitPrice(ev(6, 550_000));
          });

          reqA1.reject(new Error('stale A1 tiers network error'));
          await flush();

          assert.equal(loggedErrors.length, 0, 'Không log console.error khi reject từ yêu cầu A1 cũ');
          const ticketsSection = container.querySelector('#tickets');
          assert.doesNotMatch(ticketsSection.textContent, /Không thể tải thông tin hạng vé lúc này/);
          assert.match(ticketsSection.textContent, /Hạng VIP Mới/);
          assert.match(ticketsSection.textContent, /1\.450\.000\s*₫/);
          assert.match(ticketsSection.textContent, /550\.000\s*₫/);
          assert.match(container.querySelector('.et-mobile-sticky').textContent, /550\.000\s*₫/);
        },
      );
    } finally {
      console.error = origError;
    }
  }
});
