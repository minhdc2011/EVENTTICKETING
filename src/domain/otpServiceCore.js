// Lõi OTP thuần: không import Supabase hay runtimeConfig, mọi hàm nhận thời gian (ms) làm đầu vào.
// Trạng thái phía client chỉ gồm email và các mốc thời gian, tuyệt đối không chứa mã OTP.

/** Thời gian hiệu lực của mã OTP (giây). Tại đúng mốc này mã được coi là hết hiệu lực. */
export const HIEU_LUC_GIAY = 300;

/** Thời gian chờ giữa hai lần gửi (giây). Tại đúng mốc này được phép gửi lại. */
export const CHO_GUI_LAI_GIAY = 60;

/**
 * Cửa sổ đếm số lần gửi lại (giây).
 * LƯU Ý: bộ đếm gửi lại 3 lần/giờ chỉ là thông tin hiển thị phía client trên thiết bị này.
 * Đây KHÔNG phải giới hạn theo tài khoản trên nhiều thiết bị; máy chủ không hủy mã
 * hay khóa tài khoản theo bộ đếm này.
 */
export const CUA_SO_GUI_LAI_GIAY = 3600;

/**
 * Số lần gửi lại tối đa hiển thị trong một cửa sổ một giờ.
 * Chỉ là thông tin phía client, không bảo đảm giới hạn theo tài khoản trên nhiều thiết bị,
 * không đồng nghĩa với việc máy chủ hủy mã hay khóa tài khoản.
 */
export const SO_LAN_GUI_LAI_TOI_DA = 3;

/**
 * Cửa sổ đếm số lần nhập sai (giây).
 * LƯU Ý: bộ đếm 5 lần sai/15 phút chỉ là thông tin hiển thị phía client trên thiết bị này,
 * không phải giới hạn theo tài khoản trên nhiều thiết bị; máy chủ không hủy mã hay khóa
 * tài khoản theo bộ đếm này.
 */
export const CUA_SO_SAI_GIAY = 900;

/**
 * Số lần nhập sai tối đa hiển thị trong cửa sổ 15 phút.
 * Chỉ là thông tin phía client, không bảo đảm giới hạn theo tài khoản trên nhiều thiết bị,
 * máy chủ không hủy mã hay khóa tài khoản theo bộ đếm này.
 */
export const SO_LAN_SAI_TOI_DA = 5;

/** Mã chỉ được chấp nhận ở nhánh mô phỏng (runtimeConfig.useMockData). */
export const MA_MO_PHONG = '123456';

/** Nhãn nguồn kết quả của nhánh mô phỏng. */
export const NHAN_MO_PHONG = 'MO_PHONG';

const NHAN_THAT = 'THAT';

/** Lỗi dịch vụ OTP; message là câu tiếng Việt, không bao giờ chứa mã OTP hay message thô. */
export class OtpServiceError extends Error {
  /**
   * @param {string} message
   * @param {string} loai
   * @param {{soLanSaiConLai?: number | null, soLanGuiLaiConLai?: number | null}} [chiTiet]
   */
  constructor(message, loai, chiTiet = {}) {
    super(message);
    this.name = 'OtpServiceError';
    this.loai = loai;
    this.soLanSaiConLai = chiTiet.soLanSaiConLai ?? null;
    this.soLanGuiLaiConLai = chiTiet.soLanGuiLaiConLai ?? null;
  }
}

const trongCuaSo = (mocs, nowMs, cuaSoGiay) =>
  mocs.filter((t) => nowMs - t < cuaSoGiay * 1000);

/** @param {string} email */
export function taoTrangThaiOtp(email) {
  return { email, guiLuc: null, lichSuGuiLai: [], lichSuSai: [] };
}

/**
 * Ghi nhận một lần gửi. Chỉ lần gửi lại mới được tính vào bộ đếm gửi lại.
 * @param {{email: string, guiLuc: number | null, lichSuGuiLai: number[], lichSuSai: number[]}} st
 * @param {number} nowMs
 * @param {{laGuiLai?: boolean}} [tuyChon]
 */
export function ghiNhanGui(st, nowMs, tuyChon = {}) {
  const lichSuGuiLai = tuyChon.laGuiLai
    ? [...trongCuaSo(st.lichSuGuiLai, nowMs, CUA_SO_GUI_LAI_GIAY), nowMs]
    : [...st.lichSuGuiLai];
  return { ...st, guiLuc: nowMs, lichSuGuiLai, lichSuSai: [...st.lichSuSai] };
}

