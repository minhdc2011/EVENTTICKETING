import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  SUPER_CONCERT_SCHEDULE,
  formatScheduleTime,
  isSuperConcertEvent,
  normalizeScheduleRow,
  resolvePublicScheduleFallback,
  sortScheduleItems,
} from '../src/domain/publicSchedule.js';

test('Super Concert seeded schedule contains all 6 activities in correct ThuTu order', () => {
  assert.equal(SUPER_CONCERT_SCHEDULE.length, 6, 'Super Concert has exactly 6 seeded schedule activities');

  const expectedActivities = [
    {id: 1, startTime: '16:30', endTime: '17:45', title: 'Mở cổng check-in an ninh', order: 1},
    {id: 2, startTime: '17:45', endTime: '18:30', title: 'Soundcheck VIP Exclusive', order: 2},
    {id: 3, startTime: '18:30', endTime: '19:30', title: 'Warm-up DJ Set', order: 3},
    {id: 4, startTime: '19:30', endTime: '21:15', title: 'Khai mạc Đại nhạc hội Ngoại Thương', order: 4},
    {id: 5, startTime: '21:15', endTime: '22:30', title: 'Sơn Tùng M-TP × Soobin', order: 5},
    {id: 6, startTime: '22:30', endTime: '23:00', title: 'Bế mạc & hướng dẫn ra về an toàn', order: 6},
  ];

  expectedActivities.forEach((expected, index) => {
    const actual = SUPER_CONCERT_SCHEDULE[index];
    assert.equal(actual.id, expected.id, `Item ${index + 1} ID matches`);
    assert.equal(actual.startTime, expected.startTime, `Item ${index + 1} start time matches`);
    assert.equal(actual.endTime, expected.endTime, `Item ${index + 1} end time matches`);
    assert.equal(actual.title, expected.title, `Item ${index + 1} title matches`);
    assert.equal(actual.order, expected.order, `Item ${index + 1} order matches`);
    assert.ok(actual.location && actual.location.length > 0, `Item ${index + 1} has location`);
    assert.ok(actual.description && actual.description.length > 0, `Item ${index + 1} has description`);
  });

  // Verify list is strictly ordered by ThuTu (order) 1..6
  for (let i = 0; i < SUPER_CONCERT_SCHEDULE.length - 1; i++) {
    assert.ok(
      SUPER_CONCERT_SCHEDULE[i].order < SUPER_CONCERT_SCHEDULE[i + 1].order,
      `Order ${SUPER_CONCERT_SCHEDULE[i].order} must be strictly less than ${SUPER_CONCERT_SCHEDULE[i + 1].order}`
    );
  }
});

test('formatScheduleTime strictly validates 24-hour time and returns empty string for malformed input', () => {
  // Valid 24-hour times
  assert.equal(formatScheduleTime('16:30:00'), '16:30');
  assert.equal(formatScheduleTime('16:30'), '16:30');
  assert.equal(formatScheduleTime('9:15:00'), '09:15');
  assert.equal(formatScheduleTime('00:00'), '00:00');
  assert.equal(formatScheduleTime('23:59:59'), '23:59');

  // Supported ISO / datetime shapes with valid time
  assert.equal(formatScheduleTime('2026-10-15T19:30:00+07:00'), '19:30');
  assert.equal(formatScheduleTime('2026-10-15T19:30:00Z'), '19:30');
  assert.equal(formatScheduleTime('2026-10-15 21:15:00'), '21:15');

  // Invalid / malformed time strings return empty string
  assert.equal(formatScheduleTime('99:99'), '', 'Rejects 99:99');
  assert.equal(formatScheduleTime('25:61'), '', 'Rejects 25:61');
  assert.equal(formatScheduleTime('24:00'), '', 'Rejects 24:00 (24h clock max hour is 23)');
  assert.equal(formatScheduleTime('12:60'), '', 'Rejects 12:60 (minutes max is 59)');
  assert.equal(formatScheduleTime('16:30:60'), '', 'Rejects 16:30:60 (seconds max is 59)');
  assert.equal(formatScheduleTime('not-a-time'), '', 'Rejects arbitrary text');
  assert.equal(formatScheduleTime('16:3'), '', 'Rejects single digit minute');
  assert.equal(formatScheduleTime('2026-10-15T99:99:00'), '', 'Rejects invalid time in datetime shape');
  assert.equal(formatScheduleTime('2026-10-15 25:61'), '', 'Rejects invalid time in space-separated datetime');
  assert.equal(formatScheduleTime(''), '');
  assert.equal(formatScheduleTime(null), '');
  assert.equal(formatScheduleTime(undefined), '');
});

