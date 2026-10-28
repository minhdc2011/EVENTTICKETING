import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  DATABASE_STATUS_MAP,
  STATUS_NAMES,
  STATUS_GLYPHS,
  MAX_SELECTION_CAP,
  mapSeatStatus,
  isSeatSelectable,
  evaluateSeatSelection,
  toggleSeatSelection,
  calculateSelectionTotal,
  formatMoneyVND,
  groupSeatsByZoneAndRow,
  filterSeatsByQuery,
  findZoneForSeatQuery,
  reconcileSeatUpdate,
  reconcileSelectionAfterUpdate,
  reconcileSelectionWithCatalog,
  buildHoldItems,
  calculateRemainingSeconds,
  formatCountdown,
  computeZoneLayouts,
} from '../src/domain/seatMap.js';

test('database status to UI status mapping and taxonomy', () => {
  assert.equal(DATABASE_STATUS_MAP.TRONG, 'available');
  assert.equal(DATABASE_STATUS_MAP.DA_BAN, 'sold');
  assert.equal(DATABASE_STATUS_MAP.DANG_GIU, 'held');
  assert.equal(DATABASE_STATUS_MAP.KHONG_MO_BAN, 'blocked');

  assert.equal(mapSeatStatus('TRONG', false), 'available');
  assert.equal(mapSeatStatus('DA_BAN', false), 'sold');
  assert.equal(mapSeatStatus('DANG_GIU', false), 'held');
  assert.equal(mapSeatStatus('KHONG_MO_BAN', false), 'blocked');
  assert.equal(mapSeatStatus('TRONG', true), 'selected');
  assert.equal(mapSeatStatus('DA_BAN', true), 'selected');

  // Unknown or corrupt database status defaults safely to 'blocked' (never 'available')
  assert.equal(mapSeatStatus('UNKNOWN_STATUS', false), 'blocked');
  assert.equal(mapSeatStatus('BAO_TRI', false), 'blocked');
  assert.equal(mapSeatStatus(null, false), 'blocked');
  assert.equal(mapSeatStatus(undefined, false), 'blocked');

  assert.equal(STATUS_NAMES.available, 'Còn trống');
  assert.equal(STATUS_NAMES.sold, 'Đã bán');
  assert.equal(STATUS_NAMES.held, 'Đang giữ');
  assert.equal(STATUS_NAMES.selected, 'Đã chọn');
  assert.equal(STATUS_NAMES.blocked, 'Không mở bán');

  assert.equal(STATUS_GLYPHS.sold, '×');
  assert.equal(STATUS_GLYPHS.held, '◷');
  assert.equal(STATUS_GLYPHS.selected, '✓');
  assert.equal(STATUS_GLYPHS.blocked, '−');
});

test('seat selectability invariants under various sale and booking states', () => {
  // Available seat when sale is open and no hold/pending
  assert.equal(
    isSeatSelectable({status: 'TRONG', saleOpen: true}),
    true,
    'Available seat is selectable when sale is open'
  );

  // Closed sale
  assert.equal(
    isSeatSelectable({status: 'TRONG', saleOpen: false}),
    false,
    'Seat is not selectable when sale is closed'
  );

  // Active hold in progress
  assert.equal(
    isSeatSelectable({status: 'TRONG', saleOpen: true, hasActiveHold: true}),
    false,
    'Seat is not selectable when hold is active'
  );

  // Request pending
  assert.equal(
    isSeatSelectable({status: 'TRONG', saleOpen: true, isPending: true}),
    false,
    'Seat is not selectable when hold request is pending'
  );

  // Unavailable database statuses
  assert.equal(isSeatSelectable({status: 'DA_BAN', saleOpen: true}), false);
  assert.equal(isSeatSelectable({status: 'DANG_GIU', saleOpen: true}), false);
  assert.equal(isSeatSelectable({status: 'KHONG_MO_BAN', saleOpen: true}), false);
});