/** Ghi nhận một lần nhập sai (chỉ gọi khi loại lỗi là SAI_MA). */
export function ghiNhanSai(st, nowMs) {
  return {
    ...st,
    lichSuGuiLai: [...st.lichSuGuiLai],
    lichSuSai: [...trongCuaSo(st.lichSuSai, nowMs, CUA_SO_SAI_GIAY), nowMs],
  };
}

/** Sau khi xác minh thành công: xóa toàn bộ bộ đếm và mốc gửi. */
export function datLaiSauThanhCong(st) {
  return taoTrangThaiOtp(st.email);
}

/** Tính dữ liệu hiển thị từ trạng thái và thời điểm hiện tại. Mọi số đếm không âm. */
export function tinhThoiGianOtp(st, nowMs) {
  const daGui = st.guiLuc !== null && st.guiLuc !== undefined;
  const troiQua = daGui ? nowMs - st.guiLuc : 0;
  const conHieuLuc = daGui && troiQua < HIEU_LUC_GIAY * 1000;
  const giayConHieuLuc = daGui ? Math.max(0, Math.ceil((HIEU_LUC_GIAY * 1000 - troiQua) / 1000)) : 0;
  const giayChoGuiLai = daGui ? Math.max(0, Math.ceil((CHO_GUI_LAI_GIAY * 1000 - troiQua) / 1000)) : 0;

  const guiLaiTrongGio = trongCuaSo(st.lichSuGuiLai, nowMs, CUA_SO_GUI_LAI_GIAY).sort((a, b) => a - b);
  const soLanGuiLaiConLai = Math.max(0, SO_LAN_GUI_LAI_TOI_DA - guiLaiTrongGio.length);
  const hetLuotGuiLai = soLanGuiLaiConLai === 0;

  const mocCho = giayChoGuiLai > 0 ? st.guiLuc + CHO_GUI_LAI_GIAY * 1000 : null;
  // Lượt mới chỉ mở khi số mốc trong cửa sổ giảm xuống dưới 3, tức khi mốc thứ N-3 (đã sắp tăng dần) ra khỏi cửa sổ.
  const mocLuot = hetLuotGuiLai
    ? guiLaiTrongGio[guiLaiTrongGio.length - SO_LAN_GUI_LAI_TOI_DA] + CUA_SO_GUI_LAI_GIAY * 1000
    : null;
  const mocs = [mocCho, mocLuot].filter((m) => m !== null);
  const mocGuiLaiTiepTheo = mocs.length ? Math.max(...mocs) : null;

  const saiTrongCuaSo = trongCuaSo(st.lichSuSai, nowMs, CUA_SO_SAI_GIAY).sort((a, b) => a - b);
  const soLanSaiConLai = Math.max(0, SO_LAN_SAI_TOI_DA - saiTrongCuaSo.length);
  const biTamKhoaNhap = soLanSaiConLai === 0;
  const mocMoKhoaNhap = biTamKhoaNhap
    ? saiTrongCuaSo[saiTrongCuaSo.length - SO_LAN_SAI_TOI_DA] + CUA_SO_SAI_GIAY * 1000
    : null;

  return {
    conHieuLuc,
    giayConHieuLuc,
    coTheGuiLai: giayChoGuiLai === 0 && !hetLuotGuiLai,
    giayChoGuiLai,
    soLanGuiLaiConLai,
    mocGuiLaiTiepTheo,
    soLanSaiConLai,
    biTamKhoaNhap,
    mocMoKhoaNhap,
    gioiHanHienThi: { sai: SO_LAN_SAI_TOI_DA, phut: CUA_SO_SAI_GIAY / 60 },
    laThongTinPhiaClient: true,
  };
}

const MA_RATE_LIMIT = ['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'];

/**
 * Phân loại lỗi Auth. Chỉ 'SAI_MA' được phép làm tăng bộ đếm nhập sai.
 * Supabase trả cùng mã otp_expired cho cả mã sai lẫn mã hết hạn, nên khi đồng hồ client
 * (thoiGian) cho biết OTP còn hạn hoặc không có thông tin, coi là SAI_MA.
 * @param {unknown} err
 * @param {{conHieuLuc: boolean} | null} [thoiGian]
 */
