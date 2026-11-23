export const MA_VUOT_GIOI_HAN = 'VUOT_GIOI_HAN_VE';
export const PG_CODE = '22023';
export const HTTP_STATUS = 422;

const THONG_BAO_DU_PHONG = 'Bạn đã vượt quá số vé tối đa được giữ cho sự kiện này. Vui lòng giảm số lượng hoặc hủy giữ chỗ cũ.';

export class PurchaseLimitError extends Error {
  constructor(message, {gioiHan = null, dangGiu = null, conLai = null, chiTietHopLe = false, cause} = {}) {
    super(message);
    this.name = 'PurchaseLimitError';
    this.ma = MA_VUOT_GIOI_HAN;
    this.status = HTTP_STATUS;
    this.gioiHan = gioiHan;
    this.dangGiu = dangGiu;
    this.conLai = conLai;
    this.chiTietHopLe = chiTietHopLe;
    if (cause !== undefined) this.cause = cause;
  }
}

export function laLoiVuotGioiHan(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.ma === MA_VUOT_GIOI_HAN) return true;
  const message = typeof err.message === 'string' ? err.message.trim() : '';
  return String(err.code) === PG_CODE && message === MA_VUOT_GIOI_HAN;
}

function laSoNguyenKhongAm(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function docChiTietGioiHan(details) {
  try {
    let obj = details;
    if (typeof details === 'string') obj = JSON.parse(details);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const {gioiHan, dangGiu, conLai} = obj;
    if (![gioiHan, dangGiu, conLai].every(laSoNguyenKhongAm)) return null;
    if (conLai !== Math.max(gioiHan - dangGiu, 0)) return null;
    return {gioiHan, dangGiu, conLai};
  } catch {
    return null;
  }
}

export function taoLoiVuotGioiHan(chiTiet, cause) {
  const hopLe = docChiTietGioiHan(chiTiet);
  if (!hopLe) {
    return new PurchaseLimitError(THONG_BAO_DU_PHONG, {cause});
  }
  return new PurchaseLimitError(
    `Bạn đã vượt giới hạn vé: tối đa ${hopLe.gioiHan} vé, đang giữ ${hopLe.dangGiu} vé, còn lại ${hopLe.conLai} vé.`,
    {...hopLe, chiTietHopLe: true, cause},
  );
}

export function chuanHoaLoiGiuCho(err) {
  if (!laLoiVuotGioiHan(err)) return err;
  if (err instanceof PurchaseLimitError) return err;
  return taoLoiVuotGioiHan(docChiTietGioiHan(err.details), err);
}

export const THONG_BAO_CAN_DANG_NHAP =
  'Bạn cần đăng nhập tài khoản người mua để giữ ghế. Hãy đăng nhập rồi quay lại sự kiện này.';

/**
 * Lỗi giữ chỗ do chưa đăng nhập: RPC báo 28000 (không có tài khoản) hoặc PostgREST trả 401/permission denied vì
 * khách ẩn danh không có quyền gọi hàm giữ chỗ. Không gồm lỗi thiếu xác minh OTP (cũng 42501 nhưng nói về OTP).
 */
/** Lỗi 42501 nói về OTP: đã đăng nhập nhưng chưa xác minh OTP trong 24 giờ (sự kiện bật OTP). */
export function laLoiThieuOtp(err) {
  if (!err || typeof err !== 'object') return false;
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  return String(err.code ?? '') === '42501' && message.includes('otp');
}

export function laLoiChuaDangNhap(err) {
  if (!err || typeof err !== 'object') return false;
  const code = String(err.code ?? '');
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  if (message.includes('otp')) return false;
  if (code === '28000' || Number(err.status) === 401) return true;
  if (code === '42501' && message.includes('permission denied')) return true;
  return message.includes('can dang nhap') || message.includes('cần đăng nhập');
}
