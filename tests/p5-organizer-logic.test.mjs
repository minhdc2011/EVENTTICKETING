import assert from 'node:assert/strict';
import test from 'node:test';
import {embedTimelineInDescription, stripTimelineFromDescription, TIMELINE_HEADING} from '../src/domain/eventTimeline.js';
import {parseTimelineFromDescription} from '../src/domain/publicSchedule.js';
import {generateSeatRows, rowLabel} from '../src/domain/seatGeneration.js';
import {
  EVENT_CATEGORY_KEYS,
  CATEGORY_SHORT_LABELS,
  CATEGORY_ORGANIZER_LABELS,
  resolveCategoryKey,
} from '../src/domain/categories.js';
import {VALID_CATEGORIES} from '../src/domain/organizerValidation.js';
import {CATEGORY_KEYS, getCategoryTheme} from '../src/domain/categoryThemes.js';
import {CATEGORY_LABELS} from '../src/components/organizer-ui/organizerLogic.js';
import {getCategoryLabel} from '../src/components/event-template/eventTemplateLogic.js';

const schedule = [
  {startTime: '18:00', endTime: '19:00', title: 'Khai mạc', description: 'Phát biểu chào mừng', order: 2},
  {startTime: '16:30', endTime: '17:30', title: 'Check-in: sảnh chính', order: 1},
  {startTime: '', title: 'Không giờ', order: 3},
  {startTime: '20:00', title: '', order: 4},
];

test('schedule written into the description is read back in the same order', () => {
  const text = embedTimelineInDescription('Mô tả sự kiện.', schedule);
  assert.match(text, /^Mô tả sự kiện\.\n\n### LỊCH TRÌNH CHƯƠNG TRÌNH \(TIMELINE\):\n/);
  const parsed = parseTimelineFromDescription(text);
  assert.deepEqual(parsed.map((p) => [p.startTime, p.endTime, p.title]), [
    ['16:30', '17:30', 'Check-in – sảnh chính'],
    ['18:00', '19:00', 'Khai mạc'],
  ]);
  assert.equal(parsed[1].description, 'Phát biểu chào mừng');
});

test('embedding twice does not duplicate the block and strip removes it', () => {
  const once = embedTimelineInDescription('Mô tả.', schedule);
  const twice = embedTimelineInDescription(once, schedule);
  assert.equal(twice, once);
  assert.equal(twice.split(TIMELINE_HEADING).length - 1, 1);
  assert.equal(stripTimelineFromDescription(twice), 'Mô tả.');
  assert.equal(embedTimelineInDescription('Mô tả.', []), 'Mô tả.');
  assert.equal(embedTimelineInDescription('', schedule).startsWith(TIMELINE_HEADING), true);
  assert.equal(stripTimelineFromDescription(null), '');
});

test('seat rows are numbered per row, skip existing seats, and have unique codes', () => {
  assert.equal(rowLabel(0), 'A');
  assert.equal(rowLabel(25), 'Z');
  assert.equal(rowLabel(26), 'AA');
  const seats = generateSeatRows('VIP_1', 23);
  assert.equal(seats.length, 23);
  assert.deepEqual(seats[0], {SoHang: 'A', SoGhe: '01', MaGheDayDu: 'VIP_1-A-01', TrangThai: 'TRONG'});
  assert.equal(seats[10].MaGheDayDu, 'VIP_1-B-01');
  assert.equal(seats[22].MaGheDayDu, 'VIP_1-C-03');
  assert.equal(new Set(seats.map((s) => s.MaGheDayDu)).size, 23);
  const rest = generateSeatRows('VIP_1', 23, 20);
  assert.deepEqual(rest.map((s) => s.MaGheDayDu), ['VIP_1-C-01', 'VIP_1-C-02', 'VIP_1-C-03']);
  assert.deepEqual(generateSeatRows('VIP_1', 5, 5), []);
  assert.deepEqual(generateSeatRows('', 5), []);
});

test('all category lists derive from one definition of the 7 database values', () => {
  assert.equal(EVENT_CATEGORY_KEYS.length, 7);
  assert.deepEqual(VALID_CATEGORIES, EVENT_CATEGORY_KEYS);
  assert.deepEqual(CATEGORY_KEYS, EVENT_CATEGORY_KEYS);
  assert.deepEqual(Object.keys(CATEGORY_LABELS), [...EVENT_CATEGORY_KEYS]);
  assert.deepEqual(Object.keys(CATEGORY_SHORT_LABELS), [...EVENT_CATEGORY_KEYS]);
  assert.deepEqual(Object.keys(CATEGORY_ORGANIZER_LABELS), [...EVENT_CATEGORY_KEYS]);
});

test('legacy category keys resolve to a canonical one everywhere', () => {
  assert.equal(resolveCategoryKey('trien_lam'), 'THAM_QUAN');
  assert.equal(resolveCategoryKey('CONG_NGHE'), 'HOI_THAO');
  assert.equal(resolveCategoryKey('GIAI_TRI'), 'AM_NHAC');
  assert.equal(resolveCategoryKey('CONG_DONG'), 'KHAC');
  assert.equal(resolveCategoryKey('???'), null);
  assert.equal(resolveCategoryKey(null), null);
  assert.equal(getCategoryTheme('TRIEN_LAM').key, 'THAM_QUAN');
  assert.equal(getCategoryLabel('CONG_NGHE'), 'Hội thảo');
  assert.equal(getCategoryLabel('AM_NHAC'), 'Âm nhạc');
});

test('only the timeline block is removed: later headings and text are kept, other heading styles are recognised', () => {
  const text = 'Giới thiệu.\n\n### LỊCH TRÌNH CHƯƠNG TRÌNH (TIMELINE):\n- **09:00**: Khai mạc\n\n### Lưu ý\nMang theo CCCD.';
  assert.equal(stripTimelineFromDescription(text), 'Giới thiệu.\n\n### Lưu ý\nMang theo CCCD.');
  assert.equal(stripTimelineFromDescription('A\n\n## Lịch trình\n- **09:00**: B'), 'A');
  assert.equal(stripTimelineFromDescription('Không có lịch trình ở đây.'), 'Không có lịch trình ở đây.');
});
