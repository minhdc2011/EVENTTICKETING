// Kho và mô hình thuần cho cấu hình mua vé mô phỏng (mock) của CAU_HINH_SU_KIEN.
// Không phụ thuộc Supabase hay runtimeConfig; localStorage chỉ dùng tùy chọn qua taoKhoMoPhong.

import {
  DEFAULT_SO_VE_TOI_DA,
  DEFAULT_YEU_CAU_OTP,
  LOAI_TAI_KHOAN_CAU_HINH,
  PurchaseConfigError,
  canManagePurchaseConfig,
  chuanHoaDongCauHinh,
  laCoOtpHopLe,
  laSoVeToiDaHopLe,
  validatePurchaseConfigInput,
} from './purchaseConfig.js';

export const NHAN_MO_PHONG = 'MO_PHONG';
export const KHOA_LUU_TRU_MO_PHONG = 'eventticketing.purchaseConfig.mock.v1';
export const DEMO_TO_CHUC_ID = 'mock-org-1';
export const DEMO_NGUOI_DUNG = Object.freeze({id: 'mock-user', loaiTaiKhoan: 'ORGANIZER'});

const hasOwn = (obj, key) =>
  obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

function isValidEventId(suKienId) {
  if (typeof suKienId === 'number') return Number.isInteger(suKienId) && suKienId > 0;
  if (typeof suKienId === 'string') return suKienId.trim() !== '';
  return false;
}

function normalizeConfigRow(row) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    // Dòng sai dạng: giữ marker hỏng để lúc đọc ném LOI_DOC, không được coi như chưa có cấu hình.
    return {
      SoVeToiDaMoiDon: null,
      YeuCauXacMinhOTP: null,
      ThoiGianGiuChoPhut: null,
      nhan: NHAN_MO_PHONG,
      hong: true,
    };
  }
  const max = row.SoVeToiDaMoiDon;
  const otp = row.YeuCauXacMinhOTP;
  const hold = row.ThoiGianGiuChoPhut;
  return {
    SoVeToiDaMoiDon: laSoVeToiDaHopLe(max) ? max : null,
    YeuCauXacMinhOTP: laCoOtpHopLe(otp) ? otp : null,
    ThoiGianGiuChoPhut: typeof hold === 'number' && Number.isFinite(hold) ? hold : null,
    nhan: NHAN_MO_PHONG,
  };
}

/**
 * Tạo state mô phỏng cấu hình mua vé. Hàm thuần, nhân bản sâu seed, không sửa đầu vào.
 */
export function createMockPurchaseConfigState(seed = {}) {
  const s = structuredClone(seed ?? {});
  const suKien = s.suKien && typeof s.suKien === 'object' && !Array.isArray(s.suKien) ? s.suKien : {};
  const thanhVien = Array.isArray(s.thanhVien) ? s.thanhVien : [];
  const rawCauHinh = s.cauHinh && typeof s.cauHinh === 'object' && !Array.isArray(s.cauHinh) ? s.cauHinh : {};
  const cauHinh = {};
  for (const [id, row] of Object.entries(rawCauHinh)) {
    cauHinh[id] = normalizeConfigRow(row);
  }
  return {
    nhan: NHAN_MO_PHONG,
    suKien,
    thanhVien,
    cauHinh,
  };
}

/**
 * Seed demo xác định cho chế độ mô phỏng, khớp các ID sự kiện mock trong eventService.
 */
export function khoiTaoDemoCauHinhMuaVe() {
  const suKien = {};
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 990001]) {
    suKien[id] = {ToChucID: DEMO_TO_CHUC_ID};
  }
  return createMockPurchaseConfigState({
    suKien,
    thanhVien: [
      {ToChucID: DEMO_TO_CHUC_ID, NguoiDungID: DEMO_NGUOI_DUNG.id, VaiTro: 'CHU_SO_HUU', LoaiTaiKhoan: 'ORGANIZER'},
      {ToChucID: DEMO_TO_CHUC_ID, NguoiDungID: 'mock-admin', VaiTro: 'QUAN_TRI', LoaiTaiKhoan: 'ORGANIZER'},
      {ToChucID: DEMO_TO_CHUC_ID, NguoiDungID: 'mock-editor', VaiTro: 'BIEN_TAP', LoaiTaiKhoan: 'ORGANIZER'},
      {ToChucID: 'mock-org-2', NguoiDungID: 'mock-other-owner', VaiTro: 'CHU_SO_HUU', LoaiTaiKhoan: 'ORGANIZER'},
    ],
    cauHinh: {
      1: {
        SoVeToiDaMoiDon: DEFAULT_SO_VE_TOI_DA,
        YeuCauXacMinhOTP: DEFAULT_YEU_CAU_OTP,
        ThoiGianGiuChoPhut: 5,
        nhan: NHAN_MO_PHONG,
      },
      2: {
        SoVeToiDaMoiDon: 2,
        YeuCauXacMinhOTP: true,
        ThoiGianGiuChoPhut: 5,
        nhan: NHAN_MO_PHONG,
      },
    },
  });
}

