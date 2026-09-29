export type SaleStatus = 'UPCOMING' | 'ON_SALE' | 'SOLD_OUT' | 'CLOSED';

export const SALE_STATUS: Readonly<Record<SaleStatus, SaleStatus>>;

export function deriveSaleStatus(input: {
  now?: Date | string | number;
  saleStartsAt: Date | string | number;
  saleEndsAt?: Date | string | number;
  databaseStatus?: string;
  hasAvailability?: boolean;
}): SaleStatus;

export function isSaleOpen(status: SaleStatus | string): boolean;

