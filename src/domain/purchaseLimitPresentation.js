import {DEFAULT_MAX_TICKETS_PER_ORDER, SERVER_MAX_TICKETS_PER_ORDER} from './purchaseLimits.js';
import {chuanHoaLoiGiuCho, laLoiVuotGioiHan} from './purchaseLimitError.js';

/**
 * Pure presentation helpers shared by the React seat map and the Super Concert runtime.
 * - configuredMax: total ticket limit configured for the event (denominator of the counter, default 4).
 * - maxPerOrder: ceiling for a single selection/hold = min(4, configuredMax).
 */
export const LIMIT_NOTICE_MIN_DURATION_MS = 5000;

function nonNegativeInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function readLimits(limits) {
  const configuredMax = positiveInt(limits?.configuredMax, DEFAULT_MAX_TICKETS_PER_ORDER);
  const maxPerOrder = Math.min(positiveInt(limits?.maxPerOrder, configuredMax), SERVER_MAX_TICKETS_PER_ORDER, configuredMax);
  return {configuredMax, maxPerOrder};
}

/** 'Đã chọn x/giới hạn vé'. x = seated seats + standing quantity (caller passes the total). */
export function formatSelectionCounter(selectedCount, limits) {
  const {configuredMax} = readLimits(limits);
  return `Đã chọn ${nonNegativeInt(selectedCount)}/${configuredMax} vé`;
}

/** Explains configuredMax vs maxPerOrder. Returns null when only one limit applies. */
export function formatLimitExplanation(limits) {
  const {configuredMax, maxPerOrder} = readLimits(limits);
  if (configuredMax > maxPerOrder) {
    return `Giới hạn của sự kiện là ${configuredMax} vé, nhưng mỗi lượt chọn và giữ chỗ chỉ được tối đa ${maxPerOrder} vé.`;
  }
  return null;
}

/** Subcopy line: always states the per-selection ceiling, plus the event limit when it is larger. */
export function describePurchaseLimits(limits) {
  const {configuredMax, maxPerOrder} = readLimits(limits);
  return {
    configuredMax,
    maxPerOrder,
    differ: configuredMax > maxPerOrder,
    text:
      formatLimitExplanation(limits) ||
      `Mỗi sự kiện được chọn và giữ tối đa ${maxPerOrder} vé.`,
  };
}

/**
 * Builds the over-limit notice from a raw/normalized error. Returns null for any other error.
 * gioiHan/dangGiu/conLai come only from the server response; never derived from the client selection.
 */
export function createPurchaseLimitNotice(err, {nowMs = Date.now(), durationMs = LIMIT_NOTICE_MIN_DURATION_MS} = {}) {
  const normalized = chuanHoaLoiGiuCho(err);
  if (!laLoiVuotGioiHan(normalized)) return null;
  const valid = normalized.chiTietHopLe === true;
  const gioiHan = valid ? normalized.gioiHan : null;
  const dangGiu = valid ? normalized.dangGiu : null;
  const conLai = valid ? normalized.conLai : null;
  const message = valid
    ? `Vượt giới hạn vé: sự kiện cho phép tối đa ${gioiHan} vé, bạn đang giữ ${dangGiu} vé. ` +
      (conLai > 0 ? `Bạn còn có thể chọn thêm ${conLai} vé.` : 'Bạn không thể chọn thêm vé.') +
      ' Lựa chọn hiện tại được giữ lại, vui lòng giảm số lượng.'
    : `${normalized.message} Lựa chọn hiện tại được giữ lại.`;
  const duration = Math.max(Number(durationMs) || 0, LIMIT_NOTICE_MIN_DURATION_MS);
  return {
    code: normalized.ma,
    message,
    gioiHan,
    dangGiu,
    conLai,
    chiTietHopLe: valid,
    shownAtMs: nowMs,
    expiresAtMs: nowMs + duration,
  };
}

export function isPurchaseLimitNoticeActive(notice, nowMs = Date.now()) {
  return Boolean(notice) && nowMs < notice.expiresAtMs;
}

/** Auto-dismiss is allowed only once the notice has been visible for its full duration. */
export function shouldClearPurchaseLimitNotice(notice, nowMs = Date.now()) {
  return Boolean(notice) && nowMs >= notice.expiresAtMs;
}

export function remainingNoticeMs(notice, nowMs = Date.now()) {
  return notice ? Math.max(0, notice.expiresAtMs - nowMs) : 0;
}
