/**
 * Seat rows for a seated (GHE_NGOI) ticket tier. The save RPC creates the zone but no GHE rows,
 * and the hold RPC needs a free GHE row, so the client creates them after saving.
 */
export const SEATS_PER_ROW = 10;

/** 0 -> A, 25 -> Z, 26 -> AA ... */
export function rowLabel(index) {
  let n = Math.max(0, Math.floor(index));
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Seats still missing for a zone: numbered 1..capacity, `perRow` per row, skipping the first `existingCount`.
 * @returns {Array<{SoHang: string, SoGhe: string, MaGheDayDu: string, TrangThai: 'TRONG'}>}
 */
export function generateSeatRows(zoneCode, capacity, existingCount = 0, perRow = SEATS_PER_ROW) {
  const total = Math.max(0, Math.floor(Number(capacity) || 0));
  const skip = Math.max(0, Math.floor(Number(existingCount) || 0));
  const code = String(zoneCode ?? '').trim();
  if (!code || perRow < 1) return [];
  const rows = [];
  for (let n = skip; n < total; n++) {
    const row = rowLabel(Math.floor(n / perRow));
    const seat = String((n % perRow) + 1).padStart(2, '0');
    rows.push({SoHang: row, SoGhe: seat, MaGheDayDu: `${code}-${row}-${seat}`, TrangThai: 'TRONG'});
  }
  return rows;
}
