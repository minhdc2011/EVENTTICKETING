import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  HOLD_DISCLOSURE_TEXT,
  OVERLAY_EVENTS,
  SPRINT3_PREVIEW_TOAST_MESSAGE,
  VALID_TOAST_VARIANTS,
  dispatchBookingModal,
  dispatchSeatTooltip,
  dispatchToast,
  formatHoldDuration,
  formatVND,
  normalizeBookingModalPayload,
  normalizeSeatTooltipPayload,
  normalizeToastPayload,
  subscribeToBookingModal,
  subscribeToSeatTooltip,
  subscribeToToasts,
} from '../src/domain/runtimeOverlays.js';

test('runtime overlays constants define typed events, variants, and truthful disclosures', () => {
  assert.equal(OVERLAY_EVENTS.TOAST, 'eventticketing:toast');
  assert.equal(OVERLAY_EVENTS.SEAT_TOOLTIP, 'eventticketing:seat-tooltip');
  assert.equal(OVERLAY_EVENTS.BOOKING_MODAL, 'eventticketing:booking-modal');

  assert.deepEqual([...VALID_TOAST_VARIANTS], ['info', 'success', 'warning', 'error']);

  assert.match(SPRINT3_PREVIEW_TOAST_MESSAGE, /Sprint 2 \(Xác thực OTP\)/i);
  assert.match(SPRINT3_PREVIEW_TOAST_MESSAGE, /Sprint 3 \(Thanh toán đa kênh VNPAY\/MoMo\)/i);

  assert.match(HOLD_DISCLOSURE_TEXT, /giữ chỗ tạm thời/i);
  assert.match(HOLD_DISCLOSURE_TEXT, /chưa phải là giao dịch thanh toán hoàn tất/i);
});

test('formatVND formats numeric currency accurately with standard Vietnamese suffix', () => {
  assert.equal(formatVND(3500000), '3.500.000 VNĐ');
  assert.equal(formatVND(0), '0 VNĐ');
  assert.equal(formatVND(null), '0 VNĐ');
  assert.equal(formatVND(undefined), '0 VNĐ');
});

test('formatHoldDuration formats remaining seconds into accurate human-readable labels with safe fallbacks', () => {
  // 1. Exact 5 minutes (300 seconds default)
  const d300 = formatHoldDuration(300);
  assert.equal(d300.minutes, 5);
  assert.equal(d300.seconds, 0);
  assert.equal(d300.totalSeconds, 300);
  assert.equal(d300.label, '5 phút (300 giây)');

  // 2. Fractional minutes and seconds
  const d280 = formatHoldDuration(280);
  assert.equal(d280.minutes, 4);
  assert.equal(d280.seconds, 40);
  assert.equal(d280.totalSeconds, 280);
  assert.equal(d280.label, '4 phút 40 giây (280 giây)');

  // 3. Sub-minute countdown
  const d45 = formatHoldDuration(45);
  assert.equal(d45.minutes, 0);
  assert.equal(d45.seconds, 45);
  assert.equal(d45.totalSeconds, 45);
  assert.equal(d45.label, '45 giây');

  // 4. Sensible fallbacks for invalid, zero, or negative inputs
  assert.equal(formatHoldDuration(null).label, '5 phút (300 giây)');
  assert.equal(formatHoldDuration(undefined).label, '5 phút (300 giây)');
  assert.equal(formatHoldDuration(0).label, '5 phút (300 giây)');
  assert.equal(formatHoldDuration(-10).label, '5 phút (300 giây)');
});

test('normalizeToastPayload validates message, normalizes variants, and assigns defaults safely', () => {
  // 1. Valid info toast
  const t1 = normalizeToastPayload({message: 'Chào mừng bạn!'});
  assert.equal(t1.message, 'Chào mừng bạn!');
  assert.equal(t1.type, 'info');
  assert.equal(t1.durationMs, 3600);
  assert.ok(t1.id.startsWith('toast-'));

  // 2. Specific valid variants
  const t2 = normalizeToastPayload({message: 'Đã xảy ra lỗi', type: 'error', durationMs: 5000});
  assert.equal(t2.type, 'error');
  assert.equal(t2.durationMs, 5000);

  const t3 = normalizeToastPayload({message: 'Thành công', type: 'success'});
  assert.equal(t3.type, 'success');

  const t4 = normalizeToastPayload({message: 'Cảnh báo', type: 'warning'});
  assert.equal(t4.type, 'warning');

  // 3. Fallback for invalid variant
  const t5 = normalizeToastPayload({message: 'Thông báo lạ', type: 'unknown-type'});
  assert.equal(t5.type, 'info');

  // 4. Invalid or empty payload throws
  assert.throws(() => normalizeToastPayload(null), /must be an object/i);
  assert.throws(() => normalizeToastPayload({message: ''}), /non-empty string/i);
  assert.throws(() => normalizeToastPayload({message: '   '}), /non-empty string/i);
});

