import type {DatabaseSeatStatus, SeatStatusEvent} from '../types/ticketing';
import type {ActiveEventContext} from '../config/runtime';

export declare const MAX_ZONE_FILTER_SIZE: number;

export declare const VALID_SEAT_STATUSES: Set<DatabaseSeatStatus>;

export declare function isValidSeatStatus(status: unknown): status is DatabaseSeatStatus;

export declare function normalizeZoneId(val: unknown): number | null;

export declare function chunkArray<T>(items: T[], size?: number): T[][];

export declare function buildZoneInFilter(zoneIds: number[]): string;

export declare function extractSeatRow(payload: unknown): Record<string, any> | null;

export declare function isSeatInShow(
  zoneId: unknown,
  allowedZoneIds: ReadonlySet<number> | null | undefined,
): boolean;

export interface MapRealtimeSeatPayloadOptions {
  allowedZoneIds: ReadonlySet<number>;
  eventId: string;
  zoneCodesById?: ReadonlyMap<number, string>;
}

export declare function mapRealtimeSeatPayload(
  payload: unknown,
  options: MapRealtimeSeatPayloadOptions,
): SeatStatusEvent | null;

export interface ZoneSummaryRow {
  KhuVucID: number;
  MaKhuVuc?: string;
}

export declare function fetchShowZones(
  supabase: any,
  showId: number,
  eventDatabaseId?: number,
): Promise<ZoneSummaryRow[]>;

export interface SubscribeToSeatUpdatesWithClientParams {
  supabase: any;
  active: ActiveEventContext;
  listener: (event: SeatStatusEvent) => void;
  onConnectionStatus?: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR') => void;
  fetchZones?: (
    supabase: any,
    showId: number,
    eventDatabaseId?: number,
  ) => Promise<ZoneSummaryRow[]>;
}

export declare function subscribeToSeatUpdatesWithClient(
  params: SubscribeToSeatUpdatesWithClientParams,
): () => void;
