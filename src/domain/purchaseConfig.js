// Lõi thuần của cấu hình mua vé theo sự kiện (CAU_HINH_SU_KIEN).
// Mọi phụ thuộc (useMockData, layClient, khoMoPhong) được tiêm để test bằng node --test.

export const DEFAULT_SO_VE_TOI_DA = 4;
export const DEFAULT_YEU_CAU_OTP = false;
export const MIN_SO_VE_TOI_DA = 1;
export const MAX_SO_VE_TOI_DA = 20;
export const VAI_TRO_CAU_HINH = ['CHU_SO_HUU', 'QUAN_TRI'];
export const LOAI_TAI_KHOAN_CAU_HINH = ['ORGANIZER', 'ADMIN'];
export const RPC_LUU_CAU_HINH = 'luu_cau_hinh_mua_ve';

export class PurchaseConfigError extends Error {
  constructor(ma, message, options = {}) {
    super(message || ma);
    this.name = 'PurchaseConfigError';
    this.ma = ma;
    if (options.loiTheoTruong) this.loiTheoTruong = options.loiTheoTruong;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export function validatePurchaseConfigInput(input) {
  const source = input !== null && typeof input === 'object' ? input : {};
  const errors = {};
  const value = {};

  let n = source.soVeToiDaMoiDon;
  if (typeof n === 'string') {
    const t = n.trim();
    n = /^[+-]?\d+$/.test(t) ? Number(t) : NaN;
  }
  if (typeof n === 'number' && Number.isInteger(n) && n >= MIN_SO_VE_TOI_DA && n <= MAX_SO_VE_TOI_DA) {
    value.soVeToiDaMoiDon = n;
  } else {
    errors.soVeToiDaMoiDon = `Số vé tối đa mỗi đơn phải là số nguyên từ ${MIN_SO_VE_TOI_DA} đến ${MAX_SO_VE_TOI_DA}.`;
  }

  if (typeof source.yeuCauXacMinhOtp === 'boolean') {
    value.yeuCauXacMinhOtp = source.yeuCauXacMinhOtp;
  } else {
    errors.yeuCauXacMinhOtp = 'Yêu cầu xác minh OTP phải là đúng hoặc sai.';
  }

  const firstInvalidField = errors.soVeToiDaMoiDon
    ? 'soVeToiDaMoiDon'
    : errors.yeuCauXacMinhOtp
      ? 'yeuCauXacMinhOtp'
      : null;
  const ok = firstInvalidField === null;
  return {ok, value: ok ? value : null, errors, firstInvalidField};
}

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

function membershipAllows(membership, targetId) {
  if (membership === null || typeof membership !== 'object') return false;
  const orgId = normalizeId(membership.organizationId ?? membership.ToChucID);
  if (orgId === null || orgId !== targetId) return false;
  const role = membership.role ?? membership.VaiTro;
  if (!VAI_TRO_CAU_HINH.includes(role)) return false;
  const kind = membership.accountKind ?? membership.LoaiTaiKhoan;
  if (kind !== undefined && kind !== null && !LOAI_TAI_KHOAN_CAU_HINH.includes(kind)) return false;
  return true;
}

export function canManagePurchaseConfig(memberships, eventOrganizationId) {
  const targetId = normalizeId(eventOrganizationId);
  if (targetId === null) return false;
  const list = Array.isArray(memberships) ? memberships : [memberships];
  return list.some((m) => membershipAllows(m, targetId));
}

export function laSoVeToiDaHopLe(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= MIN_SO_VE_TOI_DA && n <= MAX_SO_VE_TOI_DA;
}

export function laCoOtpHopLe(v) {
  return typeof v === 'boolean';
}

export function chuanHoaDongCauHinh(row, suKienId, nguon) {
  const moPhong = nguon === 'MO_PHONG';
  if (row === null || row === undefined) {
    return {
      suKienId,
      soVeToiDaMoiDon: DEFAULT_SO_VE_TOI_DA,
      yeuCauXacMinhOtp: DEFAULT_YEU_CAU_OTP,
      thoiGianGiuChoPhut: null,
      trangThai: 'CHUA_CAU_HINH',
      nguon,
      moPhong,
    };
  }
  const so = row.SoVeToiDaMoiDon;
  const otp = row.YeuCauXacMinhOTP;
  const giu = row.ThoiGianGiuChoPhut;
  if (!laSoVeToiDaHopLe(so) || !laCoOtpHopLe(otp)) {
    throw new PurchaseConfigError('LOI_DOC', 'Cấu hình mua vé đã lưu không hợp lệ.', {
      cause: {SoVeToiDaMoiDon: so, YeuCauXacMinhOTP: otp},
    });
  }
  return {
    suKienId,
    soVeToiDaMoiDon: so,
    yeuCauXacMinhOtp: otp,
    thoiGianGiuChoPhut: typeof giu === 'number' && Number.isFinite(giu) ? giu : null,
    trangThai: 'DA_CAU_HINH',
    nguon,
    moPhong,
  };
}

export function taoThamSoRpc(suKienId, value) {
  return {
    p_su_kien_id: suKienId,
    p_so_ve_toi_da: value.soVeToiDaMoiDon,
    p_yeu_cau_otp: value.yeuCauXacMinhOtp,
  };
}

const TEN_PARAM_SANG_TRUONG = {
  p_so_ve_toi_da: 'soVeToiDaMoiDon',
  p_yeu_cau_otp: 'yeuCauXacMinhOtp',
  p_su_kien_id: 'suKienId',
  soVeToiDaMoiDon: 'soVeToiDaMoiDon',
  yeuCauXacMinhOtp: 'yeuCauXacMinhOtp',
};

export function phanLoaiLoiRpc(error) {
  const code = error?.code;
  const message = typeof error?.message === 'string' ? error.message : '';
  if (code === '42501' || message.includes('CAU_HINH_MUA_VE_CAN_DANG_NHAP') || message.includes('CAU_HINH_MUA_VE_KHONG_CO_QUYEN')) {
    const canDangNhap = message.includes('CAU_HINH_MUA_VE_CAN_DANG_NHAP');
    return new PurchaseConfigError(
      canDangNhap ? 'CAN_DANG_NHAP' : 'KHONG_CO_QUYEN',
      canDangNhap ? 'Cần đăng nhập để lưu cấu hình mua vé.' : 'Bạn không có quyền lưu cấu hình mua vé của sự kiện này.',
      {cause: error},
    );
  }
  if (code === '22023' || message.includes('CAU_HINH_MUA_VE_KHONG_HOP_LE')) {
    const m = /CAU_HINH_MUA_VE_KHONG_HOP_LE\s*:\s*([A-Za-z0-9_]+)/.exec(message);
    const truong = m ? TEN_PARAM_SANG_TRUONG[m[1]] : undefined;
    return new PurchaseConfigError('KHONG_HOP_LE', 'Cấu hình mua vé không hợp lệ.', {
      cause: error,
      loiTheoTruong: truong ? {[truong]: 'Giá trị không hợp lệ.'} : undefined,
    });
  }
  if (code === 'P0002' || message.includes('SU_KIEN_KHONG_TON_TAI')) {
    return new PurchaseConfigError('SU_KIEN_KHONG_TON_TAI', 'Sự kiện không tồn tại.', {cause: error});
  }
  return new PurchaseConfigError('LOI_LUU', 'Không lưu được cấu hình mua vé.', {cause: error});
}

export async function docCauHinhTheoCauHinh({useMockData, layClient, khoMoPhong}, suKienId) {
  if (useMockData) {
    return khoMoPhong.doc(suKienId);
  }
  let data;
  try {
    const client = await layClient();
    const res = await client
      .from('CAU_HINH_SU_KIEN')
      .select('SoVeToiDaMoiDon, YeuCauXacMinhOTP, ThoiGianGiuChoPhut')
      .eq('SuKienID', suKienId)
      .maybeSingle();
    if (res?.error) throw res.error;
    data = res?.data ?? null;
  } catch (cause) {
    throw new PurchaseConfigError('LOI_DOC', 'Không đọc được cấu hình mua vé.', {cause});
  }
  return chuanHoaDongCauHinh(data, suKienId, 'SUPABASE');
}

export async function luuCauHinhTheoCauHinh({useMockData, layClient, khoMoPhong, nguoiDung}, suKienId, input) {
  const kiemTra = validatePurchaseConfigInput(input);
  if (!kiemTra.ok) {
    throw new PurchaseConfigError('KHONG_HOP_LE', 'Cấu hình mua vé không hợp lệ.', {loiTheoTruong: kiemTra.errors});
  }
  if (useMockData) {
    return khoMoPhong.luu(suKienId, kiemTra.value, nguoiDung);
  }
  let client;
  try {
    client = await layClient();
  } catch (cause) {
    throw new PurchaseConfigError('LOI_LUU', 'Không kết nối được dịch vụ lưu cấu hình.', {cause});
  }
  let res;
  try {
    res = await client.rpc(RPC_LUU_CAU_HINH, taoThamSoRpc(suKienId, kiemTra.value));
  } catch (cause) {
    throw new PurchaseConfigError('LOI_LUU', 'Không lưu được cấu hình mua vé.', {cause});
  }
  if (res?.error) throw phanLoaiLoiRpc(res.error);
  if (res?.data === null || typeof res?.data !== 'object') {
    throw new PurchaseConfigError('LOI_LUU', 'Phản hồi lưu cấu hình không hợp lệ.');
  }
  return {...res.data, nguon: 'SUPABASE', moPhong: false};
}
