/**
 * Purchase limits shown/enforced by the client.
 * The booking RPC is the final authority and currently hard-codes 4 tickets and 5 minutes
 * (supabase/migrations/20261005090000_*.sql), so the client never allows more than the server cap.
 */
export const SERVER_MAX_TICKETS_PER_ORDER = 4;
export const DEFAULT_MAX_TICKETS_PER_ORDER = 4;
export const DEFAULT_HOLD_MINUTES = 5;

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * @param {{maxTicketsPerOrder?: unknown, holdMinutes?: unknown} | null | undefined} config
 * @returns {{maxPerOrder: number, configuredMax: number, holdMinutes: number, cappedByServer: boolean}}
 */
export function resolvePurchaseLimits(config) {
  const configuredMax = positiveInt(config?.maxTicketsPerOrder) ?? DEFAULT_MAX_TICKETS_PER_ORDER;
  const holdMinutes = positiveInt(config?.holdMinutes) ?? DEFAULT_HOLD_MINUTES;
  const maxPerOrder = Math.min(configuredMax, SERVER_MAX_TICKETS_PER_ORDER);
  return {maxPerOrder, configuredMax, holdMinutes, cappedByServer: configuredMax > maxPerOrder};
}

export function formatHoldLabel(holdMinutes) {
  return `${holdMinutes} phút`;
}
