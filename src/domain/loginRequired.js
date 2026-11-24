import {laLoiChuaDangNhap, laLoiThieuOtp} from './purchaseLimitError.js';

/** Sự kiện cửa sổ: một thao tác (giữ ghế) cần đăng nhập; hộp thoại toàn trang sẽ hiện. */
export const EVENT_CAN_DANG_NHAP = 'eventticketing:login-required';
/** Sự kiện cửa sổ: người dùng vừa đăng nhập xong tại chỗ; nơi đang chờ sẽ thử lại thao tác. */
export const EVENT_DA_DANG_NHAP = 'eventticketing:login-success';
/** Khóa sessionStorage lưu lựa chọn ghế đang chờ khi người dùng rời trang để đăng nhập. */
export const KHOA_GIU_CHO_DANG_CHO = 'eventticketing:pending-hold';
/** Sự kiện cửa sổ: bước thanh toán cần xác minh OTP qua email; hộp thoại nhập mã sẽ hiện. */
export const EVENT_CAN_OTP = 'eventticketing:otp-required';
/** Sự kiện cửa sổ: người dùng vừa xác minh OTP xong; nơi đang chờ tiếp tục thanh toán. */
export const EVENT_DA_XAC_MINH_OTP = 'eventticketing:otp-verified';
export const THONG_BAO_CAN_OTP_THANH_TOAN = 'Cần xác minh OTP qua email trước khi thanh toán.';

export const THONG_BAO_CAN_DANG_NHAP_GIU_CHO =
  'Bạn cần đăng nhập tài khoản người mua để giữ ghế. Hãy đăng nhập rồi quay lại sự kiện này.';

const TOI_DA_GHE = 20;
const TOI_DA_TUOI_MS = 30 * 60 * 1000;

export class LoginRequiredError extends Error {
  constructor(message = THONG_BAO_CAN_DANG_NHAP_GIU_CHO, {cause} = {}) {
    super(message);
    this.name = 'LoginRequiredError';
    this.ma = 'CAN_DANG_NHAP';
    this.status = 401;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Lỗi chưa đăng nhập, dù do dịch vụ báo trước hay do máy chủ từ chối (401, 28000, permission denied). */
export function laLoiCanDangNhap(err) {
  if (!err || typeof err !== 'object') return false;
  return err.ma === 'CAN_DANG_NHAP' || laLoiChuaDangNhap(err);
}

export class OtpRequiredError extends Error {
  constructor(message = THONG_BAO_CAN_OTP_THANH_TOAN, {cause} = {}) {
    super(message);
    this.name = 'OtpRequiredError';
    this.ma = 'CAN_XAC_MINH_OTP';
    if (cause !== undefined) this.cause = cause;
  }
}

/** Đã đăng nhập nhưng chưa xác minh OTP (máy chủ từ chối 42501 nói về OTP, hoặc dịch vụ báo trước). */
export function laLoiCanOtp(err) {
  if (!err || typeof err !== 'object') return false;
  return err.ma === 'CAN_XAC_MINH_OTP' || laLoiThieuOtp(err);
}

/** Giữ chỗ đã hết hạn (hoặc đã bị trả) nên không xác nhận thanh toán hoặc gia hạn được. */
export class HoldExpiredError extends Error {
  constructor(message = 'Giữ chỗ đã hết hạn. Vui lòng chọn lại ghế để tiếp tục.', {cause} = {}) {
    super(message);
    this.name = 'HoldExpiredError';
    this.ma = 'GIU_CHO_HET_HAN';
    if (cause !== undefined) this.cause = cause;
  }
}

/** Máy chủ báo GIU_CHO_HET_HAN (P0001) hoặc lớp mô phỏng báo hết hạn. */
export function laLoiGiuChoHetHan(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.ma === 'GIU_CHO_HET_HAN') return true;
  const message = typeof err.message === 'string' ? err.message : '';
  return String(err.code ?? '') === 'P0001' && message.includes('GIU_CHO_HET_HAN');
}

function phat(name, target) {
  const w = target ?? (typeof window === 'undefined' ? null : window);
  if (!w || typeof w.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return false;
  w.dispatchEvent(new CustomEvent(name));
  return true;
}

export const phatYeuCauDangNhap = (target) => phat(EVENT_CAN_DANG_NHAP, target);
export const phatDaDangNhap = (target) => phat(EVENT_DA_DANG_NHAP, target);
export const phatYeuCauOtp = (target) => phat(EVENT_CAN_OTP, target);
export const phatDaXacMinhOtp = (target) => phat(EVENT_DA_XAC_MINH_OTP, target);

/** Chuỗi JSON lưu lựa chọn ghế đang chờ; không chứa dữ liệu cá nhân. */
export function taoYDinhGiuCho({scopeKey, seatCodes, standing, now = Date.now()}) {
  const codes = Array.isArray(seatCodes) ? seatCodes.filter((c) => typeof c === 'string' && c !== '') : [];
  const st = {};
  for (const [k, v] of Object.entries(standing && typeof standing === 'object' ? standing : {})) {
    if (typeof k === 'string' && k !== '' && Number.isInteger(v) && v > 0) st[k] = v;
  }
  return JSON.stringify({scopeKey: String(scopeKey), seatCodes: codes.slice(0, TOI_DA_GHE), standing: st, at: now});
}

/** Đọc và kiểm tra: đúng phạm vi sự kiện/suất, còn mới (30 phút), dữ liệu hợp lệ; sai thì trả null. */
export function docYDinhGiuCho(raw, scopeKey, now = Date.now()) {
  if (typeof raw !== 'string' || raw === '') return null;
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || v.scopeKey !== String(scopeKey)) return null;
  if (typeof v.at !== 'number' || now - v.at < 0 || now - v.at > TOI_DA_TUOI_MS) return null;
  if (!Array.isArray(v.seatCodes) || v.seatCodes.length > TOI_DA_GHE || !v.seatCodes.every((c) => typeof c === 'string' && c !== '')) return null;
  const st = {};
  if (v.standing && typeof v.standing === 'object' && !Array.isArray(v.standing)) {
    for (const [k, n] of Object.entries(v.standing)) {
      if (Number.isInteger(n) && n > 0 && n <= TOI_DA_GHE) st[k] = n;
    }
  }
  if (v.seatCodes.length === 0 && Object.keys(st).length === 0) return null;
  return {seatCodes: v.seatCodes, standing: st};
}