/**
 * Đọc cấu hình mua vé của một sự kiện từ state mô phỏng.
 */
export function docCauHinhMoPhong(state, suKienId) {
  const key = isValidEventId(suKienId) ? String(typeof suKienId === 'string' ? suKienId.trim() : suKienId) : null;
  const row = key && state?.cauHinh && hasOwn(state.cauHinh, key) ? state.cauHinh[key] : null;
  return chuanHoaDongCauHinh(row, suKienId, NHAN_MO_PHONG);
}

function kiemTraQuyenMoPhong(state, eventOrganizationId, nguoiDung) {
  if (nguoiDung === null || typeof nguoiDung !== 'object') return false;
  const userId = normalizeId(nguoiDung.id ?? nguoiDung.userId ?? nguoiDung.NguoiDungID);
  if (userId === null) return false;
  const userKind = nguoiDung.loaiTaiKhoan ?? nguoiDung.accountKind ?? nguoiDung.LoaiTaiKhoan;
  if (userKind !== undefined && userKind !== null && !LOAI_TAI_KHOAN_CAU_HINH.includes(userKind)) {
    return false;
  }
  const memberships = (Array.isArray(state?.thanhVien) ? state.thanhVien : []).filter(
    (m) => m && typeof m === 'object' && normalizeId(m.NguoiDungID ?? m.userId ?? m.id) === userId,
  );
  return canManagePurchaseConfig(memberships, eventOrganizationId);
}

/**
 * Lưu cấu hình mua vé trong state mô phỏng. Hàm thuần, không sửa state đầu vào.
 * Tái dùng validatePurchaseConfigInput và canManagePurchaseConfig; trả { state, result }.
 */
export function luuCauHinhMoPhong(state, suKienId, input, nguoiDung) {
  const kiemTra = validatePurchaseConfigInput(input);
  if (!kiemTra.ok) {
    throw new PurchaseConfigError('KHONG_HOP_LE', 'Cấu hình mua vé không hợp lệ.', {
      loiTheoTruong: kiemTra.errors,
    });
  }
  if (!isValidEventId(suKienId)) {
    throw new PurchaseConfigError('KHONG_HOP_LE', 'Mã sự kiện không hợp lệ.', {
      loiTheoTruong: {suKienId: 'Mã sự kiện không hợp lệ.'},
    });
  }

  const key = String(typeof suKienId === 'string' ? suKienId.trim() : suKienId);
  const sk = state?.suKien && hasOwn(state.suKien, key) ? state.suKien[key] : null;
  if (!sk) {
    throw new PurchaseConfigError('SU_KIEN_KHONG_TON_TAI', 'Sự kiện không tồn tại.');
  }
  if (!kiemTraQuyenMoPhong(state, sk.ToChucID, nguoiDung)) {
    throw new PurchaseConfigError(
      'KHONG_CO_QUYEN',
      'Bạn không có quyền lưu cấu hình mua vé của sự kiện này.',
    );
  }

  const existing = state?.cauHinh && hasOwn(state.cauHinh, key) ? state.cauHinh[key] : null;
  const existingHopLe =
    existing !== null &&
    laSoVeToiDaHopLe(existing.SoVeToiDaMoiDon) &&
    laCoOtpHopLe(existing.YeuCauXacMinhOTP);
  const holdMinutes =
    existing && typeof existing.ThoiGianGiuChoPhut === 'number' && Number.isFinite(existing.ThoiGianGiuChoPhut)
      ? existing.ThoiGianGiuChoPhut
      : null;

  const value = kiemTra.value;
  const daThayDoi = existing
    ? !existingHopLe ||
      existing.SoVeToiDaMoiDon !== value.soVeToiDaMoiDon ||
      existing.YeuCauXacMinhOTP !== value.yeuCauXacMinhOtp
    : DEFAULT_SO_VE_TOI_DA !== value.soVeToiDaMoiDon ||
      DEFAULT_YEU_CAU_OTP !== value.yeuCauXacMinhOtp;

  let nextState = state;
  if (!existing || daThayDoi) {
    nextState = createMockPurchaseConfigState(state);
    nextState.cauHinh[key] = {
      SoVeToiDaMoiDon: value.soVeToiDaMoiDon,
      YeuCauXacMinhOTP: value.yeuCauXacMinhOtp,
      ThoiGianGiuChoPhut: holdMinutes,
      nhan: NHAN_MO_PHONG,
    };
  }

  return {
    state: nextState,
    result: {
      suKienId,
      soVeToiDaMoiDon: value.soVeToiDaMoiDon,
      yeuCauXacMinhOtp: value.yeuCauXacMinhOtp,
      daThayDoi,
      nguon: NHAN_MO_PHONG,
      moPhong: true,
      nhan: NHAN_MO_PHONG,
    },
  };
}

