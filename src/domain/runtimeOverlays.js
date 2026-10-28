// @ts-check

/**
 * Event names for communication between concert runtime and React overlay components.
 */
export const OVERLAY_EVENTS = Object.freeze({
  TOAST: 'eventticketing:toast',
  SEAT_TOOLTIP: 'eventticketing:seat-tooltip',
  BOOKING_MODAL: 'eventticketing:booking-modal',
});

/**
 * Standard truthful messaging for the Sprint 3 checkout/payment preview.
 */
export const SPRINT3_PREVIEW_TOAST_MESSAGE =
  'Chuyển tiếp thành công: Dữ liệu ghế đã chọn sẽ chuyển tới Sprint 2 (Xác thực OTP) & Sprint 3 (Thanh toán đa kênh VNPAY/MoMo)!';

/**
 * Truthful disclosure clarifying that seat hold is temporary and distinct from completed payment.
 */
export const HOLD_DISCLOSURE_TEXT =
  'Đây là bước giữ chỗ tạm thời trong thời gian giới hạn, chưa phải là giao dịch thanh toán hoàn tất.';

export const VALID_TOAST_VARIANTS = Object.freeze(['info', 'success', 'warning', 'error']);

/**
 * Formats a monetary amount into VND currency string.
 * @param {number | null | undefined} amount
 * @returns {string}
 */
export function formatVND(amount) {
  const numeric = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return `${new Intl.NumberFormat('vi-VN').format(numeric)} VNĐ`;
}

/**
 * Formats remaining seconds into a readable Vietnamese duration string.
 * @param {number | null | undefined} seconds
 * @returns {{ minutes: number, seconds: number, totalSeconds: number, label: string }}
 */
export function formatHoldDuration(seconds) {
  const total =
    typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? Math.round(seconds)
      : 300;
  const minutes = Math.floor(total / 60);
  const remainingSecs = total % 60;

  let label = '';
  if (minutes > 0 && remainingSecs > 0) {
    label = `${minutes} phút ${remainingSecs} giây (${total} giây)`;
  } else if (minutes > 0) {
    label = `${minutes} phút (${total} giây)`;
  } else {
    label = `${total} giây`;
  }

  return {
    minutes,
    seconds: remainingSecs,
    totalSeconds: total,
    label,
  };
}

let toastCounter = 0;

/**
 * Normalizes toast notification payload.
 * @param {any} input
 * @returns {{ id: string, message: string, type: 'info' | 'success' | 'warning' | 'error', durationMs: number }}
 */
export function normalizeToastPayload(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Toast payload must be an object.');
  }

  const rawMessage = typeof input.message === 'string' ? input.message.trim() : '';
  if (!rawMessage) {
    throw new Error('Toast message must be a non-empty string.');
  }

  const type = VALID_TOAST_VARIANTS.includes(input.type) ? input.type : 'info';
  const durationMs =
    typeof input.durationMs === 'number' && input.durationMs > 0 ? input.durationMs : 3600;

  toastCounter += 1;
  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : `toast-${Date.now()}-${toastCounter}`;

  return {
    id,
    message: rawMessage,
    type,
    durationMs,
  };
}

/**
 * Normalizes seat tooltip payload, preserving existing details when updating coordinates only.
 * @param {any} input
 * @param {any} [current]
 * @returns {{
 *   visible: boolean,
 *   x: number,
 *   y: number,
 *   seatCode: string,
 *   zoneName: string,
 *   row: string,
 *   number: string | number,
 *   price: number,
 *   priceFormatted: string,
 *   status: 'available' | 'sold' | 'held' | 'selected' | string,
 *   statusText: string
 * }}
 */
