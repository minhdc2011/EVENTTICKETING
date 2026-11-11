import {filterSeatsByQuery} from './seatMap.js';

/**
 * Pure seat-code search resolution (FR-T1-04).
 * Independent of the display mode so the interactive map, the zone grid and the
 * organizer-provided official map all react to the same result.
 *
 * @param {Array<any>} seats
 * @param {string | null | undefined} query
 * @returns {{
 *   status: 'idle' | 'found' | 'not-found',
 *   query: string,
 *   zoneId: number | null,
 *   seatCode: string | null,
 *   matchCount: number
 * }}
 */
export function resolveSeatSearch(seats, query) {
  const trimmed = String(query ?? '').trim();
  const idle = {status: 'idle', query: trimmed, zoneId: null, seatCode: null, matchCount: 0};
  if (!trimmed || !Array.isArray(seats) || seats.length === 0) return idle;

  const q = trimmed.toLowerCase();
  const exact = seats.find((seat) => String(seat.MaGheDayDu ?? '').trim().toLowerCase() === q);
  const matches = exact ? [exact] : filterSeatsByQuery(seats, trimmed);

  if (matches.length === 0) {
    return {status: 'not-found', query: trimmed, zoneId: null, seatCode: null, matchCount: 0};
  }

  const first = matches[0];
  return {
    status: 'found',
    query: trimmed,
    zoneId: first.KhuVucID ?? null,
    // Only an exact code identifies one seat to highlight; partial queries just dim non-matches.
    seatCode: exact ? exact.MaGheDayDu : null,
    matchCount: matches.length,
  };
}
