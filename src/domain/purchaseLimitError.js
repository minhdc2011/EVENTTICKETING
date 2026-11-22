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