test('evaluateSeatSelection provides descriptive reasons and enforce business rules', () => {
  const seatA1 = {GheID: 1, MaGheDayDu: 'A-A01', TrangThai: 'TRONG', GiaVeNiemYet: 500000};
  const seatA2 = {GheID: 2, MaGheDayDu: 'A-A02', TrangThai: 'DA_BAN', GiaVeNiemYet: 500000};
  const seatA3 = {GheID: 3, MaGheDayDu: 'A-A03', TrangThai: 'DANG_GIU', GiaVeNiemYet: 500000};

  // 1. Closed sale
  const closedRes = evaluateSeatSelection({
    seat: seatA1,
    selectedSeats: [],
    saleOpen: false,
  });
  assert.equal(closedRes.allowed, false);
  assert.equal(closedRes.reason, 'CLOSED');
  assert.match(closedRes.message || '', /đã đóng bán/i);

  // 2. Hold active
  const holdRes = evaluateSeatSelection({
    seat: seatA1,
    selectedSeats: [],
    saleOpen: true,
    hasActiveHold: true,
  });
  assert.equal(holdRes.allowed, false);
  assert.equal(holdRes.reason, 'HOLD_ACTIVE');

  // 3. Already selected seat permits removal
  const removeRes = evaluateSeatSelection({
    seat: seatA1,
    selectedSeats: [seatA1],
    saleOpen: true,
  });
  assert.equal(removeRes.allowed, true);
  assert.equal(removeRes.action, 'REMOVE');

  // 4. Sold seat rejected with status label
  const soldRes = evaluateSeatSelection({
    seat: seatA2,
    selectedSeats: [],
    saleOpen: true,
  });
  assert.equal(soldRes.allowed, false);
  assert.equal(soldRes.reason, 'UNAVAILABLE');
  assert.match(soldRes.message || '', /Đã bán/);

  // 5. 4-seat maximum cap
  const selected4 = [
    {GheID: 10, MaGheDayDu: 'A-B01'},
    {GheID: 11, MaGheDayDu: 'A-B02'},
    {GheID: 12, MaGheDayDu: 'A-B03'},
    {GheID: 13, MaGheDayDu: 'A-B04'},
  ];
  const capRes = evaluateSeatSelection({
    seat: seatA1,
    selectedSeats: selected4,
    saleOpen: true,
    maxCap: 4,
  });
  assert.equal(capRes.allowed, false);
  assert.equal(capRes.reason, 'MAX_CAP_REACHED');
  assert.match(capRes.message || '', /tối đa 4 vé/i);

  // 6. Valid selection
  const validRes = evaluateSeatSelection({
    seat: seatA1,
    selectedSeats: [],
    saleOpen: true,
  });
  assert.equal(validRes.allowed, true);
  assert.equal(validRes.action, 'ADD');
});

test('toggleSeatSelection manages selection immutably up to cap', () => {
  const s1 = {GheID: 1, MaGheDayDu: 'VVIP-A-01', GiaVeNiemYet: 1000000};
  const s2 = {GheID: 2, MaGheDayDu: 'VVIP-A-02', GiaVeNiemYet: 1000000};
  const s3 = {GheID: 3, MaGheDayDu: 'VVIP-A-03', GiaVeNiemYet: 1000000};
  const s4 = {GheID: 4, MaGheDayDu: 'VVIP-A-04', GiaVeNiemYet: 1000000};
  const s5 = {GheID: 5, MaGheDayDu: 'VVIP-A-05', GiaVeNiemYet: 1000000};

  let selection = [];
  selection = toggleSeatSelection(selection, s1);
  assert.equal(selection.length, 1);
  assert.equal(selection[0].MaGheDayDu, 'VVIP-A-01');

  // Add up to 4
  selection = toggleSeatSelection(selection, s2);
  selection = toggleSeatSelection(selection, s3);
  selection = toggleSeatSelection(selection, s4);
  assert.equal(selection.length, 4);

  // 5th seat ignored
  selection = toggleSeatSelection(selection, s5);
  assert.equal(selection.length, 4);

  // Toggle existing seat removes it
  selection = toggleSeatSelection(selection, s2);
  assert.equal(selection.length, 3);
  assert.equal(selection.some((s) => s.MaGheDayDu === 'VVIP-A-02'), false);
});

