import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  CONFIG_LIMITS,
  validateEventConfiguration,
  validateFullEventAggregate,
} from '../src/domain/organizerValidation.js';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

const baseAggregate = () => ({
  organizationId: 'org-1',
  name: 'Đêm nhạc Kiểm thử',
  slug: 'dem-nhac-kiem-thu',
  category: 'AM_NHAC',
  locationMode: 'OFFLINE',
  venueName: 'Nhà hát',
  address: '1 Đường Thử',
  shows: [],
});

test('purchase configuration accepts empty, partial and in-range values', () => {
  assert.doesNotThrow(() => validateEventConfiguration(undefined));
  assert.doesNotThrow(() => validateEventConfiguration(null));
  assert.doesNotThrow(() => validateEventConfiguration({}));
  assert.doesNotThrow(() => validateEventConfiguration({maxTicketsPerOrder: 4}));
  assert.doesNotThrow(() => validateEventConfiguration({holdMinutes: 15, maxTicketsPerOrder: CONFIG_LIMITS.maxTicketsPerOrder.max}));
});

test('purchase configuration rejects out-of-range and non-integer values with a clear message', () => {
  assert.throws(() => validateEventConfiguration({maxTicketsPerOrder: 0}), /Số vé tối đa mỗi đơn phải là số nguyên từ 1 đến 20/);
  assert.throws(() => validateEventConfiguration({maxTicketsPerOrder: 21}), /từ 1 đến 20/);
  assert.throws(() => validateEventConfiguration({maxTicketsPerOrder: 2.5}), /số nguyên/);
  assert.throws(() => validateEventConfiguration({holdMinutes: 0}), /Thời gian giữ chỗ \(phút\) phải là số nguyên từ 1 đến 60/);
  assert.throws(() => validateEventConfiguration({holdMinutes: 61}), /từ 1 đến 60/);
  assert.throws(() => validateEventConfiguration('x'), /không hợp lệ/);
});

test('the aggregate validation checks the configuration', () => {
  assert.throws(
    () => validateFullEventAggregate({...baseAggregate(), configuration: {maxTicketsPerOrder: 99}}, {isPublishing: false}),
    /từ 1 đến 20/,
  );
  assert.doesNotThrow(() =>
    validateFullEventAggregate({...baseAggregate(), configuration: {maxTicketsPerOrder: 4, holdMinutes: 5}}, {isPublishing: false}),
  );
});

test('the real save sends the configuration, the schedule inside the description, then creates missing seats', async () => {
  const svc = await read('../src/services/organizerService.ts');
  // the whole normalized aggregate (including `configuration`) goes to the RPC
  assert.match(svc, /\.\.\.normalizedInput,\s*description:\s*embedTimelineInDescription\(/);
  assert.match(svc, /ensureSeatsForSeatedTiers\(supabase, savedEventId\)/);
  assert.match(svc, /\.eq\('LoaiKhuVuc', 'GHE_NGOI'\)/);
  assert.match(svc, /generateSeatRows\(String\(zone\.MaKhuVuc\)/);
  // a failure to create seats never fails the save
  assert.match(svc, /return 'Đã lưu sự kiện nhưng chưa tạo được ghế/);
});

test('editing loads the configuration and strips the timeline block from the description field', async () => {
  const svc = await read('../src/services/organizerService.ts');
  assert.match(svc, /from\('CAU_HINH_SU_KIEN'\)/);
  assert.match(svc, /stripTimelineFromDescription\(eventRow\.MoTaChiTiet/);
  assert.match(svc, /artists,\r?\n\s*configuration,\r?\n\s*\};/);
});

test('public pages hide the machine-written timeline block from the narrative', async () => {
  const svc = await read('../src/services/eventService.ts');
  assert.match(svc, /stripTimelineFromDescription\(row\.MoTaChiTiet/);
});

test('the wizard exposes the purchase rules and shows a seat-creation warning after saving', async () => {
  const wiz = await read('../src/components/organizer-ui/OrganizerEventWizard.tsx');
  assert.match(wiz, /Quy tắc mua vé của sự kiện/);
  assert.match(wiz, /updateConfiguration\('maxTicketsPerOrder'/);
  assert.match(wiz, /updateConfiguration\('holdMinutes'/);
  assert.match(wiz, /result\.warning/);
});
