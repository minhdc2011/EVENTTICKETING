export declare const PRICE_MOCK_EVENT: 'eventticketing:pricing-mock-changed';

export type PriceConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR'
  | 'LOCAL_ONLY';

export interface PriceScope {
  suKienId?: number | null;
  suatDienId?: number | null;
}

export interface ZonePriceChangedEvent {
  type: 'ZONE_PRICE_CHANGED';
  suKienId: number | null;
  suatDienId: number | null;
  khuVucId: number;
  gia: number;
  occurredAt: string;
  nguon: 'REALTIME' | 'RESYNC' | 'MOCK';
}

export declare const LEGACY_NO_SUAT_KEY: '__legacyNoSuat';

export interface ZonePriceRow {
  KhuVucID: number;
  SuKienID: number | null;
  SuatDienID: number | null;
  GiaVeNiemYet: number | null;
  __legacyNoSuat?: boolean;
}

export declare function isValidPrice(value: unknown): value is number;

export declare function khopMaPhamViNghiemNgat(idDong: unknown, idPhamVi: unknown): boolean;

export interface ThieuDinhDanhPhamViOptions extends PriceScope {
  boQuaSuatDien?: boolean;
}

export declare function thieuDinhDanhPhamVi(
  row: unknown,
  options?: ThieuDinhDanhPhamViOptions,
): boolean;

export interface MapRealtimePricePayloadOptions extends PriceScope {
  allowedZoneIds: ReadonlySet<number>;
  lastPrices?: ReadonlyMap<number, number>;
  boQuaSuatDien?: boolean;
}

export declare function mapRealtimePricePayload(
  payload: unknown,
  options: MapRealtimePricePayloadOptions,
): ZonePriceChangedEvent | null;

export declare function fetchScopeZonePrices(
  supabase: any,
  scope: PriceScope,
): Promise<ZonePriceRow[]>;

export interface SubscribeToPriceUpdatesWithClientParams {
  supabase: any;
  scope: PriceScope;
  listener: (event: ZonePriceChangedEvent) => void;
  onConnectionStatus?: (status: PriceConnectionStatus) => void;
  onSnapshot?: (prices: ReadonlyMap<number, number>) => void;
  fetchZonePrices?: (supabase: any, scope: PriceScope) => Promise<ZonePriceRow[]>;
}

export declare function subscribeToPriceUpdatesWithClient(
  params: SubscribeToPriceUpdatesWithClientParams,
): () => void;

// ---- Nhánh mock (hydrogen) ----

export interface MockStorageMeta {
  luuTru?: 'LOCAL_STORAGE' | 'BO_NHO' | string | null;
}

export interface MockReadStateResult {
  state: Record<string, any>;
  meta?: MockStorageMeta | null;
  luuTru?: MockStorageMeta | null;
}

export declare function phatThongBaoGiaMock(
  target: EventTarget | null | undefined,
  detail?: unknown,
): void;

export declare function kiemTraGhiLocalStorage(
  storage: {setItem?: (key: string, value: string) => void; removeItem?: (key: string) => void} | null | undefined,
  key: string,
): boolean;

export interface SubscribeToMockPriceUpdatesParams {
  canWriteStorage?: () => boolean;
  scope?: PriceScope;
  readState: () => Promise<MockReadStateResult>;
  eventTarget?: EventTarget | null;
  storageKey?: string;
  listener: (event: ZonePriceChangedEvent) => void;
  onConnectionStatus?: (status: PriceConnectionStatus) => void;
  onSnapshot?: (prices: ReadonlyMap<number, number>) => void;
}

export declare function subscribeToMockPriceUpdates(
  params: SubscribeToMockPriceUpdatesParams,
): () => void;
