export const SERVER_MAX_TICKETS_PER_ORDER: number;
export const DEFAULT_MAX_TICKETS_PER_ORDER: number;
export const DEFAULT_HOLD_MINUTES: number;
export interface PurchaseLimits {
  maxPerOrder: number;
  configuredMax: number;
  holdMinutes: number;
  cappedByServer: boolean;
}
export function resolvePurchaseLimits(
  config?: {maxTicketsPerOrder?: unknown; holdMinutes?: unknown} | null,
): PurchaseLimits;
export function formatHoldLabel(holdMinutes: number): string;
