import {getActiveEventContext, runtimeConfig, type ActiveEventContext} from '../config/runtime';
import {requireSupabaseClient} from './supabaseClient';
import {KHOA_LUU_TRU_MO_PHONG, docTrangThaiMoPhong} from './pricingService';
import {createMockState, type MockNow, type MockPricingSeed, type MockPricingState} from '../domain/mockPricing.js';
import {
  nangCapTrangThaiV1,
  taoKhoPhienMock,
  type KhoLuuTruCore,
} from '../domain/pricingServiceCore.js';
import {
  PRICE_MOCK_EVENT,
  fetchScopeZonePrices,
  isValidPrice,
  kiemTraGhiLocalStorage,
  mapRealtimePricePayload,
  phatThongBaoGiaMock,
  subscribeToMockPriceUpdates,
  subscribeToPriceUpdatesWithClient,
  type MockReadStateResult,
  type PriceConnectionStatus,
  type PriceScope,
  type ZonePriceChangedEvent,
  type ZonePriceRow,
} from '../domain/priceRealtime.js';

export type PriceUpdateListener = (event: ZonePriceChangedEvent) => void;
export type PriceConnectionStatusListener = (status: PriceConnectionStatus) => void;

export interface PriceRealtimeOptions {
  supabaseClient?: any;
  activeContext?: ActiveEventContext;
  scope?: PriceScope;
  useMockData?: boolean;
  fetchZonePrices?: (supabase: any, scope: PriceScope) => Promise<ZonePriceRow[]>;
  readState?: () => Promise<MockReadStateResult>;
  canWriteStorage?: () => boolean;
  eventTarget?: EventTarget | null;
  storageKey?: string;
  onSnapshot?: (prices: ReadonlyMap<number, number>) => void;
}

export {
  PRICE_MOCK_EVENT,
  fetchScopeZonePrices,
  isValidPrice,
  kiemTraGhiLocalStorage,
  mapRealtimePricePayload,
  phatThongBaoGiaMock,
  subscribeToMockPriceUpdates,
  subscribeToPriceUpdatesWithClient,
};
export type {
  MockReadStateResult,
  PriceConnectionStatus,
  PriceScope,
  ZonePriceChangedEvent,
  ZonePriceRow,
};

function layKhoMacDinh(): KhoLuuTruCore | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function taoDocTrangThaiMock(storageKey: string): () => Promise<MockReadStateResult> {
  if (runtimeConfig.useMockData && storageKey === KHOA_LUU_TRU_MO_PHONG) {
    return async () => {
      const {state, luuTru} = await docTrangThaiMoPhong();
      return {state, meta: luuTru};
    };
  }
  // Khi options.useMockData=true ép bật nhánh mock trong lúc runtimeConfig.useMockData=false
  // (hoặc dùng storageKey riêng), docTrangThaiMoPhong từ chối theo quy tắc pricingService;
  // đọc trực tiếp qua taoKhoPhienMock để vẫn dùng được và phản ánh đúng LOCAL_STORAGE/BO_NHO.
  const kho = taoKhoPhienMock<MockPricingState, MockNow, MockPricingSeed>({
    khoa: storageKey,
    taoState: (seed) => createMockState(seed),
    layKhoMacDinh,
    chuanHoa: nangCapTrangThaiV1,
  });
  return async () => {
    const phien = kho.moPhien({now: Date.now()});
    return {state: phien.state, meta: phien.meta};
  };
}

export function subscribeToPriceUpdates(
  listener: PriceUpdateListener,
  onConnectionStatus: PriceConnectionStatusListener = () => undefined,
  options?: PriceRealtimeOptions,
): () => void {
  const active = options?.activeContext ?? getActiveEventContext();
  const scope: PriceScope = options?.scope ?? {
    suKienId: active.eventDatabaseId,
    suatDienId: active.showId,
  };
  const useMockData = options?.useMockData ?? runtimeConfig.useMockData;

  if (useMockData) {
    const storageKey = options?.storageKey ?? KHOA_LUU_TRU_MO_PHONG;
    const readState = options?.readState ?? taoDocTrangThaiMock(storageKey);
    const eventTarget =
      options?.eventTarget !== undefined
        ? options.eventTarget
        : typeof window !== 'undefined'
          ? window
          : null;

    const canWriteStorage =
      options?.canWriteStorage ??
      (options?.readState ? undefined : () => kiemTraGhiLocalStorage(layKhoMacDinh(), storageKey));

    return subscribeToMockPriceUpdates({
      scope,
      readState,
      canWriteStorage,
      eventTarget,
      storageKey,
      listener,
      onConnectionStatus,
      onSnapshot: options?.onSnapshot,
    });
  }

  try {
    const supabase = options?.supabaseClient ?? requireSupabaseClient();
    return subscribeToPriceUpdatesWithClient({
      supabase,
      scope,
      listener,
      onConnectionStatus,
      onSnapshot: options?.onSnapshot,
      fetchZonePrices: options?.fetchZonePrices ?? fetchScopeZonePrices,
    });
  } catch {
    onConnectionStatus('ERROR');
    return () => undefined;
  }
}
