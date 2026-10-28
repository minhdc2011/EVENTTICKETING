import type {DatabaseSeatStatus, SeatRecord, TicketingCatalog, ZoneRecord} from '../types/ticketing';

export type UiSeatStatus = 'available' | 'sold' | 'held' | 'selected' | 'blocked';

export interface EvaluatedSeatSelection {
  allowed: boolean;
  action?: 'ADD' | 'REMOVE';
  reason?: 'CLOSED' | 'HOLD_ACTIVE' | 'UNAVAILABLE' | 'MAX_CAP_REACHED';
  message?: string;
}

export interface ZoneRowGroup {
  rowLabel: string;
  seats: SeatRecord[];
}

export interface ZoneSeatGroup {
  zone: ZoneRecord;
  availableCount: number;
  rows: ZoneRowGroup[];
}

export interface ZoneLayoutGeometry {
  zone: ZoneRecord;
  svgPath: string;
  center: [number, number];
  tier: number;
}

export interface ReconciledSelectionResult<T> {
  updatedSelection: T[];
  lostSeat: T | null;
  message: string | null;
}

export const DATABASE_STATUS_MAP: Record<DatabaseSeatStatus, UiSeatStatus>;
export const STATUS_NAMES: Record<UiSeatStatus, string>;
export const STATUS_GLYPHS: Record<UiSeatStatus, string>;
export const MAX_SELECTION_CAP: number;

export function mapSeatStatus(dbStatus?: string, isSelected?: boolean): UiSeatStatus;

export function isSeatSelectable(options: {
  status?: string;
  saleOpen: boolean;
  isPending?: boolean;
  hasActiveHold?: boolean;
}): boolean;

export function evaluateSeatSelection(options: {
  seat: Pick<SeatRecord, 'GheID' | 'MaGheDayDu' | 'TrangThai' | 'GiaVeNiemYet'>;
  selectedSeats: Array<Pick<SeatRecord, 'GheID' | 'MaGheDayDu'>>;
  maxCap?: number;
  saleOpen: boolean;
  isPending?: boolean;
  hasActiveHold?: boolean;
}): EvaluatedSeatSelection;

export function toggleSeatSelection<T extends Pick<SeatRecord, 'GheID' | 'MaGheDayDu'>>(
  selectedSeats: T[],
  seat: T,
  maxCap?: number
): T[];

export function calculateSelectionTotal(
  selectedSeats: Array<Pick<SeatRecord, 'GiaVeNiemYet'>>
): number;

export function formatMoneyVND(amount?: number | null): string;

export function groupSeatsByZoneAndRow(
  seats?: SeatRecord[] | null,
  zones?: ZoneRecord[] | null
): ZoneSeatGroup[];

export function filterSeatsByQuery(
  seats: SeatRecord[],
  query?: string | null
): SeatRecord[];

export function findZoneForSeatQuery(
  seats: SeatRecord[],
  query?: string | null
): number | null;

export function reconcileSeatUpdate(
  catalog: TicketingCatalog,
  updateEvent: { seatId?: number | string; seatCode: string; status: DatabaseSeatStatus }
): TicketingCatalog;

export function reconcileSelectionAfterUpdate<T extends Pick<SeatRecord, 'GheID' | 'MaGheDayDu'>>(
  selectedSeats: T[],
  updateEvent: { seatId?: number | string; seatCode: string; status: string },
  ownHeldSeatCodes?: Iterable<string> | null
): ReconciledSelectionResult<T>;

export function reconcileSelectionWithCatalog<T extends Pick<SeatRecord, 'GheID' | 'MaGheDayDu'>>(
  selectedSeats: T[],
  catalog?: { seats?: Array<Pick<SeatRecord, 'GheID' | 'MaGheDayDu' | 'TrangThai'>> } | null
): {
  validSelection: T[];
  removedSeats: T[];
  message: string | null;
};

export interface BuildHoldItemsSuccess {
  success: true;
  items: Array<{ ticketCode: string; zoneCode: string }>;
}

export interface BuildHoldItemsFailure<T> {
  success: false;
  unresolvedSeat: T;
  error: string;
}

export type BuildHoldItemsResult<T> = BuildHoldItemsSuccess | BuildHoldItemsFailure<T>;

export function buildHoldItems<T extends { KhuVucID: number; MaGheDayDu: string }>(
  selectedSeats: T[],
  zones: Array<{ KhuVucID: number; MaKhuVuc?: string }>
): BuildHoldItemsResult<T>;

export function calculateRemainingSeconds(
  expiresAt?: string | null,
  nowMs?: number
): number;

export function formatCountdown(seconds: number): string;

export function computeZoneLayouts(
  zones: ZoneRecord[],
  cx?: number,
  cy?: number
): ZoneLayoutGeometry[];