test('normalizeSeatTooltipPayload normalizes seat hover details and status text accurately', () => {
  // 1. Null / empty input fallback
  const empty = normalizeSeatTooltipPayload(null);
  assert.equal(empty.visible, false);
  assert.equal(empty.seatCode, '');
  assert.equal(empty.status, 'available');
  assert.equal(empty.statusText, 'Còn trống');

  // 2. Available seat
  const s1 = normalizeSeatTooltipPayload({
    visible: true,
    x: 100,
    y: 200,
    seatCode: 'VIP-A-01',
    zoneName: 'VIP Kim Cương',
    row: 'A',
    number: 1,
    price: 3500000,
  });
  assert.equal(s1.visible, true);
  assert.equal(s1.x, 100);
  assert.equal(s1.y, 200);
  assert.equal(s1.seatCode, 'VIP-A-01');
  assert.equal(s1.priceFormatted, '3.500.000 VNĐ');
  assert.equal(s1.status, 'available');
  assert.equal(s1.statusText, 'Còn trống');

  // 3. Sold seat
  const s2 = normalizeSeatTooltipPayload({visible: true, status: 'SOLD'});
  assert.equal(s2.status, 'sold');
  assert.equal(s2.statusText, 'Đã bán');

  // 4. Held seat
  const s3 = normalizeSeatTooltipPayload({visible: true, status: 'HELD'});
  assert.equal(s3.status, 'held');
  assert.equal(s3.statusText, 'Đang được giữ');

  // 5. Selected seat
  const s4 = normalizeSeatTooltipPayload({visible: true, status: 'selected'});
  assert.equal(s4.status, 'selected');
  assert.equal(s4.statusText, 'Đang chọn tạm tính');
});

test('regression: normalizeSeatTooltipPayload preserves current tooltip content on coordinate move events', () => {
  // Step 1: Initial hover with full seat inspection details
  const initialHover = normalizeSeatTooltipPayload({
    visible: true,
    x: 120,
    y: 250,
    seatCode: 'VIP-A-08',
    zoneName: 'VIP Platinum 1',
    row: 'A',
    number: 8,
    price: 3500000,
    status: 'available',
    statusText: 'Còn trống',
  });

  assert.equal(initialHover.seatCode, 'VIP-A-08');
  assert.equal(initialHover.zoneName, 'VIP Platinum 1');
  assert.equal(initialHover.x, 120);
  assert.equal(initialHover.y, 250);

  // Step 2: Pointer moves across the seat; runtime dispatches only visible/x/y
  const moveEventPayload = {
    visible: true,
    x: 135,
    y: 245,
  };

  const updatedOnMove = normalizeSeatTooltipPayload(moveEventPayload, initialHover);

  // Verified: coordinates are updated to latest mouse position
  assert.equal(updatedOnMove.visible, true);
  assert.equal(updatedOnMove.x, 135);
  assert.equal(updatedOnMove.y, 245);

  // Verified: seat code, zone name, row, number, price, and status are PRESERVED and not wiped
  assert.equal(updatedOnMove.seatCode, 'VIP-A-08', 'Seat code must not be wiped out on move');
  assert.equal(updatedOnMove.zoneName, 'VIP Platinum 1', 'Zone name must not be wiped out on move');
  assert.equal(updatedOnMove.row, 'A', 'Seat row must be preserved');
  assert.equal(updatedOnMove.number, 8, 'Seat number must be preserved');
  assert.equal(updatedOnMove.price, 3500000, 'Price numeric value must be preserved');
  assert.equal(updatedOnMove.priceFormatted, '3.500.000 VNĐ', 'Formatted price must be preserved');
  assert.equal(updatedOnMove.status, 'available', 'Seat status must be preserved');
  assert.equal(updatedOnMove.statusText, 'Còn trống', 'Seat status text must be preserved');

  // Step 3: Pointer leaves seat; hide event dispatches visible: false
  const leaveEventPayload = {visible: false};
  const updatedOnLeave = normalizeSeatTooltipPayload(leaveEventPayload, updatedOnMove);
  assert.equal(updatedOnLeave.visible, false);
});