test('calculateSelectionTotal and formatMoneyVND', () => {
  const seats = [
    {GheID: 1, GiaVeNiemYet: 1500000},
    {GheID: 2, GiaVeNiemYet: 2500000},
  ];
  assert.equal(calculateSelectionTotal(seats), 4000000);
  assert.equal(calculateSelectionTotal([]), 0);
  assert.match(formatMoneyVND(4000000), /4\.000\.000\s*₫/);
});

test('reconcileSeatUpdate updates catalog seat immutably', () => {
  const catalog = {
    zones: [{KhuVucID: 1, TenKhuVuc: 'VIP'}],
    seats: [
      {GheID: 1, MaGheDayDu: 'VIP-A-01', TrangThai: 'TRONG'},
      {GheID: 2, MaGheDayDu: 'VIP-A-02', TrangThai: 'TRONG'},
    ],
  };

  const nextCatalog = reconcileSeatUpdate(catalog, {
    seatCode: 'VIP-A-01',
    status: 'DA_BAN',
  });

  assert.equal(nextCatalog.seats[0].TrangThai, 'DA_BAN');
  assert.equal(nextCatalog.seats[1].TrangThai, 'TRONG');
  assert.equal(catalog.seats[0].TrangThai, 'TRONG', 'Original catalog remains untouched');
});

test('reconcileSelectionAfterUpdate drops lost seat and announces exact seat code', () => {
  const selected = [
    {GheID: 1, MaGheDayDu: 'VIP-A-01', TrangThai: 'TRONG'},
    {GheID: 2, MaGheDayDu: 'VIP-A-02', TrangThai: 'TRONG'},
  ];

  // Update affects VIP-A-01 which was sold
  const result = reconcileSelectionAfterUpdate(selected, {
    seatCode: 'VIP-A-01',
    status: 'DA_BAN',
  });

  assert.equal(result.updatedSelection.length, 1);
  assert.equal(result.updatedSelection[0].MaGheDayDu, 'VIP-A-02');
  assert.equal(result.lostSeat?.MaGheDayDu, 'VIP-A-01');
  assert.match(result.message || '', /VIP-A-01/);
  assert.match(result.message || '', /đã được bỏ khỏi lựa chọn/i);

  // Update on unselected seat leaves selection unchanged
  const unselectedUpdate = reconcileSelectionAfterUpdate(result.updatedSelection, {
    seatCode: 'VIP-B-09',
    status: 'DA_BAN',
  });
  assert.equal(unselectedUpdate.updatedSelection.length, 1);
  assert.equal(unselectedUpdate.lostSeat, null);
  assert.equal(unselectedUpdate.message, null);
});

test('reconcileSelectionAfterUpdate preserves own-hold DANG_GIU updates but drops others and sold seats', () => {
  const selected = [
    {GheID: 1, MaGheDayDu: 'VIP-A-01', TrangThai: 'TRONG'},
    {GheID: 2, MaGheDayDu: 'VIP-A-02', TrangThai: 'TRONG'},
  ];
  const ownHeld = new Set(['VIP-A-01', 'VIP-A-02']);

  // 1. DANG_GIU update on own held seat is preserved without dropping or alerting
  const ownRes = reconcileSelectionAfterUpdate(
    selected,
    {seatCode: 'VIP-A-01', status: 'DANG_GIU'},
    ownHeld
  );
  assert.equal(ownRes.updatedSelection.length, 2, 'Own held seat is not dropped');
  assert.equal(ownRes.lostSeat, null);
  assert.equal(ownRes.message, null);

  // 2. DANG_GIU update on a seat held by ANOTHER actor (not in ownHeld) is dropped
  const otherHeldRes = reconcileSelectionAfterUpdate(
    selected,
    {seatCode: 'VIP-A-01', status: 'DANG_GIU'},
    new Set(['VIP-A-99'])
  );
  assert.equal(otherHeldRes.updatedSelection.length, 1, 'Seat held by another is dropped');
  assert.equal(otherHeldRes.lostSeat?.MaGheDayDu, 'VIP-A-01');
  assert.match(otherHeldRes.message || '', /VIP-A-01/);

  // 3. DA_BAN update drops the seat even if it was previously in ownHeld
  const soldRes = reconcileSelectionAfterUpdate(
    selected,
    {seatCode: 'VIP-A-01', status: 'DA_BAN'},
    ownHeld
  );
  assert.equal(soldRes.updatedSelection.length, 1, 'Sold seat is dropped even if in ownHeld');
  assert.equal(soldRes.lostSeat?.MaGheDayDu, 'VIP-A-01');
  assert.match(soldRes.message || '', /VIP-A-01/);
});

