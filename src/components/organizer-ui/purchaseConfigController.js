// Tầng điều phối thuần cho màn hình cấu hình mua vé (OTP + giới hạn vé) của Ban tổ chức (T6).
// Không import dịch vụ có phụ thuộc môi trường: `services` được tiêm (mặc định do component truyền
// docCauHinhMuaVe/luuCauHinhMuaVe của purchaseConfigService). Lõi validation/quyền lấy từ domain T1,
// cùng nguồn mà purchaseConfigService xuất lại.

import {
  DEFAULT_SO_VE_TOI_DA,
  DEFAULT_YEU_CAU_OTP,
  MAX_SO_VE_TOI_DA,
  MIN_SO_VE_TOI_DA,
  PurchaseConfigError,
  canManagePurchaseConfig,
  phanLoaiLoiRpc,
  validatePurchaseConfigInput,
} from '../../domain/purchaseConfig.js';
import {
  NHAN_MO_PHONG_UI,
  createDialogFocusScope,
  getFocusableElements,
  resolveDialogKeyDown,
  runGuarded,
} from './pricingPanelController.js';

export {
  DEFAULT_SO_VE_TOI_DA,
  DEFAULT_YEU_CAU_OTP,
  MAX_SO_VE_TOI_DA,
  MIN_SO_VE_TOI_DA,
  NHAN_MO_PHONG_UI,
  PurchaseConfigError,
  canManagePurchaseConfig,
  createDialogFocusScope,
  getFocusableElements,
  resolveDialogKeyDown,
  validatePurchaseConfigInput,
};

export const THONG_BAO_AP_DUNG_SAU =
  'Thay đổi chỉ áp dụng cho lần chọn vé tiếp theo của khán giả; các đơn đang giữ chỗ không bị ảnh hưởng.';

// ---------------------------------------------------------------------------
// Phiên: epoch + khóa gửi + kênh "mới nhất thắng" (cùng cơ chế với pricingPanelController)
// ---------------------------------------------------------------------------

export function createPurchaseConfigSession() {
  let epoch = 0;
  let busy = false;
  const channelSeq = new Map();
  return {
    get epoch() {
      return epoch;
    },
    get busy() {
      return busy;
    },
    /** Đổi tổ chức/sự kiện/đóng màn hình: vô hiệu mọi phản hồi đang bay và nhả khóa. */
    reset() {
      epoch += 1;
      busy = false;
      channelSeq.clear();
    },
    isCurrent(token) {
      return token === epoch;
    },
    _setBusy(value) {
      busy = value;
    },
    _nextSeq(channel) {
      const next = (channelSeq.get(channel) ?? 0) + 1;
      channelSeq.set(channel, next);
      return next;
    },
    _isLatest(channel, seq) {
      return channelSeq.get(channel) === seq;
    },
  };
}

// ---------------------------------------------------------------------------
// Quyền, cờ mô phỏng, giá trị biểu mẫu
// ---------------------------------------------------------------------------

export function hasPurchaseConfigAccess(activeOrg, event) {
  return Boolean(event) && canManagePurchaseConfig(activeOrg, event.organizationId);
}

export function isSimulatedPurchaseConfig({config, saveResult, event} = {}) {
  return (
    Boolean(config && (config.moPhong === true || config.nguon === 'MO_PHONG')) ||
    Boolean(saveResult && (saveResult.moPhong === true || saveResult.nguon === 'MO_PHONG')) ||
    Boolean(event && event.moPhong === true)
  );
}

/** Giá trị biểu mẫu: số vé là chuỗi cho input, OTP là boolean. Thiếu cấu hình -> mặc định 4/false. */
export function buildPurchaseConfigFormValues(config) {
  const so = config && Number.isInteger(config.soVeToiDaMoiDon) ? config.soVeToiDaMoiDon : DEFAULT_SO_VE_TOI_DA;
  const otp = config && typeof config.yeuCauXacMinhOtp === 'boolean' ? config.yeuCauXacMinhOtp : DEFAULT_YEU_CAU_OTP;
  return {soVeToiDaMoiDon: String(so), yeuCauXacMinhOtp: otp};
}

/** Kiểm tra biểu mẫu bằng validation T1. Trả {ok, value, errors, firstInvalidField}. */
export function validatePurchaseConfigForm(formValues) {
  return validatePurchaseConfigInput(formValues);
}

// ---------------------------------------------------------------------------
// Phân loại lỗi
// ---------------------------------------------------------------------------

const THONG_BAO_LOI = {
  KHONG_CO_QUYEN: 'Bạn không có quyền lưu cấu hình mua vé của sự kiện này.',
  CAN_DANG_NHAP: 'Cần đăng nhập để lưu cấu hình mua vé.',
  KHONG_HOP_LE: 'Cấu hình mua vé không hợp lệ. Hãy kiểm tra các trường bên dưới.',
  SU_KIEN_KHONG_TON_TAI: 'Sự kiện không tồn tại.',
  LOI_DOC: 'Không đọc được cấu hình mua vé. Hãy thử lại.',
  LOI_LUU: 'Không lưu được cấu hình mua vé. Dữ liệu bạn đang sửa vẫn được giữ lại.',
};

