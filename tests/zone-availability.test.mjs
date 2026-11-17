import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {summarizeZoneAvailability} from '../src/domain/seatMap.js';

const seat = (zone, status) => ({KhuVucID: zone, TrangThai: status});

test('a zone with no free seat is sold out', () => {
  const seats = [seat(1, 'DA_BAN'), seat(1, 'DANG_GIU'), seat(1, 'DA_BAN'), seat(2, 'TRONG')];
  assert.deepEqual(summarizeZoneAvailability({KhuVucID: 1}, seats), {available: 0, total: 3, soldOut: true});
});

test('a zone with at least one free seat is not sold out and counts only free seats', () => {
  const seats = [seat(2, 'TRONG'), seat(2, 'DA_BAN'), seat(2, 'TRONG')];
  assert.deepEqual(summarizeZoneAvailability({KhuVucID: 2}, seats), {available: 2, total: 3, soldOut: false});
});

test('seats held by someone else are not available but do not by themselves hide the zone', () => {
  const seats = [seat(3, 'DANG_GIU'), seat(3, 'TRONG')];
  assert.equal(summarizeZoneAvailability({KhuVucID: 3}, seats).soldOut, false);
});

test('zones without seat rows (standing) and bad input are never reported sold out', () => {
  assert.equal(summarizeZoneAvailability({KhuVucID: 9}, [seat(1, 'DA_BAN')]).soldOut, false);
  assert.equal(summarizeZoneAvailability({KhuVucID: 9}, []).soldOut, false);
  assert.equal(summarizeZoneAvailability(null, [seat(1, 'DA_BAN')]).soldOut, false);
  assert.equal(summarizeZoneAvailability({KhuVucID: 1}, undefined).soldOut, false);
});

test('reference fixtures: partially sold catalog has no sold-out zone, all-sold catalog has only sold-out zones', async () => {
  const load = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
  const check = (seats) => [...new Set(seats.map((s) => s.KhuVucID))].map((id) => {
    const summary = summarizeZoneAvailability({KhuVucID: id}, seats);
    // Cross-check against a direct count so the test cannot pass vacuously.
    const direct = seats.filter((s) => s.KhuVucID === id && s.TrangThai === 'TRONG').length;
    assert.equal(summary.available, direct);
    return summary;
  });

  const partial = check(await load('data_seats.json'));
  assert.ok(partial.length > 0 && partial.every((z) => !z.soldOut));

  const allSold = check(await load('data_seats_allsold.json'));
  assert.ok(allSold.length > 0 && allSold.every((z) => z.soldOut));
});