test('reconcileSelectionWithCatalog reconciles stale selections against refreshed catalog after 409 conflict', () => {
  const currentSelection = [
    {GheID: 1, MaGheDayDu: 'VIP-A-01'},
    {GheID: 2, MaGheDayDu: 'VIP-A-02'},
    {GheID: 3, MaGheDayDu: 'VIP-A-03'},
  ];

  const refreshedCatalog = {
    seats: [
      {GheID: 1, MaGheDayDu: 'VIP-A-01', TrangThai: 'TRONG'},
      {GheID: 2, MaGheDayDu: 'VIP-A-02', TrangThai: 'DANG_GIU'}, // became held by someone else
      // VIP-A-03 is missing or removed
    ],
  };

  const result = reconcileSelectionWithCatalog(currentSelection, refreshedCatalog);
  assert.equal(result.validSelection.length, 1);
  assert.equal(result.validSelection[0].MaGheDayDu, 'VIP-A-01');
  assert.equal(result.removedSeats.length, 2);
  assert.equal(result.removedSeats[0].MaGheDayDu, 'VIP-A-02');
  assert.equal(result.removedSeats[1].MaGheDayDu, 'VIP-A-03');
  assert.match(result.message || '', /VIP-A-02, VIP-A-03/);
  assert.match(result.message || '', /không còn khả dụng và đã được bỏ/i);

  // When all seats remain available
  const cleanResult = reconcileSelectionWithCatalog(
    [{GheID: 1, MaGheDayDu: 'VIP-A-01'}],
    refreshedCatalog
  );
  assert.equal(cleanResult.validSelection.length, 1);
  assert.equal(cleanResult.removedSeats.length, 0);
  assert.equal(cleanResult.message, null);

  // When price changes while seat remains TRONG, fresh catalog object is returned
  const stalePriceSelection = [
    {GheID: 1, MaGheDayDu: 'VIP-A-01', GiaVeNiemYet: 500000, TrangThai: 'TRONG'},
  ];
  const priceUpdatedCatalog = {
    seats: [
      {GheID: 1, MaGheDayDu: 'VIP-A-01', GiaVeNiemYet: 650000, TrangThai: 'TRONG', TenKhuVuc: 'VIP Zone'},
    ],
  };
  const priceUpdatedResult = reconcileSelectionWithCatalog(stalePriceSelection, priceUpdatedCatalog);
  assert.equal(priceUpdatedResult.validSelection.length, 1);
  assert.equal(
    priceUpdatedResult.validSelection[0].GiaVeNiemYet,
    650000,
    'Returns fresh catalog seat with updated price'
  );
  assert.equal(priceUpdatedResult.validSelection[0].TenKhuVuc, 'VIP Zone');
  assert.equal(priceUpdatedResult.removedSeats.length, 0);
});

test('calculateRemainingSeconds and formatCountdown', () => {
  const now = 1700000000000;
  const in300s = new Date(now + 300000).toISOString();
  const in65s = new Date(now + 65000).toISOString();
  const expired = new Date(now - 5000).toISOString();

  assert.equal(calculateRemainingSeconds(in300s, now), 300);
  assert.equal(calculateRemainingSeconds(in65s, now), 65);
  assert.equal(calculateRemainingSeconds(expired, now), 0);

  assert.equal(formatCountdown(300), '05:00');
  assert.equal(formatCountdown(65), '01:05');
  assert.equal(formatCountdown(5), '00:05');
  assert.equal(formatCountdown(0), '00:00');
});

