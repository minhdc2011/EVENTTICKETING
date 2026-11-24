import {getActiveEventContext, isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import type {Json} from '../types/database.types';
import type {ApiEnvelope, CreateHoldRequest, HoldRecord} from '../types/ticketing';
import {chuanHoaLoiGiuCho, laLoiChuaDangNhap} from '../domain/purchaseLimitError';
import {
  HoldExpiredError,
  LoginRequiredError,
  OtpRequiredError,
  laLoiCanOtp,
  laLoiGiuChoHetHan,
} from '../domain/loginRequired.js';
import {GIOI_HAN_MAC_DINH, taoKhoGiuChoMoPhong} from '../domain/mockBooking';
import {laSuKienDemo} from '../domain/pricingMockDemo.js';
import {apiRequest} from './apiClient';
import {getBuyerSession} from './buyerAuthService';
import {kiemTraDaXacMinhOtp} from './otpService';
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
    // Giữ chỗ cần tài khoản đăng nhập: báo sớm bằng lỗi riêng để giao diện hiện hộp thoại đăng nhập (thay vì lỗi chung).
    const {data: phien} = await supabase.auth.getSession();
    if (!phien.session) throw new LoginRequiredError();
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
    if (error) {
      // Giữ chỗ chỉ cần đăng nhập; OTP được kiểm ở bước xác nhận thanh toán (confirmSeatPayment).
      if (laLoiChuaDangNhap(error)) throw new LoginRequiredError(undefined, {cause: error});
      throw chuanHoaLoiGiuCho(error);
    }
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
    throw new LoginRequiredError('Vui lòng đăng nhập tài khoản người mua để giữ chỗ.');
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

/** Lỗi gia hạn/xác nhận từ máy chủ -> lỗi nghiệp vụ mà giao diện hiểu. */
function chuanHoaLoiThanhToan(error: unknown): unknown {
  if (laLoiGiuChoHetHan(error)) return new HoldExpiredError(undefined, {cause: error});
  if (laLoiCanOtp(error)) return new OtpRequiredError(undefined, {cause: error});
  if (laLoiChuaDangNhap(error)) return new LoginRequiredError(undefined, {cause: error});
  return chuanHoaLoiGiuCho(error);
}

export type SeatHoldExtension = {holdId: string; expiresAt: string; daGiaHan: boolean; giaHanMoi: boolean};

/**
 * Gia hạn giữ chỗ MỘT lần (thêm 5 phút) khi người dùng bắt đầu bước OTP, để ghế không bị trả lúc đang nhập mã.
 * Gọi lại sau khi đã gia hạn thì trả hạn hiện tại, không gia hạn thêm.
 */
export async function extendSeatHold(holdId: string): Promise<SeatHoldExtension> {
  if (runtimeConfig.useMockData || holdId.startsWith('mock-')) {
    try {
      return khoGiuChoMoPhong.giaHan(holdId);
    } catch (err) {
      throw chuanHoaLoiThanhToan(err);
    }
  }
  if (isSupabaseConfigured()) {
    const supabase = requireSupabaseClient();
    const {data, error} = await supabase.rpc('gia_han_giu_cho', {
      p_giu_cho_id: holdId,
      p_phien_id: getBrowserSessionId(),
    });
    if (error) throw chuanHoaLoiThanhToan(error);
    return data as unknown as SeatHoldExtension;
  }
  const result = await apiRequest<ApiEnvelope<SeatHoldExtension>>(`/api/v1/holds/${encodeURIComponent(holdId)}/extend`, {
    method: 'POST',
  });
  return result.data;
}

export type SeatPaymentConfirmation = {holdId: string; status: 'CONVERTED'; soVe?: number; daXacNhanTruoc?: boolean};

/**
 * Xác nhận thanh toán (mô phỏng, chưa có cổng thanh toán): giữ chỗ còn hạn chuyển thành đã mua.
 * Sự kiện bật OTP mà phiên chưa xác minh thì ném OtpRequiredError; giữ chỗ hết hạn thì ném HoldExpiredError.
 */
export async function confirmSeatPayment(holdId: string, maDemo?: string): Promise<SeatPaymentConfirmation> {
  if (runtimeConfig.useMockData || holdId.startsWith('mock-')) {
    const buyer = await getBuyerSession();
    if (!buyer?.userId) throw new LoginRequiredError('Vui lòng đăng nhập tài khoản người mua để thanh toán.');
    const hold = khoGiuChoMoPhong.layGiuCho(holdId);
    if (!hold || String(hold.taiKhoanId) !== String(buyer.userId)) throw new HoldExpiredError();
    if (hold.status === 'ACTIVE' && hold.expiresAtMs <= Date.now()) throw new HoldExpiredError();
    if (hold.status === 'ACTIVE') {
      let yeuCauOtp = false;
      try {
        yeuCauOtp = (await docCauHinhMuaVe(getActiveEventContext().eventDatabaseId)).yeuCauXacMinhOtp === true;
      } catch {
        yeuCauOtp = false;
      }
      // Sự kiện bật OTP: phải có bằng chứng xác minh (mô phỏng) trước khi xác nhận thanh toán, giống máy chủ thật.
      if (yeuCauOtp) {
        const daXacMinh = await kiemTraDaXacMinhOtp({userId: buyer.userId});
        if (!daXacMinh.daXacMinh) throw new OtpRequiredError();
      }
    }
    try {
      return khoGiuChoMoPhong.xacNhan(holdId);
    } catch (err) {
      throw chuanHoaLoiThanhToan(err);
    }
  }
  if (isSupabaseConfigured()) {
    const supabase = requireSupabaseClient();
    const {data: phien} = await supabase.auth.getSession();
    if (!phien.session) throw new LoginRequiredError();
    const {data, error} = await supabase.rpc('xac_nhan_thanh_toan', {
      p_giu_cho_id: holdId,
      p_phien_id: getBrowserSessionId(),
      // Mã demo thay OTP: chỉ gửi khi người dùng nhập; máy chủ chỉ chấp nhận cho tài khoản @demo.vn.
      ...(maDemo ? {p_ma_demo: maDemo} : {}),
    });
    if (error) throw chuanHoaLoiThanhToan(error);
    return data as unknown as SeatPaymentConfirmation;
  }
  const result = await apiRequest<ApiEnvelope<SeatPaymentConfirmation>>(
    `/api/v1/holds/${encodeURIComponent(holdId)}/confirm`,
    {method: 'POST'},
  );
  return result.data;
}