/**
 * localStorage mặc định. Trả null chỉ khi storage thật sự không tồn tại (undefined/null).
 * Getter ném lỗi (vd SecurityError) là lỗi đọc: ném LOI_DOC, không được coi là "không có storage".
 */
function layKhoMacDinh() {
  let store;
  try {
    store = globalThis.localStorage;
  } catch (cause) {
    throw new PurchaseConfigError('LOI_DOC', 'Không truy cập được localStorage cho kho cấu hình mua vé mô phỏng.', {
      cause,
    });
  }
  return store === undefined || store === null ? null : store;
}

function isValidStoredState(parsed) {
  return (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    parsed.suKien !== null &&
    typeof parsed.suKien === 'object' &&
    !Array.isArray(parsed.suKien) &&
    Array.isArray(parsed.thanhVien) &&
    parsed.cauHinh !== null &&
    typeof parsed.cauHinh === 'object' &&
    !Array.isArray(parsed.cauHinh)
  );
}

/**
 * Tạo kho mô phỏng cài interface KhoCauHinhMoPhong; localStorage tùy chọn.
 * storage bỏ qua (undefined) = localStorage mặc định; getter localStorage ném lỗi => LOI_DOC, không seed.
 * storage = null, hoặc localStorage thật sự không tồn tại = bộ nhớ + seed demo.
 * Chỉ khởi tạo seed khi kho trống, không có storage hoặc sau datLai(). Lỗi đọc storage, JSON hỏng
 * hay state sai dạng ném PurchaseConfigError('LOI_DOC') (không bị biến thành "chưa có cấu hình").
 */
export function taoKhoMoPhong(storage = undefined, options = {}) {
  const khoa = typeof options?.khoa === 'string' && options.khoa ? options.khoa : KHOA_LUU_TRU_MO_PHONG;
  let customSeed = options?.seed;
  let boNhoTam = null;
  let uuTienBoNho = false;

  const taoStateBanDau = () =>
    customSeed !== undefined ? createMockPurchaseConfigState(customSeed) : khoiTaoDemoCauHinhMuaVe();

  const layStorage = () => (storage === undefined ? layKhoMacDinh() : storage);

  function docState() {
    if (uuTienBoNho && boNhoTam !== null) return boNhoTam;
    const store = layStorage();
    if (!store) {
      boNhoTam ??= taoStateBanDau();
      return boNhoTam;
    }
    let raw;
    try {
      raw = store.getItem(khoa);
    } catch (cause) {
      throw new PurchaseConfigError('LOI_DOC', 'Không đọc được kho cấu hình mua vé mô phỏng.', {cause});
    }
    if (raw === null || raw === undefined) {
      // Kho thật sự trống: khởi tạo seed.
      boNhoTam ??= taoStateBanDau();
      return boNhoTam;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new PurchaseConfigError('LOI_DOC', 'Dữ liệu cấu hình mua vé mô phỏng bị hỏng.', {cause});
    }
    if (!isValidStoredState(parsed)) {
      throw new PurchaseConfigError('LOI_DOC', 'Dữ liệu cấu hình mua vé mô phỏng sai dạng.');
    }
    boNhoTam = createMockPurchaseConfigState(parsed);
    return boNhoTam;
  }

  function ghiState(nextState) {
    boNhoTam = nextState;
    if (uuTienBoNho) return;
    let store;
    try {
      store = layStorage();
    } catch {
      // Phòng thủ: docState đã ném LOI_DOC trước đó; giữ state trong bộ nhớ.
      uuTienBoNho = true;
      return;
    }
    if (!store) return;
    try {
      store.setItem(khoa, JSON.stringify(nextState));
    } catch {
      uuTienBoNho = true;
    }
  }

  return {
    doc(suKienId) {
      return docCauHinhMoPhong(docState(), suKienId);
    },
    luu(suKienId, value, nguoiDung) {
      const {state: nextState, result} = luuCauHinhMoPhong(docState(), suKienId, value, nguoiDung);
      ghiState(nextState);
      return result;
    },
    datLai(seedMoi = undefined) {
      if (seedMoi !== undefined) customSeed = seedMoi;
      // Khởi tạo lại rõ ràng: seed là nguồn đúng, kể cả khi storage hỏng không xóa được.
      boNhoTam = taoStateBanDau();
      uuTienBoNho = false;
      let store;
      try {
        store = layStorage();
      } catch {
        // Reset rõ ràng: seed là nguồn đúng; không truy cập được storage thì giữ trong bộ nhớ.
        uuTienBoNho = true;
        return;
      }
      if (!store) return;
      let sach = false;
      try {
        if (typeof store.removeItem === 'function') {
          store.removeItem(khoa);
          const conLai = store.getItem(khoa);
          sach = conLai === null || conLai === undefined;
        }
      } catch {
        sach = false;
      }
      // Không dọn sạch được kho: giữ bộ nhớ làm nguồn đúng, không đọc lại dữ liệu hỏng.
      if (!sach) uuTienBoNho = true;
    },
    layTrangThai() {
      return createMockPurchaseConfigState(docState());
    },
  };
}
