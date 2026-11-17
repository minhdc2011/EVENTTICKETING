import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {resolveSeatSearch} from '../src/domain/seatSearch.js';

const seats = [
  {GheID: 1, KhuVucID: 10, TenKhuVuc: 'VIP Platinum 1', SoHang: 'C', SoGhe: '01', MaGheDayDu: 'VIP1-C-01', TrangThai: 'TRONG'},
  {GheID: 2, KhuVucID: 10, TenKhuVuc: 'VIP Platinum 1', SoHang: 'C', SoGhe: '02', MaGheDayDu: 'VIP1-C-02', TrangThai: 'DA_BAN'},
  {GheID: 3, KhuVucID: 20, TenKhuVuc: 'Khán đài A', SoHang: 'A', SoGhe: '01', MaGheDayDu: 'A-A01', TrangThai: 'TRONG'},
];

test('an existing seat code resolves to its zone and highlights exactly that seat', () => {
  const result = resolveSeatSearch(seats, 'VIP1-C-01');
  assert.deepEqual(
    {status: result.status, zoneId: result.zoneId, seatCode: result.seatCode},
    {status: 'found', zoneId: 10, seatCode: 'VIP1-C-01'},
  );
});

test('matching ignores case and surrounding whitespace', () => {
  for (const input of ['vip1-c-01', '  VIP1-C-01  ', 'Vip1-C-01\t']) {
    const result = resolveSeatSearch(seats, input);
    assert.equal(result.status, 'found', input);
    assert.equal(result.seatCode, 'VIP1-C-01', input);
    assert.equal(result.zoneId, 10, input);
  }
});

test('an unknown seat code is reported as not found and carries no zone', () => {
  const result = resolveSeatSearch(seats, 'ZZZ-999');
  assert.equal(result.status, 'not-found');
  assert.equal(result.zoneId, null);
  assert.equal(result.seatCode, null);
  assert.equal(result.query, 'ZZZ-999');
});

test('a partial code finds the zone but does not single out one seat', () => {
  const result = resolveSeatSearch(seats, 'VIP1-C');
  assert.equal(result.status, 'found');
  assert.equal(result.zoneId, 10);
  assert.equal(result.seatCode, null);
  assert.equal(result.matchCount, 2);
});

test('empty input, whitespace and a not-yet-loaded catalog are idle (no false "not found")', () => {
  assert.equal(resolveSeatSearch(seats, '').status, 'idle');
  assert.equal(resolveSeatSearch(seats, '   ').status, 'idle');
  assert.equal(resolveSeatSearch([], 'VIP1-C-01').status, 'idle');
  assert.equal(resolveSeatSearch(undefined, 'VIP1-C-01').status, 'idle');
  assert.equal(resolveSeatSearch(seats, null).status, 'idle');
});

test('resolution does not depend on seat status: sold seats are still found', () => {
  const result = resolveSeatSearch(seats, 'VIP1-C-02');
  assert.equal(result.status, 'found');
  assert.equal(result.seatCode, 'VIP1-C-02');
});

test('works against the bundled Super Concert catalog (48 seats)', async () => {
  const catalog = JSON.parse(await readFile(new URL('../public/data_seats.json', import.meta.url), 'utf8'));
  assert.equal(resolveSeatSearch(catalog, 'vvip-a-01').status, 'found');
  assert.equal(resolveSeatSearch(catalog, 'ZZZ-999').status, 'not-found');
});
