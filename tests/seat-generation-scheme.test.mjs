import assert from 'node:assert/strict';
import test from 'node:test';
import {SEATS_PER_ROW, generateSeatRows, rowLabel} from '../src/domain/seatGeneration.js';

// src/domain/seatGeneration.js is the reference scheme that the database function
// public.nhan_hang_ghe / dong_bo_ghe_su_kien mirrors (supabase/tests/server_side_seat_generation.sql
// asserts the same values in SQL). Keep both in step.

test('row labels run A..Z then AA, AB ... (bijective base 26)', () => {
  const expected = new Map([
    [0, 'A'], [1, 'B'], [25, 'Z'], [26, 'AA'], [27, 'AB'], [51, 'AZ'], [52, 'BA'], [701, 'ZZ'], [702, 'AAA'],
  ]);
  for (const [index, label] of expected) assert.equal(rowLabel(index), label, `index ${index}`);
});

test('seat codes are <zone>-<row>-<NN> with 10 seats per row, all free', () => {
  const rows = generateSeatRows('VIP', 12);
  assert.equal(SEATS_PER_ROW, 10);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].MaGheDayDu, 'VIP-A-01');
  assert.equal(rows[9].MaGheDayDu, 'VIP-A-10');
  assert.equal(rows[10].MaGheDayDu, 'VIP-B-01');
  assert.equal(rows[11].MaGheDayDu, 'VIP-B-02');
  assert.ok(rows.every((r) => r.TrangThai === 'TRONG'));
});

test('only the missing seats are generated and codes never repeat', () => {
  const rows = generateSeatRows('GA', 25, 10);
  assert.equal(rows.length, 15);
  assert.equal(rows[0].MaGheDayDu, 'GA-B-01');
  assert.equal(new Set(rows.map((r) => r.MaGheDayDu)).size, rows.length);
  assert.deepEqual(generateSeatRows('GA', 10, 10), []);
  assert.deepEqual(generateSeatRows('', 10), []);
});
