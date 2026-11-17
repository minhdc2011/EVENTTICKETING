import type {SeatRecord} from '../types/ticketing';

export interface SeatSearchResult {
  status: 'idle' | 'found' | 'not-found';
  query: string;
  zoneId: number | null;
  seatCode: string | null;
  matchCount: number;
}

export function resolveSeatSearch(
  seats: readonly SeatRecord[] | null | undefined,
  query: string | null | undefined,
): SeatSearchResult;