test('groupSeatsByZoneAndRow and search queries', () => {
  const zones = [
    {KhuVucID: 1, TenKhuVuc: 'Khu A', GiaVeNiemYet: 500000},
    {KhuVucID: 2, TenKhuVuc: 'Khu B', GiaVeNiemYet: 300000},
  ];
  const seats = [
    {GheID: 1, KhuVucID: 1, SoHang: 'A', SoGhe: '02', MaGheDayDu: 'A-A02', TrangThai: 'TRONG'},
    {GheID: 2, KhuVucID: 1, SoHang: 'A', SoGhe: '01', MaGheDayDu: 'A-A01', TrangThai: 'TRONG'},
    {GheID: 3, KhuVucID: 1, SoHang: 'B', SoGhe: '01', MaGheDayDu: 'A-B01', TrangThai: 'DA_BAN'},
    {GheID: 4, KhuVucID: 2, SoHang: 'A', SoGhe: '01', MaGheDayDu: 'B-A01', TrangThai: 'TRONG'},
  ];

  const grouped = groupSeatsByZoneAndRow(seats, zones);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].zone.TenKhuVuc, 'Khu A');
  assert.equal(grouped[0].availableCount, 2);
  assert.equal(grouped[0].rows.length, 2);
  assert.equal(grouped[0].rows[0].rowLabel, 'A');
  // Ordered by SoGhe
  assert.equal(grouped[0].rows[0].seats[0].SoGhe, '01');
  assert.equal(grouped[0].rows[0].seats[1].SoGhe, '02');

  // Search filter
  const searchResults = filterSeatsByQuery(seats, 'A-B01');
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].MaGheDayDu, 'A-B01');

  // Find zone for seat
  assert.equal(findZoneForSeatQuery(seats, 'B-A01'), 2);
  assert.equal(findZoneForSeatQuery(seats, 'NON-EXISTENT'), null);
});

test('computeZoneLayouts derives non-overlapping geometry for 1, 3, and 8 zones', () => {
  const threeZones = [
    {KhuVucID: 1, TenKhuVuc: 'Khu A', GiaVeNiemYet: 1200000},
    {KhuVucID: 2, TenKhuVuc: 'Khu B', GiaVeNiemYet: 900000},
    {KhuVucID: 3, TenKhuVuc: 'Khu C', GiaVeNiemYet: 600000},
  ];

  const layouts3 = computeZoneLayouts(threeZones);
  assert.equal(layouts3.length, 3);
  for (const item of layouts3) {
    assert.match(item.svgPath, /^M\s+[\d.-]+\s+[\d.-]+\s+A/);
    assert.equal(Number.isFinite(item.center[0]), true);
    assert.equal(Number.isFinite(item.center[1]), true);
  }

  // 8 zones
  const eightZones = Array.from({length: 8}, (_, i) => ({
    KhuVucID: i + 1,
    TenKhuVuc: `Khu ${i + 1}`,
    GiaVeNiemYet: (i + 1) * 200000,
  }));
  const layouts8 = computeZoneLayouts(eightZones);
  assert.equal(layouts8.length, 8);
  for (const item of layouts8) {
    assert.match(item.svgPath, /^M/);
    assert.equal(Number.isFinite(item.center[0]), true);
    assert.equal(Number.isFinite(item.center[1]), true);
  }
});

