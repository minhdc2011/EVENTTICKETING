export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastPayload {
  id?: string;
  message: string;
  type?: ToastVariant;
  durationMs?: number;
}

export interface SeatTooltipPayload {
  visible: boolean;
  x?: number;
  y?: number;
  seatCode?: string;
  zoneName?: string;
  row?: string;
  number?: string | number;
  price?: number;
  priceFormatted?: string;
  status?: 'available' | 'sold' | 'held' | 'selected' | string;
  statusText?: string;
}

export interface BookingHoldItem {
  ticketCode: string;
  zoneCode?: string;
  zoneName: string;
  price: number;
  priceFormatted?: string;
  quantity?: number;
}

export interface BookingModalPayload {
  open: boolean;
  holdId?: string;
  expiresAt?: string;
  remainingSeconds?: number;
  items?: BookingHoldItem[];
  totalQuantity?: number;
  totalAmount?: number;
  totalAmountFormatted?: string;
}

export declare const OVERLAY_EVENTS: {
  readonly TOAST: 'eventticketing:toast';
  readonly SEAT_TOOLTIP: 'eventticketing:seat-tooltip';
  readonly BOOKING_MODAL: 'eventticketing:booking-modal';
};

export declare const SPRINT3_PREVIEW_TOAST_MESSAGE: string;
export declare const HOLD_DISCLOSURE_TEXT: string;
export declare const VALID_TOAST_VARIANTS: readonly ['info', 'success', 'warning', 'error'];

export interface HoldDurationMeta {
  minutes: number;
  seconds: number;
  totalSeconds: number;
  label: string;
}

export declare function formatVND(amount: number | null | undefined): string;

export declare function formatHoldDuration(seconds: number | null | undefined): HoldDurationMeta;

export declare function normalizeToastPayload(input: unknown): Required<ToastPayload>;

export declare function normalizeSeatTooltipPayload(
  input: unknown,
  current?: Partial<SeatTooltipPayload> | null
): Required<SeatTooltipPayload>;

export declare function normalizeBookingModalPayload(input: unknown): Required<BookingModalPayload>;

export declare function dispatchToast(payload: unknown, target?: EventTarget | null): void;

export declare function dispatchSeatTooltip(payload: unknown, target?: EventTarget | null): void;

export declare function dispatchBookingModal(payload: unknown, target?: EventTarget | null): void;

export declare function subscribeToToasts(
  callback: (payload: Required<ToastPayload>) => void,
  target?: EventTarget | null
): () => void;

export declare function subscribeToSeatTooltip(
  callback: (payload: Required<SeatTooltipPayload>) => void,
  target?: EventTarget | null
): () => void;

export declare function subscribeToBookingModal(
  callback: (payload: Required<BookingModalPayload>) => void,
  target?: EventTarget | null
): () => void;