test('normalizeScheduleRow defensively handles Supabase LICH_TRINH rows and rejects malformed records', () => {
  // Case A: Supabase relational row format with PascalCase
  const dbRow = {
    LichTrinhID: 10,
    SuKienID: 1,
    GioBatDau: '16:30:00',
    GioKetThuc: '17:45:00',
    TenHoatDong: 'Mở cổng check-in an ninh',
    MoTaHoatDong: 'Quét mã QR, soát vé và phát vòng tay.',
    DiaDiemHoatDong: 'Cổng kiểm soát an ninh SVĐ Mỹ Đình',
    ThuTu: 1,
  };
  const normalizedDb = normalizeScheduleRow(dbRow);
  assert.ok(normalizedDb);
  assert.equal(normalizedDb.id, 10);
  assert.equal(normalizedDb.eventId, 1);
  assert.equal(normalizedDb.startTime, '16:30');
  assert.equal(normalizedDb.endTime, '17:45');
  assert.equal(normalizedDb.title, 'Mở cổng check-in an ninh');
  assert.equal(normalizedDb.description, 'Quét mã QR, soát vé và phát vòng tay.');
  assert.equal(normalizedDb.location, 'Cổng kiểm soát an ninh SVĐ Mỹ Đình');
  assert.equal(normalizedDb.order, 1);

  // Case B: Snake_case or camelCase mock format
  const camelRow = {
    id: 11,
    eventId: 2,
    startTime: '18:00',
    endTime: '19:00',
    title: 'Phát biểu khai mạc',
    description: 'Đại diện phát biểu.',
    location: 'Hội trường A',
    order: 2,
  };
  const normalizedCamel = normalizeScheduleRow(camelRow);
  assert.ok(normalizedCamel);
  assert.equal(normalizedCamel.id, 11);
  assert.equal(normalizedCamel.startTime, '18:00');
  assert.equal(normalizedCamel.title, 'Phát biểu khai mạc');

  // Case C: Null optional fields are kept undefined without fabricating missing values
  const minimalRow = {
    LichTrinhID: 12,
    SuKienID: 1,
    GioBatDau: '20:00:00',
    GioKetThuc: null,
    TenHoatDong: 'Tiết mục đặc biệt',
    MoTaHoatDong: null,
    DiaDiemHoatDong: null,
    ThuTu: 3,
  };
  const normalizedMinimal = normalizeScheduleRow(minimalRow);
  assert.ok(normalizedMinimal);
  assert.equal(normalizedMinimal.startTime, '20:00');
  assert.equal(normalizedMinimal.title, 'Tiết mục đặc biệt');
  assert.equal(normalizedMinimal.endTime, undefined, 'Missing end time is undefined');
  assert.equal(normalizedMinimal.description, undefined, 'Missing description is undefined');
  assert.equal(normalizedMinimal.location, undefined, 'Missing location is undefined');

  // Case D: Invalid time rows are safely rejected (returns null)
  assert.equal(normalizeScheduleRow({TenHoatDong: 'Tiết mục', GioBatDau: '99:99'}), null, 'Rejects row with 99:99');
  assert.equal(normalizeScheduleRow({TenHoatDong: 'Tiết mục', GioBatDau: '25:61'}), null, 'Rejects row with 25:61');
  assert.equal(normalizeScheduleRow({TenHoatDong: 'Tiết mục', GioBatDau: 'not-a-time'}), null, 'Rejects row with not-a-time');

  // Case E: Invalid optional endTime is safely normalized to undefined without passing garbage
  const badEndTimeRow = {
    LichTrinhID: 13,
    TenHoatDong: 'Chương trình',
    GioBatDau: '19:00',
    GioKetThuc: '25:61',
  };
  const normalizedBadEnd = normalizeScheduleRow(badEndTimeRow);
  assert.ok(normalizedBadEnd);
  assert.equal(normalizedBadEnd.startTime, '19:00');
  assert.equal(normalizedBadEnd.endTime, undefined, 'Invalid end time 25:61 is normalized to undefined');

  // Case F: Non-objects and missing required fields
  assert.equal(normalizeScheduleRow(null), null);
  assert.equal(normalizeScheduleRow(undefined), null);
  assert.equal(normalizeScheduleRow('string'), null);
  assert.equal(normalizeScheduleRow(123), null);
  assert.equal(normalizeScheduleRow({}), null, 'Empty object has no title or startTime');
  assert.equal(normalizeScheduleRow({TenHoatDong: 'Có tên nhưng không có giờ'}), null);
  assert.equal(normalizeScheduleRow({GioBatDau: '16:30:00'}), null, 'Có giờ nhưng không có tên hoạt động');
  assert.equal(normalizeScheduleRow({TenHoatDong: '   ', GioBatDau: '16:30'}), null, 'Whitespace title is rejected');
});

