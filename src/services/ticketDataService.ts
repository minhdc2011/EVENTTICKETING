import type {SeatRecord, TicketingCatalog, ZoneRecord} from '../types/ticketing';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) {
    throw new Error(`Không thể tải ${url}: HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Sprint 1 data boundary. JSON files act as the current adapter; Sprint 2/3 can
 * replace these URLs with REST endpoints without changing presentation code.
 */
export async function loadTicketingCatalog(): Promise<TicketingCatalog> {
  const [zones, seats] = await Promise.all([
    fetchJson<ZoneRecord[]>('/data_zones.json'),
    fetchJson<SeatRecord[]>('/data_seats.json'),
  ]);

  return {zones, seats};
}
