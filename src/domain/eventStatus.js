export const SALE_STATUS = Object.freeze({
  UPCOMING: 'UPCOMING',
  ON_SALE: 'ON_SALE',
  SOLD_OUT: 'SOLD_OUT',
  CLOSED: 'CLOSED',
});

const SOLD_OUT_DATABASE_STATUSES = new Set(['HET_VE', 'SOLD_OUT']);
const CLOSED_DATABASE_STATUSES = new Set(['DONG_BAN', 'DA_DONG', 'CLOSED', 'CANCELLED']);

/**
 * Derives the public sale state from server-owned timestamps and inventory.
 * The browser only uses this to present/gate the UI; booking RPCs remain the
 * final authority for every inventory mutation.
 */
export function deriveSaleStatus({
  now = new Date(),
  saleStartsAt,
  saleEndsAt,
  databaseStatus = '',
  hasAvailability = true,
}) {
  const normalizedDatabaseStatus = String(databaseStatus).trim().toUpperCase();
  const currentTime = new Date(now).getTime();
  const startTime = new Date(saleStartsAt).getTime();
  const endTime = saleEndsAt ? new Date(saleEndsAt).getTime() : Number.POSITIVE_INFINITY;

  if (CLOSED_DATABASE_STATUSES.has(normalizedDatabaseStatus) || currentTime >= endTime) {
    return SALE_STATUS.CLOSED;
  }
  if (currentTime < startTime) return SALE_STATUS.UPCOMING;
  if (SOLD_OUT_DATABASE_STATUSES.has(normalizedDatabaseStatus) || !hasAvailability) {
    return SALE_STATUS.SOLD_OUT;
  }
  return SALE_STATUS.ON_SALE;
}

export function isSaleOpen(status) {
  return status === SALE_STATUS.ON_SALE;
}

