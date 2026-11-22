import {getActiveEventContext, isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import type {Json} from '../types/database.types';
import type {ApiEnvelope, CreateHoldRequest, HoldRecord} from '../types/ticketing';
import {chuanHoaLoiGiuCho} from '../domain/purchaseLimitError';
import {GIOI_HAN_MAC_DINH, taoKhoGiuChoMoPhong} from '../domain/mockBooking';
import {laSuKienDemo} from '../domain/pricingMockDemo.js';
import {apiRequest} from './apiClient';
import {getBuyerSession} from './buyerAuthService';
import {docCauHinhMuaVe} from './purchaseConfigService';
import {docBangGiaChotDemo} from './pricingService';
import {requireSupabaseClient} from './supabaseClient';

const HOLD_DURATION_MS = 300_000;
const SESSION_STORAGE_KEY = 'eventticketing-session-id';

const khoGiuChoMoPhong = taoKhoGiuChoMoPhong({thoiGianGiuMs: HOLD_DURATION_MS});

function getBrowserSessionId(): string {
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const sessionId = crypto.randomUUID();
  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

/**
 * Single source of the identity sent with a hold. Both the React seat map and the concert runtime go through
 * createSeatHold, and the server resolves the show from the active context (not from the caller's eventId),
 * so the eventId on the request is always normalised to the active event slug.
 */
export function resolveHoldRequest(request: CreateHoldRequest): CreateHoldRequest {
  const active = getActiveEventContext();
  return {...request, eventId: active.eventId || request.eventId};
}

export async function createSeatHold(rawRequest: CreateHoldRequest): Promise<HoldRecord> {
  const request = resolveHoldRequest(rawRequest);
  if (!runtimeConfig.useMockData && isSupabaseConfigured()) {
    const active = getActiveEventContext();
    const supabase = requireSupabaseClient();
    let {data, error} = await supabase.rpc('tao_giu_cho_theo_suat', {
      p_suat_dien_id: active.showId,
      p_phien_id: getBrowserSessionId(),
      p_items: request.items.map((item) => ({
        ticketCode: item.ticketCode,
        zoneCode: item.zoneCode,
        ...(item.quantity ? {quantity: item.quantity} : {}),
      })) as Json,
    });
    if (error && ['42883', 'PGRST202'].includes(String(error.code))) {
      const legacyResult = await supabase.rpc('tao_giu_cho', {
        p_su_kien_id: active.eventDatabaseId,
        p_phien_id: getBrowserSessionId(),
        p_items: request.items.map((item) => ({
          ticketCode: item.ticketCode,
          zoneCode: item.zoneCode,
          ...(item.quantity ? {quantity: item.quantity} : {}),
        })) as Json,
      });
      data = legacyResult.data;
      error = legacyResult.error;
    }
    if (error) throw chuanHoaLoiGiuCho(error);
    return data as unknown as HoldRecord;
  }

  if (!runtimeConfig.useMockData) {
    const result = await apiRequest<ApiEnvelope<HoldRecord>>('/api/v1/holds', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return result.data;
  }

  // Đọc lại phiên người mua ở mỗi lần giữ chỗ (không cache) để đăng xuất/đổi tài khoản có hiệu lực ngay.
  const buyer = await getBuyerSession();
  if (!buyer?.userId) {
    throw new Error('Vui lòng đăng nhập tài khoản người mua để giữ chỗ.');
  }

  const active = getActiveEventContext();
  const suKienId = active.eventDatabaseId;
  let gioiHan: number = GIOI_HAN_MAC_DINH;
  try {
    const config = await docCauHinhMuaVe(suKienId);
    gioiHan = config.soVeToiDaMoiDon;
  } catch {
    gioiHan = GIOI_HAN_MAC_DINH;
  }

  // Sự kiện demo: chốt giá theo GiaVeNiemYet hiện hành, đọc ngay trước khi tạo giữ chỗ.
  // Không bọc try/catch: lỗi pricing phải nổi lên, không rơi về giá do caller gửi.
  const laDemo = laSuKienDemo(active.eventId) || laSuKienDemo(active.eventDatabaseId);
  const bangGiaChot = laDemo ? await docBangGiaChotDemo() : null;

  return khoGiuChoMoPhong.giuCho({
    taiKhoanId: buyer.userId,
    suKienId,
    suatDienId: active.showId,
    eventId: request.eventId,
    items: request.items,
    gioiHan,
    bangGiaChot,
  });
}

export async function releaseSeatHold(holdId: string): Promise<void> {
  if (runtimeConfig.useMockData || holdId.startsWith('mock-')) {
    khoGiuChoMoPhong.huy(holdId);
    return;
  }

  if (isSupabaseConfigured()) {
    const supabase = requireSupabaseClient();
    const {error} = await supabase.rpc('huy_giu_cho', {
      p_giu_cho_id: holdId,
      p_phien_id: getBrowserSessionId(),
    });
    if (error) throw error;
    return;
  }

  await apiRequest(`/api/v1/holds/${encodeURIComponent(holdId)}`, {method: 'DELETE'});
}