test('architectural verification: Super Concert preserves its bespoke map while generic events use React', async () => {
  const concertSectionsTsx = await readFile(
    new URL('../src/components/ConcertSections.tsx', import.meta.url),
    'utf8'
  );
  const concertRuntimeJs = await readFile(
    new URL('../src/legacy/concertRuntime.js', import.meta.url),
    'utf8'
  );
  const genericPageTsx = await readFile(
    new URL('../src/components/GenericEventPage.tsx', import.meta.url),
    'utf8'
  );
  const templateTsx = await readFile(
    new URL('../src/components/event-template/EventTemplate.tsx', import.meta.url),
    'utf8'
  );
  const seatMapSectionTsx = await readFile(
    new URL('../src/components/event-template/SeatMapSection.tsx', import.meta.url),
    'utf8'
  );
  const seatMapCss = await readFile(
    new URL('../src/components/event-template/SeatMapSection.css', import.meta.url),
    'utf8'
  );

  // 1. Super Concert retains the validated bespoke stadium fragment and interactions.
  assert.match(concertSectionsTsx, /import\s+seatingHtml\s+from\s+['"]\.\.\/legacy\/fragments\/seating\.html\?raw['"]/i, 'Loads the bespoke Super Concert seating artifact');
  assert.match(concertSectionsTsx, /templateKey\s*===\s*['"]SUPER_CONCERT_2026['"][\s\S]*?<StaticMarkup\s+html=\{seatingHtml\}/i, 'Routes only Super Concert to the bespoke seating artifact');

  // 2. Organizer-created events still use the reusable React seat map.
  assert.match(concertSectionsTsx, /return\s+<SeatMapSection\s+\{\.\.\.props\}/i, 'Non-Super-Concert events delegate to SeatMapSection');

  // 3. GenericEventPage passes event into SeatingSection
  assert.match(genericPageTsx, /seating:\s*<SeatingSection\s+event=\{event\}/i, 'GenericEventPage passes event into SeatingSection');

  // 4. EventTemplate provides data-driven fallback to SeatMapSection
  assert.match(templateTsx, /<SeatMapSection\s+event=\{event\}/i, 'EventTemplate falls back to SeatMapSection for organizer events');

  // 5. concertRuntime.js initializes only when the bespoke SVG is present, so it
  // cannot mutate organizer-created React maps.
  assert.match(concertRuntimeJs, /if\s*\(!document\.getElementById\('stadium-svg'\)\)\s*\{\s*return;\s*\}/i, 'concertRuntime.js guards legacy seating mutations');

  // 6. SeatMapSection implements loading, error, empty, and ready states
  assert.match(seatMapSectionTsx, /catalogState === 'loading'/i, 'Implements loading state');
  assert.match(seatMapSectionTsx, /catalogState === 'error'/i, 'Implements error state');
  assert.match(seatMapSectionTsx, /catalogState === 'empty'/i, 'Implements empty state');
  assert.match(seatMapSectionTsx, /createSeatHold/i, 'Calls createSeatHold service');
  assert.match(seatMapSectionTsx, /releaseSeatHold/i, 'Calls releaseSeatHold service');
  assert.match(seatMapSectionTsx, /subscribeToSeatUpdates/i, 'Subscribes to realtime seat updates');

  // 7. CSS includes accessibility contracts (44px min-touch, reduced motion)
  assert.match(seatMapCss, /min-height:\s*44px/i, 'Enforces 44px minimum touch target height');
  assert.match(seatMapCss, /min-width:\s*44px/i, 'Enforces 44px minimum touch target width');
  assert.match(seatMapCss, /prefers-reduced-motion:\s*reduce/i, 'Supports prefers-reduced-motion');
});

test('round 2 architectural and truthfulness verification', async () => {
  const selectionSummaryTsx = await readFile(
    new URL('../src/components/event-template/SelectionSummary.tsx', import.meta.url),
    'utf8'
  );
  const seatMapSectionTsx = await readFile(
    new URL('../src/components/event-template/SeatMapSection.tsx', import.meta.url),
    'utf8'
  );
  const ticketDataServiceTs = await readFile(
    new URL('../src/services/ticketDataService.ts', import.meta.url),
    'utf8'
  );

  // 1. SelectionSummary attaches holdButtonRef to CTA button #hold
  assert.match(selectionSummaryTsx, /holdButtonRef\?:/i, 'Accepts holdButtonRef prop');
  assert.match(selectionSummaryTsx, /ref=\{holdButtonRef\}\s+type="button"\s+id="hold"/i, 'Attaches holdButtonRef directly to #hold button');

  // 2. Truthful pricing copy: no unbacked VAT claim
  assert.doesNotMatch(selectionSummaryTsx, /Giá vé niêm yết đã bao gồm thuế VAT/i, 'Removes unbacked VAT tax claim');
  assert.match(selectionSummaryTsx, /Tổng tạm tính từ giá vé hiện tại;\s*hệ thống xác nhận lại khi giữ ghế\./i, 'Uses truthful provisional total copy');

  // 3. Truthful venue data: no invented venue strings
  assert.doesNotMatch(seatMapSectionTsx, /Sân vận động Quốc gia/i, 'Does not invent Sân vận động Quốc gia');
  assert.doesNotMatch(seatMapSectionTsx, /Khu vực khán đài chính/i, 'Does not invent Khu vực khán đài chính');
  assert.match(seatMapSectionTsx, /event\?\.venueName\s*\|\|\s*'Địa điểm đang cập nhật'/i, 'Uses truthful venueName or neutral updating fallback');

  // 4. Own-hold race safety: heldSeatsSnapshot preserved for dialog and activeHoldRef tracks seatCodes
  assert.match(seatMapSectionTsx, /heldSeatsSnapshot/i, 'Preserves stable held-seat snapshot');
  assert.match(seatMapSectionTsx, /activeHoldRef\.current/i, 'Uses ref to avoid stale closures in realtime listener');
  assert.match(seatMapSectionTsx, /const\s+ownSeatCodes\s*=\s*new Set/i, 'Combines active and pending own-held seat codes');
  assert.match(seatMapSectionTsx, /reconcileSelectionAfterUpdate\(\s*prev,\s*updateEvent,\s*ownSeatCodes\s*\)/i, 'Passes own held seat codes to realtime reconciliation');

  // 5. Release truthfulness: does not clear activeHold in finally or catch
  assert.match(seatMapSectionTsx, /await\s+releaseSeatHold/i, 'Awaits releaseSeatHold');
  assert.doesNotMatch(seatMapSectionTsx, /finally\s*\{[^}]*setActiveHold\(null\)/i, 'Does not blindly clear hold in finally');

  // 6. 409 conflict handling uses reconcileSelectionWithCatalog
  assert.match(seatMapSectionTsx, /reconcileSelectionWithCatalog/i, 'Reconciles selection against fresh catalog on 409 conflict');

  // 7. Event/show scope boundary safety
  assert.match(seatMapSectionTsx, /currentScopeKey\s*=/i, 'Derives currentScopeKey from event and show IDs');
  assert.match(seatMapSectionTsx, /activeScopeRef\.current\s*!==\s*requestScope/i, 'Drops out-of-order catalog responses from previous scopes');

  // 8. ticketDataService returns empty catalog for zero zones without throwing error
  assert.match(ticketDataServiceTs, /if\s*\(zones\.length\s*===\s*0\)\s*\{\s*return\s*\{\s*zones:\s*\[\],\s*seats:\s*\[\]\s*\};\s*\}/i, 'Returns empty catalog on zero zones without throwing');
});

test('round 3 hold request uses backend zone codes and protects async races', async () => {
  const zones = [
    {KhuVucID: 1, MaKhuVuc: 'VIP-A'},
    {KhuVucID: 2, MaKhuVuc: 'GA-B'},
  ];
  const seats = [
    {KhuVucID: 1, MaGheDayDu: 'A-01'},
    {KhuVucID: 2, MaGheDayDu: 'B-02'},
  ];

  assert.deepEqual(buildHoldItems(seats, zones), {
    success: true,
    items: [
      {ticketCode: 'A-01', zoneCode: 'VIP-A'},
      {ticketCode: 'B-02', zoneCode: 'GA-B'},
    ],
  });

  const unresolved = buildHoldItems([{KhuVucID: 99, MaGheDayDu: 'X-01'}], zones);
  assert.equal(unresolved.success, false);
  assert.match(unresolved.error, /MaKhuVuc/);

  const seatMapSectionTsx = await readFile(
    new URL('../src/components/event-template/SeatMapSection.tsx', import.meta.url),
    'utf8'
  );
  const holdDialogTsx = await readFile(
    new URL('../src/components/event-template/HoldConfirmationDialog.tsx', import.meta.url),
    'utf8'
  );

  assert.match(seatMapSectionTsx, /pendingHoldSeatCodesRef\.current\s*=\s*new Set\(pendingSeatCodes\)/);
  assert.match(seatMapSectionTsx, /pendingHoldSeatCodesRef\.current\s*\|\|\s*\[\]/);
  assert.match(seatMapSectionTsx, /items:\s*holdItemsResult\.items/);
  assert.doesNotMatch(seatMapSectionTsx, /zoneCode:\s*s\.TenKhuVuc/);
  assert.match(seatMapSectionTsx, /setHeldSeatsSnapshot\(\[\]\)/);
  assert.match(seatMapSectionTsx, /if\s*\(!activeHold\s*\|\|\s*isReleasePending\)\s*return/);
  assert.match(seatMapSectionTsx, /isReleasing=\{isReleasePending\}/);
  assert.match(holdDialogTsx, /disabled=\{isReleasing\}/);
});


