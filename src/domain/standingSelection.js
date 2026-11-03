/**
 * Standing (DUNG_STAND) ticket selection for the React seat map.
 * Standing zones have no GHE rows: the client sends {zoneCode, quantity} to the hold RPC.
 */
export const STANDING_ZONE_TYPE = 'DUNG_STAND';

export function isStandingZone(zone) {
  return Boolean(zone) && zone.LoaiKhuVuc === STANDING_ZONE_TYPE;
}

export function sumStanding(standing) {
  return Object.values(standing || {}).reduce((total, qty) => total + (Number(qty) || 0), 0);
}

/**
 * Sets the quantity of one standing zone, clamped to what is left of the per-order cap
 * (shared with selected seats) and to the zone availability (when known).
 * @returns {{standing: Record<string, number>, quantity: number, clamped: boolean}}
 */
export function setStandingQuantity(standing, zoneCode, requested, {maxPerOrder, seatedCount = 0, available = Infinity}) {
  const current = {...(standing || {})};
  const wanted = Math.max(0, Math.floor(Number(requested) || 0));
  const otherStanding = sumStanding(current) - (current[zoneCode] || 0);
  const room = Math.max(0, maxPerOrder - seatedCount - otherStanding);
  const quantity = Math.min(wanted, room, Math.max(0, available));
  if (quantity > 0) current[zoneCode] = quantity;
  else delete current[zoneCode];
  return {standing: current, quantity, clamped: quantity < wanted};
}

/** Hold items for standing zones (ticketCode is optional on the server: it builds its own MaVe). */
export function buildStandingHoldItems(standing, zones) {
  const items = [];
  for (const [zoneCode, quantity] of Object.entries(standing || {})) {
    const zone = (zones || []).find((z) => z.MaKhuVuc === zoneCode);
    if (!zone || !(quantity > 0)) continue;
    items.push({ticketCode: '', zoneCode, quantity});
  }
  return items;
}

export function calculateStandingTotal(standing, zones) {
  return Object.entries(standing || {}).reduce((total, [zoneCode, quantity]) => {
    const zone = (zones || []).find((z) => z.MaKhuVuc === zoneCode);
    return total + (zone ? Number(zone.GiaVeNiemYet || 0) * quantity : 0);
  }, 0);
}

/** Zone code a ticket tier maps to (tier.code is the MaKhuVuc in real mode). */
export function findZoneForTier(tier, zones) {
  if (!tier) return null;
  return (zones || []).find((z) => z.MaKhuVuc === tier.code) ?? null;
}