export function phanLoaiLoiAuth(err, thoiGian = null) {
  const e = /** @type {any} */ (err) ?? {};
  const message = typeof e.message === 'string' ? e.message : '';
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' ? e.status : null;

  if (/VITE_SUPABASE/i.test(message)) return 'CAU_HINH';
  if (status === 429 || MA_RATE_LIMIT.includes(code)) return 'RATE_LIMIT';
  if (
    e instanceof TypeError ||
    e.name === 'AuthRetryableFetchError' ||
    status === 0 ||
    /fetch failed|failed to fetch|networkerror|network request failed/i.test(message)
  ) {
    return 'MANG';
  }
  if (code === 'otp_expired' || /expired or is invalid|token has expired/i.test(message)) {
    return thoiGian && thoiGian.conHieuLuc === false ? 'HET_HAN' : 'SAI_MA';
  }
  if (code === 'validation_failed') return 'SAI_MA';
  return 'KHONG_XAC_DINH';
}

/**
 * Câu thông báo tiếng Việt. Không nhúng mã OTP hay message thô của lỗi.
 * Số lần còn lại (nếu có thoiGian) luôn không âm và chỉ là thông tin phía client.
 * @param {string} loai
 * @param {ReturnType<typeof tinhThoiGianOtp> | null} [thoiGian]
 */
export function thongBaoLoiOtp(loai, thoiGian = null) {
  switch (loai) {
    case 'SAI_MA': {
      if (!thoiGian) return 'Mã OTP không đúng. Vui lòng kiểm tra lại mã trong email.';
      const n = Math.max(0, thoiGian.soLanSaiConLai);
      return n > 0
        ? `Mã OTP không đúng. Bạn còn ${n} lần nhập trong ${thoiGian.gioiHanHienThi.phut} phút (theo bộ đếm trên thiết bị này).`
        : `Mã OTP không đúng. Bạn đã nhập sai ${thoiGian.gioiHanHienThi.sai} lần trong ${thoiGian.gioiHanHienThi.phut} phút (theo bộ đếm trên thiết bị này), còn 0 lần nhập. Vui lòng chờ rồi thử lại hoặc gửi lại mã.`;
    }
    case 'HET_HAN':
      return 'Mã OTP đã hết hiệu lực (sau 5 phút). Vui lòng gửi lại mã mới.';
    case 'RATE_LIMIT': {
      if (!thoiGian) return 'Bạn thao tác quá nhanh. Vui lòng chờ một lúc rồi thử lại.';
      const n = Math.max(0, thoiGian.soLanGuiLaiConLai);
      return `Bạn thao tác quá nhanh. Vui lòng chờ một lúc rồi thử lại (còn ${n} lần gửi lại theo bộ đếm trên thiết bị này).`;
    }
    case 'MANG':
      return 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại; lần này không tính là nhập sai.';
    case 'CAU_HINH':
      return 'Hệ thống xác thực chưa được cấu hình. Vui lòng liên hệ quản trị viên.';
    default:
      return 'Không thể xử lý yêu cầu OTP. Vui lòng thử lại sau.';
  }
}

// Tạo lỗi từ lỗi Auth; không dùng err.message và không giữ tham chiếu tới lỗi gốc.
function taoLoi(err, tuyChon, laXacMinh) {
  if (err instanceof OtpServiceError) return err;
  const trangThai = tuyChon?.trangThai ?? null;
  const nowMs = tuyChon?.nowMs;
  let thoiGian = trangThai && typeof nowMs === 'number' ? tinhThoiGianOtp(trangThai, nowMs) : null;
  const loai = phanLoaiLoiAuth(err, thoiGian);
  if (loai === 'SAI_MA' && laXacMinh && trangThai && typeof nowMs === 'number') {
    // Hiển thị số lần còn lại sau khi tính lần sai này; việc ghi nhận do bên gọi thực hiện.
    thoiGian = tinhThoiGianOtp(ghiNhanSai(trangThai, nowMs), nowMs);
  }
  return new OtpServiceError(thongBaoLoiOtp(loai, thoiGian), loai, {
    soLanSaiConLai: thoiGian ? thoiGian.soLanSaiConLai : null,
    soLanGuiLaiConLai: thoiGian ? thoiGian.soLanGuiLaiConLai : null,
  });
}

