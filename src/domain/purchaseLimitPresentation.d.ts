import type {PurchaseLimits} from './purchaseLimits.js';

export const LIMIT_NOTICE_MIN_DURATION_MS: number;

export type LimitsInput = Partial<Pick<PurchaseLimits, 'configuredMax' | 'maxPerOrder'>> | null | undefined;

export interface PurchaseLimitNotice {
  code: string;
  message: string;
  gioiHan: number | null;
  dangGiu: number | null;
  conLai: number | null;
  chiTietHopLe: boolean;
  shownAtMs: number;
  expiresAtMs: number;
}

export function formatSelectionCounter(selectedCount: number, limits?: LimitsInput): string;
export function formatLimitExplanation(limits?: LimitsInput): string | null;
export function describePurchaseLimits(limits?: LimitsInput): {
  configuredMax: number;
  maxPerOrder: number;
  differ: boolean;
  text: string;
};
export function createPurchaseLimitNotice(
  err: unknown,
  options?: {nowMs?: number; durationMs?: number},
): PurchaseLimitNotice | null;
export function isPurchaseLimitNoticeActive(notice: PurchaseLimitNotice | null | undefined, nowMs?: number): boolean;
export function shouldClearPurchaseLimitNotice(notice: PurchaseLimitNotice | null | undefined, nowMs?: number): boolean;
export function remainingNoticeMs(notice: PurchaseLimitNotice | null | undefined, nowMs?: number): number;