test('sortScheduleItems orders deterministically by ThuTu ascending with startTime/id tie-breakers', () => {
  const unsorted = [
    {id: 3, order: 2, startTime: '18:00', title: 'Activity C'},
    {id: 1, order: 1, startTime: '16:30', title: 'Activity A'},
    {id: 4, order: 2, startTime: '17:30', title: 'Activity D'}, // same order as C, but earlier startTime
    {id: 2, order: 2, startTime: '18:00', title: 'Activity B'}, // same order and startTime as C, lower id
  ];

  const sorted = sortScheduleItems(unsorted);
  assert.equal(sorted[0].id, 1, 'Order 1 comes first');
  assert.equal(sorted[1].id, 4, 'Order 2 with startTime 17:30 beats 18:00');
  assert.equal(sorted[2].id, 2, 'Order 2 with startTime 18:00 and ID 2 beats ID 3');
  assert.equal(sorted[3].id, 3, 'Order 2 with startTime 18:00 and ID 3 comes last');
});

test('isSuperConcertEvent accurately detects concert variants by stable product identity and rejects bare numeric ID', () => {
  // Stable product identity fields
  assert.equal(isSuperConcertEvent({templateKey: 'SUPER_CONCERT_2026'}), true);
  assert.equal(isSuperConcertEvent({code: 'SUPER_CONCERT_2026'}), true);
  assert.equal(isSuperConcertEvent({slug: 'super-concert-2026'}), true);

  // Regression: bare numeric ID is NOT enough to identify Super Concert specialization
  assert.equal(isSuperConcertEvent({id: 1}), false, 'Bare numeric ID 1 alone must return false');
  assert.equal(isSuperConcertEvent({id: 1, templateKey: 'GENERIC'}), false, 'Event with ID 1 and generic template must return false');
  assert.equal(isSuperConcertEvent({id: 2, templateKey: 'GENERIC'}), false);
  assert.equal(isSuperConcertEvent({slug: 'hoi-thao-cong-nghe-2026'}), false);
  assert.equal(isSuperConcertEvent(null), false);
  assert.equal(isSuperConcertEvent(undefined), false);
});

test('resolvePublicScheduleFallback enforces Super Concert fallback and generic event isolation', () => {
  const concertFallback = resolvePublicScheduleFallback({templateKey: 'SUPER_CONCERT_2026'});
  assert.equal(concertFallback.length, 6, 'Super Concert receives seeded schedule fallback');

  const genericFallback = resolvePublicScheduleFallback({id: 2, templateKey: 'GENERIC'});
  assert.equal(genericFallback.length, 0, 'Generic event receives empty fallback array');

  const bareIdFallback = resolvePublicScheduleFallback({id: 1});
  assert.equal(bareIdFallback.length, 0, 'Bare numeric ID does not receive concert fallback');
});