test('normalizeBookingModalPayload defensive calculation and structured items', () => {
  // 1. Null input
  const empty = normalizeBookingModalPayload(null);
  assert.equal(empty.open, false);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.totalQuantity, 0);
  assert.equal(empty.totalAmount, 0);

  // 2. Active hold with multiple ticket items
  const payload = normalizeBookingModalPayload({
    open: true,
    holdId: 'hold-uuid-1234',
    expiresAt: '2026-10-27T18:00:00Z',
    remainingSeconds: 280,
    items: [
      {ticketCode: 'VIP-A-01', zoneCode: 'VVIP_DIAMOND', zoneName: 'VIP Kim Cương', price: 4500000},
      {ticketCode: 'VIP-A-02', zoneCode: 'VVIP_DIAMOND', zoneName: 'VIP Kim Cương', price: 4500000},
      {ticketCode: 'GA-STAND-1', zoneCode: 'GA_STAND_1', zoneName: 'Fanzone 1', price: 2200000, quantity: 2},
    ],
  });

  assert.equal(payload.open, true);
  assert.equal(payload.holdId, 'hold-uuid-1234');
  assert.equal(payload.remainingSeconds, 280);
  assert.equal(payload.items.length, 3);
  assert.equal(payload.items[0].priceFormatted, '4.500.000 VNĐ');
  assert.equal(payload.items[2].quantity, 2);
  // Auto-calculated totals: 2 VIP (9m) + 2 GA (4.4m) = 13.4m, 4 tickets
  assert.equal(payload.totalQuantity, 4);
  assert.equal(payload.totalAmount, 13400000);
  assert.equal(payload.totalAmountFormatted, '13.400.000 VNĐ');
});

test('event bus adapter supports isolated subscribe, dispatch, and unsubscribe', () => {
  const bus = new EventTarget();

  // 1. Toast subscribe and dispatch
  const receivedToasts = [];
  const unsubToast = subscribeToToasts(t => receivedToasts.push(t), bus);

  dispatchToast({message: 'Thông báo đầu tiên', type: 'info'}, bus);
  assert.equal(receivedToasts.length, 1);
  assert.equal(receivedToasts[0].message, 'Thông báo đầu tiên');

  // Unsubscribe cleans up
  unsubToast();
  dispatchToast({message: 'Thông báo thứ hai', type: 'info'}, bus);
  assert.equal(receivedToasts.length, 1, 'No toasts delivered after unsubscribe');

  // 2. Seat tooltip subscribe and dispatch
  const receivedTooltips = [];
  const unsubTooltip = subscribeToSeatTooltip(tip => receivedTooltips.push(tip), bus);

  dispatchSeatTooltip({visible: true, seatCode: 'B-04', price: 1200000}, bus);
  assert.equal(receivedTooltips.length, 1);
  assert.equal(receivedTooltips[0].seatCode, 'B-04');
  assert.equal(receivedTooltips[0].priceFormatted, '1.200.000 VNĐ');

  unsubTooltip();
  dispatchSeatTooltip({visible: false}, bus);
  assert.equal(receivedTooltips.length, 1, 'No tooltips delivered after unsubscribe');

  // 3. Booking modal subscribe and dispatch
  const receivedModals = [];
  const unsubModal = subscribeToBookingModal(m => receivedModals.push(m), bus);

  dispatchBookingModal({open: true, holdId: 'hold-789'}, bus);
  assert.equal(receivedModals.length, 1);
  assert.equal(receivedModals[0].holdId, 'hold-789');

  unsubModal();
  dispatchBookingModal({open: false}, bus);
  assert.equal(receivedModals.length, 1, 'No booking modals delivered after unsubscribe');
});