/**
 * Cập nhật trạng thái sau lỗi: chỉ SAI_MA mới tăng bộ đếm nhập sai.
 * @param {{email: string, guiLuc: number | null, lichSuGuiLai: number[], lichSuSai: number[]}} st
 * @param {unknown} err
 * @param {number} nowMs
 */
export function capNhatSauLoi(st, err, nowMs) {
  return err instanceof OtpServiceError && err.loai === 'SAI_MA' ? ghiNhanSai(st, nowMs) : st;
}

/**
 * Gửi OTP qua Auth thật. Không bao giờ chuyển sang mock khi lỗi.
 * @param {{signInWithOtp: Function}} auth
 * @param {string} email
 * @param {{trangThai?: any, nowMs?: number}} [tuyChon]
 */
export async function guiOtpLogic(auth, email, tuyChon) {
  let ketQua;
  try {
    ketQua = await auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  } catch (err) {
    throw taoLoi(err, tuyChon, false);
  }
  if (ketQua && ketQua.error) throw taoLoi(ketQua.error, tuyChon, false);
  return { nguon: NHAN_THAT };
}

/**
 * Xác minh OTP qua Auth thật. Mã chỉ đi qua tham số này, không lưu, không log, không vào lỗi.
 * @param {{verifyOtp: Function}} auth
 * @param {string} email
 * @param {string} token
 * @param {{trangThai?: any, nowMs?: number}} [tuyChon]
 */
export async function xacMinhOtpLogic(auth, email, token, tuyChon) {
  let ketQua;
  try {
    ketQua = await auth.verifyOtp({ email, token, type: 'email' });
  } catch (err) {
    throw taoLoi(err, tuyChon, true);
  }
  if (ketQua && ketQua.error) throw taoLoi(ketQua.error, tuyChon, true);
  const user = ketQua?.data?.user;
  return { nguon: NHAN_THAT, userId: user?.id, email: user?.email };
}

// Lấy Auth chỉ khi không dùng mock; lỗi (thiếu cấu hình...) thành OtpServiceError, không rơi sang mock.
function layAuthHoacLoi(layAuth, tuyChon, laXacMinh) {
  try {
    return layAuth();
  } catch (err) {
    throw taoLoi(err, tuyChon, laXacMinh);
  }
}

/**
 * Chọn nhánh gửi OTP. Mock chỉ khi cấu hình.useMockData === true; khi đó layAuth không được gọi.
 * @param {{useMockData: boolean, layAuth: () => {signInWithOtp: Function}}} cauHinh
 * @param {string} email
 * @param {{trangThai?: any, nowMs?: number}} [tuyChon]
 */
export async function guiOtpTheoCauHinh(cauHinh, email, tuyChon) {
  const emailSach = email.trim().toLowerCase();
  if (cauHinh.useMockData === true) return guiOtpMock();
  const auth = layAuthHoacLoi(cauHinh.layAuth, tuyChon, false);
  return guiOtpLogic(auth, emailSach, tuyChon);
}

/**
 * Chọn nhánh xác minh OTP. Mã 123456 chỉ có đặc quyền khi cấu hình.useMockData === true.
 * @param {{useMockData: boolean, layAuth: () => {verifyOtp: Function}}} cauHinh
 * @param {string} email
 * @param {string} token
 * @param {{trangThai?: any, nowMs?: number}} [tuyChon]
 */
export async function xacMinhOtpTheoCauHinh(cauHinh, email, token, tuyChon) {
  const emailSach = email.trim().toLowerCase();
  if (cauHinh.useMockData === true) return xacMinhOtpMock(token, tuyChon);
  const auth = layAuthHoacLoi(cauHinh.layAuth, tuyChon, true);
  return xacMinhOtpLogic(auth, emailSach, token, tuyChon);
}

/** Gửi OTP mô phỏng: không gọi mạng. Chỉ dùng khi runtimeConfig.useMockData. */
export async function guiOtpMock() {
  return { nguon: NHAN_MO_PHONG, moPhong: true };
}

/**
 * Xác minh mô phỏng: chỉ '123456' hợp lệ. Chỉ dùng khi runtimeConfig.useMockData.
 * @param {string} token
 * @param {{trangThai?: any, nowMs?: number}} [tuyChon]
 */
export async function xacMinhOtpMock(token, tuyChon) {
  if (token === MA_MO_PHONG) return { nguon: NHAN_MO_PHONG, moPhong: true };
  throw taoLoi({ code: 'validation_failed' }, tuyChon, true);
}