export function normalizeSeatTooltipPayload(input, current = null) {
  if (!input || typeof input !== 'object') {
    return {
      visible: false,
      x: current?.x ?? 0,
      y: current?.y ?? 0,
      seatCode: current?.seatCode ?? '',
      zoneName: current?.zoneName ?? '',
      row: current?.row ?? '',
      number: current?.number ?? '',
      price: current?.price ?? 0,
      priceFormatted: current?.priceFormatted ?? '0 VNĐ',
      status: current?.status ?? 'available',
      statusText: current?.statusText ?? 'Còn trống',
    };
  }

  const visible = Boolean(input.visible);
  const x = typeof input.x === 'number' && Number.isFinite(input.x) ? input.x : (current?.x ?? 0);
  const y = typeof input.y === 'number' && Number.isFinite(input.y) ? input.y : (current?.y ?? 0);

  // If input specifies only coordinates (move event), preserve current seat details
  const isMoveOnly = input.seatCode === undefined && current && Boolean(current.seatCode);

  const seatCode =
    typeof input.seatCode === 'string'
      ? input.seatCode.trim()
      : isMoveOnly
        ? current.seatCode
        : '';

  const zoneName =
    typeof input.zoneName === 'string'
      ? input.zoneName.trim()
      : isMoveOnly
        ? current.zoneName
        : '';

  const row =
    input.row !== undefined && input.row !== null
      ? String(input.row).trim()
      : isMoveOnly
        ? current.row
        : '';

  const number =
    input.number !== undefined && input.number !== null
      ? input.number
      : isMoveOnly
        ? current.number
        : '';

  const price =
    typeof input.price === 'number' && Number.isFinite(input.price)
      ? input.price
      : isMoveOnly
        ? current.price
        : 0;

  const priceFormatted =
    typeof input.priceFormatted === 'string' && input.priceFormatted.trim()
      ? input.priceFormatted.trim()
      : isMoveOnly && current.priceFormatted
        ? current.priceFormatted
        : formatVND(price);

  const status =
    typeof input.status === 'string'
      ? input.status.trim().toLowerCase()
      : isMoveOnly
        ? current.status
        : 'available';

  let statusText = typeof input.statusText === 'string' ? input.statusText.trim() : '';
  if (!statusText) {
    if (isMoveOnly && current.statusText) {
      statusText = current.statusText;
    } else if (status === 'selected') {
      statusText = 'Đang chọn tạm tính';
    } else if (status === 'sold') {
      statusText = 'Đã bán';
    } else if (status === 'held') {
      statusText = 'Đang được giữ';
    } else {
      statusText = 'Còn trống';
    }
  }

  return {
    visible,
    x,
    y,
    seatCode,
    zoneName,
    row,
    number,
    price,
    priceFormatted,
    status,
    statusText,
  };
}

/**
 * Normalizes booking modal payload.
 * @param {any} input
 * @returns {{
 *   open: boolean,
 *   holdId: string,
 *   expiresAt: string,
 *   remainingSeconds: number,
 *   items: Array<{
 *     ticketCode: string,
 *     zoneCode?: string,
 *     zoneName: string,
 *     price: number,
 *     priceFormatted: string,
 *     quantity?: number
 *   }>,
 *   totalQuantity: number,
 *   totalAmount: number,
 *   totalAmountFormatted: string
 * }}
 */
export function normalizeBookingModalPayload(input) {
  if (!input || typeof input !== 'object') {
    return {
      open: false,
      holdId: '',
      expiresAt: '',
      remainingSeconds: 300,
      items: [],
      totalQuantity: 0,
      totalAmount: 0,
      totalAmountFormatted: '0 VNĐ',
    };
  }

  const open = Boolean(input.open);
  const holdId = typeof input.holdId === 'string' ? input.holdId.trim() : '';
  const expiresAt = typeof input.expiresAt === 'string' ? input.expiresAt.trim() : '';
  const remainingSeconds =
    typeof input.remainingSeconds === 'number' && Number.isFinite(input.remainingSeconds)
      ? Math.max(0, input.remainingSeconds)
      : 300;

  const rawItems = Array.isArray(input.items) ? input.items : [];
  let calculatedTotal = 0;
  let calculatedCount = 0;

  const items = rawItems.map((item) => {
    const ticketCode = typeof item.ticketCode === 'string' ? item.ticketCode.trim() : '';
    const zoneCode = typeof item.zoneCode === 'string' ? item.zoneCode.trim() : '';
    const zoneName = typeof item.zoneName === 'string' ? item.zoneName.trim() : '';
    const price = typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0;
    const priceFormatted =
      typeof item.priceFormatted === 'string' && item.priceFormatted.trim()
        ? item.priceFormatted.trim()
        : formatVND(price);
    const quantity =
      typeof item.quantity === 'number' && Number.isFinite(item.quantity)
        ? Math.max(1, item.quantity)
        : undefined;

    calculatedTotal += price * (quantity || 1);
    calculatedCount += quantity || 1;

    return {
      ticketCode,
      zoneCode,
      zoneName,
      price,
      priceFormatted,
      ...(quantity !== undefined ? {quantity} : {}),
    };
  });

  const totalQuantity =
    typeof input.totalQuantity === 'number' && Number.isFinite(input.totalQuantity)
      ? input.totalQuantity
      : calculatedCount;

  const totalAmount =
    typeof input.totalAmount === 'number' && Number.isFinite(input.totalAmount)
      ? input.totalAmount
      : calculatedTotal;

  const totalAmountFormatted =
    typeof input.totalAmountFormatted === 'string' && input.totalAmountFormatted.trim()
      ? input.totalAmountFormatted.trim()
      : formatVND(totalAmount);

  return {
    open,
    holdId,
    expiresAt,
    remainingSeconds,
    items,
    totalQuantity,
    totalAmount,
    totalAmountFormatted,
  };
}

