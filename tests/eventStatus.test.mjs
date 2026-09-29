import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveSaleStatus, isSaleOpen, SALE_STATUS} from '../src/domain/eventStatus.js';

const base = {
  saleStartsAt: '2026-10-01T10:00:00+07:00',
  saleEndsAt: '2026-10-15T18:00:00+07:00',
  databaseStatus: 'SAP_MO_BAN',
  hasAvailability: true,
};

test('returns UPCOMING before the server sale start', () => {
  assert.equal(deriveSaleStatus({...base, now: '2026-09-29T12:00:00+07:00'}), SALE_STATUS.UPCOMING);
});

test('returns ON_SALE inside the sale window when inventory exists', () => {
  const status = deriveSaleStatus({...base, now: '2026-10-02T12:00:00+07:00'});
  assert.equal(status, SALE_STATUS.ON_SALE);
  assert.equal(isSaleOpen(status), true);
});

test('returns SOLD_OUT when the database or inventory reports no availability', () => {
  assert.equal(
    deriveSaleStatus({...base, now: '2026-10-02T12:00:00+07:00', databaseStatus: 'HET_VE'}),
    SALE_STATUS.SOLD_OUT,
  );
  assert.equal(
    deriveSaleStatus({...base, now: '2026-10-02T12:00:00+07:00', hasAvailability: false}),
    SALE_STATUS.SOLD_OUT,
  );
});

test('returns CLOSED at or after the sale end and for an explicitly closed event', () => {
  assert.equal(
    deriveSaleStatus({...base, now: '2026-10-15T18:00:00+07:00'}),
    SALE_STATUS.CLOSED,
  );
  assert.equal(
    deriveSaleStatus({...base, now: '2026-10-02T12:00:00+07:00', databaseStatus: 'DONG_BAN'}),
    SALE_STATUS.CLOSED,
  );
});

