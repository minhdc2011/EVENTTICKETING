import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  resolvePurchaseLimits,
  SERVER_MAX_TICKETS_PER_ORDER,
  DEFAULT_HOLD_MINUTES,
} from '../src/domain/purchaseLimits.js';
import {
  isStandingZone,
  setStandingQuantity,
  sumStanding,
  buildStandingHoldItems,
  calculateStandingTotal,
  findZoneForTier,
} from '../src/domain/standingSelection.js';

const zones = [
  {KhuVucID: 1, MaKhuVuc: 'VIP', TenKhuVuc: 'VIP', GiaVeNiemYet: 3000000, LoaiKhuVuc: 'GHE_NGOI'},
  {KhuVucID: 4, MaKhuVuc: 'GA_1', TenKhuVuc: 'GA 1', GiaVeNiemYet: 2200000, LoaiKhuVuc: 'DUNG_STAND', TongSoGhe: 3},
  {KhuVucID: 5, MaKhuVuc: 'GA_2', TenKhuVuc: 'GA 2', GiaVeNiemYet: 1800000, LoaiKhuVuc: 'DUNG_STAND'},
];

test('purchase limits fall back to defaults when the event has no configuration', () => {
  const limits = resolvePurchaseLimits(null);
  assert.equal(limits.maxPerOrder, SERVER_MAX_TICKETS_PER_ORDER);
  assert.equal(limits.holdMinutes, DEFAULT_HOLD_MINUTES);
  assert.equal(limits.cappedByServer, false);
});

test('purchase limits read the configured values but never exceed the server cap', () => {
  assert.deepEqual(resolvePurchaseLimits({maxTicketsPerOrder: 2, holdMinutes: 10}), {
    maxPerOrder: 2,
    configuredMax: 2,
    holdMinutes: 10,
    cappedByServer: false,
  });
  const big = resolvePurchaseLimits({maxTicketsPerOrder: 20, holdMinutes: 5});
  assert.equal(big.maxPerOrder, SERVER_MAX_TICKETS_PER_ORDER);
  assert.equal(big.configuredMax, 20);
  assert.equal(big.cappedByServer, true);
  assert.equal(resolvePurchaseLimits({maxTicketsPerOrder: 'x', holdMinutes: -3}).holdMinutes, DEFAULT_HOLD_MINUTES);
});

test('standing zones are recognised by LoaiKhuVuc', () => {
  assert.equal(isStandingZone(zones[1]), true);
  assert.equal(isStandingZone(zones[0]), false);
  assert.equal(isStandingZone(null), false);
});

test('standing quantity is clamped to the per-order cap shared with seats and other standing zones', () => {
  let r = setStandingQuantity({}, 'GA_1', 3, {maxPerOrder: 4, seatedCount: 2});
  assert.equal(r.quantity, 2);
  assert.equal(r.clamped, true);
  r = setStandingQuantity({GA_1: 2}, 'GA_2', 5, {maxPerOrder: 4, seatedCount: 0});
  assert.deepEqual(r.standing, {GA_1: 2, GA_2: 2});
  r = setStandingQuantity({GA_1: 2}, 'GA_1', 0, {maxPerOrder: 4});
  assert.deepEqual(r.standing, {});
  r = setStandingQuantity({}, 'GA_1', 4, {maxPerOrder: 4, available: 3});
  assert.equal(r.quantity, 3);
  assert.equal(sumStanding({GA_1: 2, GA_2: 1}), 3);
});

test('standing hold items carry zoneCode and quantity, and totals use the zone price', () => {
  const standing = {GA_1: 2, GA_2: 1, GHOST: 3};
  assert.deepEqual(buildStandingHoldItems(standing, zones), [
    {ticketCode: '', zoneCode: 'GA_1', quantity: 2},
    {ticketCode: '', zoneCode: 'GA_2', quantity: 1},
  ]);
  assert.equal(calculateStandingTotal(standing, zones), 2 * 2200000 + 1800000);
});

test('a ticket tier maps to the zone with the same code', () => {
  assert.equal(findZoneForTier({code: 'VIP'}, zones)?.KhuVucID, 1);
  assert.equal(findZoneForTier({code: 'NOPE'}, zones), null);
  assert.equal(findZoneForTier(null, zones), null);
});

test('the seat map recomputes the sale status on a timer and reads limits from configuration', async () => {
  const src = await readFile(new URL('../src/components/event-template/SeatMapSection.tsx', import.meta.url), 'utf8');
  assert.match(src, /setInterval\(\(\) => setClock\(Date\.now\(\)\)/);
  assert.match(src, /now: new Date\(clock\)/);
  assert.match(src, /loadEventPurchaseConfig/);
  assert.doesNotMatch(src, /giữ tối đa 4 vé/);
  assert.doesNotMatch(src, /trong 5 phút/);
});

test('drafts load only through the explicit preview=1 branch', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const uses = app.match(/loadEventForPreview/g) ?? [];
  assert.equal(uses.length, 2, 'import and a single call inside the preview branch');
  assert.match(app, /if \(isPreview\) \{[\s\S]*?loadEventForPreview[\s\S]*?\} else \{[\s\S]*?loadPublicEvent/);
});

test('every hold goes through one identity helper that uses the active event context', async () => {
  const booking = await readFile(new URL('../src/services/bookingService.ts', import.meta.url), 'utf8');
  assert.match(booking, /export function resolveHoldRequest/);
  assert.match(booking, /const request = resolveHoldRequest\(rawRequest\)/);
});