/**
 * Dispatches a toast event through the specified target (defaults to window).
 * @param {any} payload
 * @param {EventTarget | null} [target]
 */
export function dispatchToast(payload, target = typeof window !== 'undefined' ? window : null) {
  if (!target || typeof target.dispatchEvent !== 'function') return;
  const normalized = normalizeToastPayload(payload);
  const event = new CustomEvent(OVERLAY_EVENTS.TOAST, {detail: normalized});
  target.dispatchEvent(event);
}

/**
 * Dispatches a seat tooltip update event through the specified target.
 * Supports full seat inspection payloads and coordinate-only move updates.
 * @param {any} payload
 * @param {EventTarget | null} [target]
 */
export function dispatchSeatTooltip(
  payload,
  target = typeof window !== 'undefined' ? window : null
) {
  if (!target || typeof target.dispatchEvent !== 'function') return;
  const isMoveOnly = payload && typeof payload === 'object' && payload.seatCode === undefined;
  const detail = isMoveOnly ? payload : normalizeSeatTooltipPayload(payload);
  const event = new CustomEvent(OVERLAY_EVENTS.SEAT_TOOLTIP, {detail});
  target.dispatchEvent(event);
}

/**
 * Dispatches a booking modal update event through the specified target.
 * @param {any} payload
 * @param {EventTarget | null} [target]
 */
export function dispatchBookingModal(
  payload,
  target = typeof window !== 'undefined' ? window : null
) {
  if (!target || typeof target.dispatchEvent !== 'function') return;
  const normalized = normalizeBookingModalPayload(payload);
  const event = new CustomEvent(OVERLAY_EVENTS.BOOKING_MODAL, {detail: normalized});
  target.dispatchEvent(event);
}

/**
 * Subscribes to toast events. Returns an unsubscribe function.
 * @param {(payload: ReturnType<typeof normalizeToastPayload>) => void} callback
 * @param {EventTarget | null} [target]
 * @returns {() => void}
 */
export function subscribeToToasts(callback, target = typeof window !== 'undefined' ? window : null) {
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }
  /** @param {Event} event */
  const listener = (event) => {
    const custom = /** @type {CustomEvent} */ (event);
    if (custom?.detail) {
      callback(custom.detail);
    }
  };
  target.addEventListener(OVERLAY_EVENTS.TOAST, listener);
  return () => {
    target.removeEventListener(OVERLAY_EVENTS.TOAST, listener);
  };
}

/**
 * Subscribes to seat tooltip events. Returns an unsubscribe function.
 * @param {(payload: ReturnType<typeof normalizeSeatTooltipPayload>) => void} callback
 * @param {EventTarget | null} [target]
 * @returns {() => void}
 */
export function subscribeToSeatTooltip(
  callback,
  target = typeof window !== 'undefined' ? window : null
) {
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }
  /** @param {Event} event */
  const listener = (event) => {
    const custom = /** @type {CustomEvent} */ (event);
    if (custom?.detail) {
      callback(custom.detail);
    }
  };
  target.addEventListener(OVERLAY_EVENTS.SEAT_TOOLTIP, listener);
  return () => {
    target.removeEventListener(OVERLAY_EVENTS.SEAT_TOOLTIP, listener);
  };
}

/**
 * Subscribes to booking modal events. Returns an unsubscribe function.
 * @param {(payload: ReturnType<typeof normalizeBookingModalPayload>) => void} callback
 * @param {EventTarget | null} [target]
 * @returns {() => void}
 */
export function subscribeToBookingModal(
  callback,
  target = typeof window !== 'undefined' ? window : null
) {
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }
  /** @param {Event} event */
  const listener = (event) => {
    const custom = /** @type {CustomEvent} */ (event);
    if (custom?.detail) {
      callback(custom.detail);
    }
  };
  target.addEventListener(OVERLAY_EVENTS.BOOKING_MODAL, listener);
  return () => {
    target.removeEventListener(OVERLAY_EVENTS.BOOKING_MODAL, listener);
  };
}
