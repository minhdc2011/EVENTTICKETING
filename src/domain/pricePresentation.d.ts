import type {HoldRecord, SeatRecord, TicketingCatalog, ZoneRecord} from '../types/ticketing';
import type {PriceConnectionStatus, PriceScope, ZonePriceChangedEvent} from './priceRealtime';

export type PriceMap = ReadonlyMap<number, number>;

export interface PriceTierLike {
  id: number;
  price: number;
}

export interface SelectionPriceOptions {
  hasActiveHold?: boolean;
}

export declare function applyPriceSnapshotToTiers<T extends PriceTierLike>(tiers: T[], priceMap: PriceMap): T[];
export declare function applyPriceUpdateToTiers<T extends PriceTierLike>(
  tiers: T[],
  event: ZonePriceChangedEvent,
  scope?: PriceScope,
): T[];

export declare function applyPriceSnapshotToCatalog(
  catalog: TicketingCatalog | null,
  priceMap: PriceMap,
): TicketingCatalog | null;
export declare function applyPriceUpdateToCatalog(
  catalog: TicketingCatalog | null,
  event: ZonePriceChangedEvent,
  scope?: PriceScope,
): TicketingCatalog | null;

export declare function applyPriceSnapshotToSelection<T extends SeatRecord>(
  selectedSeats: T[],
  priceMap: PriceMap,
  options?: SelectionPriceOptions,
): T[];
export declare function applyPriceUpdateToSelection<T extends SeatRecord>(
  selectedSeats: T[],
  event: ZonePriceChangedEvent,
  scope?: PriceScope,
  options?: SelectionPriceOptions,
): T[];

export declare function applyPriceSnapshotToInspectedSeat<T extends SeatRecord>(
  inspectedSeat: T | null,
  priceMap: PriceMap,
): T | null;
export declare function applyPriceUpdateToInspectedSeat<T extends SeatRecord>(
  inspectedSeat: T | null,
  event: ZonePriceChangedEvent,
  scope?: PriceScope,
): T | null;

export interface HeldSeatPriceLine {
  GheID: number | string;
  MaGheDayDu: string;
  KhuVucID: number;
  zoneCode: string;
  unitPrice: number;
  serverLocked: boolean;
}

export interface HeldStandingPriceLine {
  zoneCode: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  serverLocked: boolean;
}

export interface HeldPriceSnapshot {
  seats: HeldSeatPriceLine[];
  standingLines: HeldStandingPriceLine[];
  seatTotal: number;
  standingTotal: number;
  total: number;
  /** true chỉ khi MỌI dòng đều có DonGiaChot hợp lệ từ máy chủ. */
  hasServerLockedPrice: boolean;
  /** Chú thích trung thực để hiển thị. */
  note: string;
}

export declare const HELD_PRICE_NOTE_SERVER: string;
export declare const HELD_PRICE_NOTE_CLIENT: string;

export declare function buildHeldPriceSnapshot(params: {
  selectedSeats?: SeatRecord[];
  standing?: Record<string, number>;
  zones?: ZoneRecord[];
  holdRecord?: Partial<HoldRecord> | null;
  /** Giá hiển thị mới nhất (khuVucId -> giá) áp lên ghế và khu trước khi xét DonGiaChot. */
  latestPriceMap?: ReadonlyMap<number, number> | null;
}): HeldPriceSnapshot;

export interface PriceConnectionDescription {
  visible: boolean;
  tone: 'ok' | 'info' | 'warning' | 'error';
  text: string;
}

export declare function describePriceConnectionStatus(
  status: PriceConnectionStatus | string | null | undefined,
  options?: {hasConnectedBefore?: boolean},
): PriceConnectionDescription;