test('scheduleService.ts implements typed query, ThuTu ordering, and Supabase integration', async () => {
  const serviceTs = await readFile('src/services/scheduleService.ts', 'utf8');

  assert.match(serviceTs, /\.from\(['"]LICH_TRINH['"]\)/i, 'Queries LICH_TRINH table');
  assert.match(serviceTs, /\.eq\(['"]SuKienID['"],\s*eventId\)/i, 'Filters by target SuKienID');
  assert.match(serviceTs, /\.order\(['"]ThuTu['"],\s*\{\s*ascending:\s*true\s*\}\)/i, 'Orders query by ThuTu ascending');
  assert.match(serviceTs, /normalizeScheduleRow/i, 'Normalizes rows defensively');
  assert.match(serviceTs, /sortScheduleItems/i, 'Sorts normalized items with stable tie-breakers');
  assert.match(serviceTs, /resolvePublicScheduleFallback/i, 'Falls back safely on error or empty data');
});

test('ScheduleDialog implements modal keyboard containment, focus trapping, and accessibility contracts', async () => {
  const dialogTsx = await readFile('src/components/event-template/ScheduleDialog.tsx', 'utf8');

  // Semantic accessibility attributes
  assert.match(dialogTsx, /role="dialog"/i, 'Dialog specifies role="dialog"');
  assert.match(dialogTsx, /aria-modal="true"/i, 'Dialog specifies aria-modal="true"');
  assert.match(dialogTsx, /aria-labelledby="schedule-dialog-title"/i, 'Dialog links to title via aria-labelledby');
  assert.match(dialogTsx, /id="schedule-dialog-title"/i, 'Dialog header contains labelled title ID');
  assert.match(dialogTsx, /e\.key === 'Escape'/i, 'Dialog listens to Escape key to dismiss');
  assert.match(dialogTsx, /document\.body\.style\.overflow = 'hidden'/i, 'Locks body scroll while modal is open');
  assert.match(dialogTsx, /savedOpenerRef/i, 'Preserves opener element to restore focus upon dismissal');
  assert.match(dialogTsx, /id="btn-close-schedule-dialog"/i, 'Provides top-right accessible close button');
  assert.match(dialogTsx, /id="btn-close-schedule-dialog-2"/i, 'Provides bottom footer dismiss action');
  assert.match(dialogTsx, /handleOverlayClick/i, 'Supports backdrop click to dismiss');

  // Tab and Shift+Tab keyboard containment
  assert.match(dialogTsx, /e\.key === 'Tab'/i, 'Intercepts Tab key for containment');
  assert.match(dialogTsx, /e\.shiftKey/i, 'Distinguishes Shift+Tab backward navigation');
  assert.match(dialogTsx, /firstElement/i, 'Identifies first focusable element for wrap-around');
  assert.match(dialogTsx, /lastElement/i, 'Identifies last focusable element for wrap-around');
  assert.match(dialogTsx, /dialogRef\.current\.focus\(\)/i, 'Falls back to dialog container if no focusable children exist');

  // Uses domain specialization helper instead of bare id check
  assert.match(dialogTsx, /isSuperConcertEvent\(event\)/i, 'Uses isSuperConcertEvent for specialization detection');
  assert.doesNotMatch(dialogTsx, /event\?\.id === 1/i, 'Does not rely on brittle event.id === 1 check');
});

test('EventTemplate schedule loading is event-safe against stale async responses', async () => {
  const templateTsx = await readFile('src/components/event-template/EventTemplate.tsx', 'utf8');

  // Checks for cancellation token / obsolescence guard
  assert.match(templateTsx, /isObsolete\s*=\s*(true|false)/i, 'Tracks obsolescence flag across event changes');
  assert.match(templateTsx, /if\s*\(\s*isObsolete\s*\)\s*return/i, 'Guards async resolution against obsolete responses');
  assert.match(templateTsx, /setInternalSchedule\(\[\]\)/i, 'Resets visible schedule immediately on event transition');
  assert.match(templateTsx, /setScheduleState\(['"]loading['"]\)/i, 'Resets loading state immediately on event transition');
});

test('architectural removal of legacy schedule modal markup and dead bindings from production code', async () => {
  const footerModalsHtml = await readFile('src/legacy/fragments/footer-modals.html', 'utf8');
  const concertRuntimeJs = await readFile('src/legacy/concertRuntime.js', 'utf8');
  const headerTsx = await readFile('src/components/event-template/EventHeader.tsx', 'utf8');
  const heroTsx = await readFile('src/components/event-template/EventHero.tsx', 'utf8');
  const mobileStickyTsx = await readFile('src/components/event-template/MobileStickyBar.tsx', 'utf8');

  // 1. Raw HTML schedule modal is completely removed
  assert.doesNotMatch(footerModalsHtml, /id="schedule-modal"/i, 'Legacy schedule modal markup is removed from footer-modals.html');
  assert.doesNotMatch(footerModalsHtml, /id="btn-close-schedule-modal"/i, 'Legacy schedule close button 1 removed');
  assert.doesNotMatch(footerModalsHtml, /id="btn-close-schedule-modal-2"/i, 'Legacy schedule close button 2 removed');

  // 2. Legacy team modal, footer, and runtime overlays are completely removed from raw HTML
  assert.doesNotMatch(footerModalsHtml, /id="team-modal"/i, 'Legacy team modal markup is removed from footer-modals.html');
  assert.doesNotMatch(footerModalsHtml, /<footer/i, 'Legacy footer markup is removed from footer-modals.html');
  assert.doesNotMatch(footerModalsHtml, /id="booking-modal"/i, 'Legacy booking modal is removed from footer-modals.html');
  assert.doesNotMatch(footerModalsHtml, /id="seat-tooltip"/i, 'Legacy seat tooltip is removed from footer-modals.html');
  assert.doesNotMatch(footerModalsHtml, /id="toast-container"/i, 'Legacy toast container is removed from footer-modals.html');

  // 3. concertRuntime.js no longer binds schedule modal or team modal
  assert.doesNotMatch(concertRuntimeJs, /document\.getElementById\('schedule-modal'\)/i, 'concertRuntime.js does not query schedule-modal');
  assert.doesNotMatch(concertRuntimeJs, /'btn-view-schedule':\s*\['schedule-modal'/i, 'schedule-modal removed from runtime delegation map');
  assert.doesNotMatch(concertRuntimeJs, /document\.getElementById\('team-modal'\)/i, 'concertRuntime.js does not query team-modal');
  assert.doesNotMatch(concertRuntimeJs, /'btn-open-team-info'/i, 'team modal trigger removed from runtime delegation map');

  // 4. Shared React components use callback props rather than DOM class manipulation
  assert.doesNotMatch(headerTsx, /document\.getElementById\('schedule-modal'\)/i, 'EventHeader does not mutate DOM classList');
  assert.match(headerTsx, /onClick=\{onOpenSchedule\}/i, 'EventHeader wires onOpenSchedule callback');

  assert.doesNotMatch(heroTsx, /document\.getElementById\('schedule-modal'\)/i, 'EventHero does not mutate DOM classList');
  assert.match(heroTsx, /onClick=\{onOpenSchedule\}/i, 'EventHero wires onOpenSchedule callback');

  assert.doesNotMatch(mobileStickyTsx, /document\.getElementById\('schedule-modal'\)/i, 'MobileStickyBar does not mutate DOM classList');
  assert.match(mobileStickyTsx, /onClick=\{onOpenSchedule\}/i, 'MobileStickyBar wires onOpenSchedule callback');
});