test('architectural verification: React owns overlays without innerHTML injection or legacy simulateNextSprint', async () => {
  const concertSectionsTsx = await readFile('src/components/ConcertSections.tsx', 'utf8');
  const concertRuntimeJs = await readFile('src/legacy/concertRuntime.js', 'utf8');
  const footerModalsHtml = await readFile('src/legacy/fragments/footer-modals.html', 'utf8');
  const bookingHoldModalTsx = await readFile(
    'src/components/event-template/BookingHoldModal.tsx',
    'utf8'
  );
  const seatTooltipTsx = await readFile('src/components/event-template/SeatTooltip.tsx', 'utf8');
  const toastContainerTsx = await readFile(
    'src/components/event-template/RuntimeToastContainer.tsx',
    'utf8'
  );

  // 1. ConcertSections does not import footer-modals.html or use dangerouslySetInnerHTML for overlays
  assert.doesNotMatch(concertSectionsTsx, /footer-modals\.html/i, 'No raw HTML fragment import in ConcertSections');
  assert.match(concertSectionsTsx, /export function ConcertRuntimeOverlays/i, 'Exports ConcertRuntimeOverlays');
  assert.match(concertSectionsTsx, /<SeatTooltip/i, 'Renders React SeatTooltip');
  assert.match(concertSectionsTsx, /<RuntimeToastContainer/i, 'Renders React RuntimeToastContainer');
  assert.match(concertSectionsTsx, /<BookingHoldModal/i, 'Renders React BookingHoldModal');

  // 2. Timer lifecycle and unmount safety in ConcertSections
  assert.match(concertSectionsTsx, /const activeTimers = new Set/i, 'Tracks active toast timer IDs');
  assert.match(concertSectionsTsx, /activeTimers\.forEach\(\(timerId\) => window\.clearTimeout\(timerId\)\)/i, 'Clears all active timers upon unmount');
  assert.match(concertSectionsTsx, /isMounted/i, 'Guards state updates against unmounted lifecycle');
  assert.match(concertSectionsTsx, /normalizeSeatTooltipPayload\(payload,\s*prev\)/i, 'Preserves tooltip content across pointer movement updates');

  // 3. concertRuntime.js does not use innerHTML for toasts or booking summary
  assert.doesNotMatch(concertRuntimeJs, /toast\.innerHTML\s*=/i, 'No toast innerHTML string templates');
  assert.doesNotMatch(concertRuntimeJs, /summaryEl\.innerHTML\s*=/i, 'No booking modal summary innerHTML injection');

  // 4. Complete elimination of simulateNextSprint global and inline handler
  assert.doesNotMatch(concertRuntimeJs, /simulateNextSprint/i, 'simulateNextSprint is eliminated from concertRuntime.js');
  assert.doesNotMatch(footerModalsHtml, /simulateNextSprint/i, 'simulateNextSprint is eliminated from footer-modals.html');
  assert.doesNotMatch(footerModalsHtml, /id="booking-modal"/i, 'footer-modals.html contains no raw booking modal');
  assert.doesNotMatch(footerModalsHtml, /id="seat-tooltip"/i, 'footer-modals.html contains no raw seat tooltip');
  assert.doesNotMatch(footerModalsHtml, /id="toast-container"/i, 'footer-modals.html contains no raw toast container');

  // 5. BookingHoldModal implements truthful duration rendering, accessible dialog attributes, and focus restoration
  assert.match(bookingHoldModalTsx, /remainingSeconds/i, 'BookingHoldModal accepts and destructures remainingSeconds');
  assert.match(bookingHoldModalTsx, /formatHoldDuration/i, 'BookingHoldModal computes normalized remaining hold duration');
  assert.match(bookingHoldModalTsx, /id="booking-modal-hold-duration"/i, 'Renders hold duration into accessible markup');
  assert.doesNotMatch(bookingHoldModalTsx, /trong <strong>5 phút \(300 giây\)<\/strong>/i, 'Does not hardcode static 5 minutes duration');
  assert.match(bookingHoldModalTsx, /role="dialog"/i, 'BookingHoldModal specifies role="dialog"');
  assert.match(bookingHoldModalTsx, /aria-modal="true"/i, 'BookingHoldModal specifies aria-modal="true"');
  assert.match(bookingHoldModalTsx, /aria-labelledby="booking-modal-title"/i, 'BookingHoldModal has labelledby');
  assert.match(bookingHoldModalTsx, /aria-describedby="booking-modal-description"/i, 'BookingHoldModal has describedby');
  assert.match(bookingHoldModalTsx, /e\.key === 'Escape'/i, 'BookingHoldModal handles Escape key');
  assert.match(bookingHoldModalTsx, /savedOpenerRef\.current !== document\.body/i, 'Guards against restoring focus to document.body');
  assert.match(bookingHoldModalTsx, /Xác nhận tạm giữ chỗ/i, 'BookingHoldModal includes truthful temporary hold disclaimer');
  assert.match(bookingHoldModalTsx, /chưa phải là giao dịch thanh toán hoàn tất/i, 'Truthful disclosure of temporary hold');

  // 6. SeatTooltip and RuntimeToastContainer semantics
  assert.match(seatTooltipTsx, /role="tooltip"/i, 'SeatTooltip specifies role="tooltip"');
  assert.match(seatTooltipTsx, /id="seat-tooltip"/i, 'SeatTooltip maintains id="seat-tooltip" styling hook');
  assert.match(toastContainerTsx, /id="toast-container"/i, 'RuntimeToastContainer maintains id="toast-container"');
  assert.match(toastContainerTsx, /aria-live="polite"/i, 'RuntimeToastContainer has aria-live="polite"');
});