/**
 * Chuẩn hóa lỗi bất kỳ (PurchaseConfigError, lỗi RPC thô 42501/22023, lỗi mạng) thành
 * {code, message, fieldErrors, retryable}. `fallback` là mã dùng khi lỗi không nhận diện được.
 */
export function classifyPurchaseConfigError(error, fallback = 'LOI_LUU') {
  let known = null;
  if (error && typeof error === 'object' && typeof error.ma === 'string') {
    known = error;
  } else if (error && typeof error === 'object' && (error.code !== undefined || typeof error.message === 'string')) {
    const mapped = phanLoaiLoiRpc(error);
    known = mapped.ma === 'LOI_LUU' && fallback !== 'LOI_LUU' ? null : mapped;
  }
  const code = known ? known.ma : fallback;
  const fieldErrors =
    known && known.loiTheoTruong && typeof known.loiTheoTruong === 'object' ? {...known.loiTheoTruong} : {};
  const message = THONG_BAO_LOI[code] ?? THONG_BAO_LOI[fallback] ?? THONG_BAO_LOI.LOI_LUU;
  const retryable = code !== 'KHONG_CO_QUYEN' && code !== 'CAN_DANG_NHAP' && code !== 'SU_KIEN_KHONG_TON_TAI';
  return {code, message, fieldErrors, retryable};
}

// Task trả về {failed} thay vì ném để giữ nguyên PurchaseConfigError (runGuarded chỉ giữ message/code).
async function attempt(fn, fallback) {
  try {
    return {value: await fn()};
  } catch (error) {
    return {failed: classifyPurchaseConfigError(error, fallback)};
  }
}

// ---------------------------------------------------------------------------
// Thao tác
// ---------------------------------------------------------------------------

/**
 * Nạp cấu hình theo event.id; yêu cầu mới thay thế yêu cầu cũ (kênh 'load'), không dùng khóa gửi.
 * Trả ok | forbidden | error | stale.
 */
export async function loadPurchaseConfig(session, services, {activeOrg, event}) {
  if (!hasPurchaseConfigAccess(activeOrg, event)) return {status: 'forbidden'};
  const r = await runGuarded(session, () => attempt(() => services.docCauHinhMuaVe(event.id), 'LOI_DOC'), {
    exclusive: false,
    channel: 'load',
  });
  if (r.status !== 'ok') return r;
  if (r.value.failed) return {status: 'error', error: r.value.failed};
  const config = r.value.value;
  return {
    status: 'ok',
    config,
    formValues: buildPurchaseConfigFormValues(config),
    simulated: isSimulatedPurchaseConfig({config, event}),
  };
}

/**
 * Kiểm tra quyền + biểu mẫu rồi lưu. Sai quyền => forbidden, biểu mẫu sai => invalid;
 * cả hai KHÔNG gọi dịch vụ. Đang gửi => busy. Trả thêm error | stale | saved.
 * Chỉ trạng thái 'saved' mang giá trị mới đã lưu (`config`); các trạng thái khác không được đổi giá trị gốc.
 */
export async function savePurchaseConfig(session, services, {activeOrg, event, formValues}) {
  if (!hasPurchaseConfigAccess(activeOrg, event)) return {status: 'forbidden'};
  const check = validatePurchaseConfigForm(formValues);
  if (!check.ok) {
    return {status: 'invalid', errors: check.errors, firstInvalidField: check.firstInvalidField};
  }
  const r = await runGuarded(session, () => attempt(() => services.luuCauHinhMuaVe(event.id, check.value), 'LOI_LUU'));
  if (r.status !== 'ok') return r;
  if (r.value.failed) {
    return {status: 'error', error: r.value.failed, fieldErrors: r.value.failed.fieldErrors};
  }
  const result = r.value.value;
  const config = {
    soVeToiDaMoiDon: Number.isInteger(result?.soVeToiDaMoiDon) ? result.soVeToiDaMoiDon : check.value.soVeToiDaMoiDon,
    yeuCauXacMinhOtp:
      typeof result?.yeuCauXacMinhOtp === 'boolean' ? result.yeuCauXacMinhOtp : check.value.yeuCauXacMinhOtp,
  };
  const daThayDoi = result?.daThayDoi !== false;
  return {
    status: 'saved',
    result,
    config,
    formValues: buildPurchaseConfigFormValues(config),
    simulated: isSimulatedPurchaseConfig({saveResult: result, event}),
    message: daThayDoi
      ? `Đã lưu cấu hình mua vé. ${THONG_BAO_AP_DUNG_SAU}`
      : `Cấu hình không thay đổi so với giá trị đã lưu. ${THONG_BAO_AP_DUNG_SAU}`,
  };
}
