/**
 * Dịch vụ OTP qua email cho luồng người mua (W5).
 *
 * - Nhánh thật: gọi signInWithOtp({ email, options: { shouldCreateUser: false } }) và
 *   verifyOtp({ email, token, type: 'email' }) qua requireSupabaseClient().
 *   Lỗi cấu hình, mạng hoặc Auth đều ném OtpServiceError, tuyệt đối không chuyển sang mock.
 * - Nhánh mock: chỉ kích hoạt khi runtimeConfig.useMockData === true; chỉ mã '123456' hợp lệ
 *   và kết quả được đánh dấu { nguon: 'MO_PHONG', moPhong: true }.
 * - Không lưu OTP vào storage, trạng thái bền vững hay log; không tự tạo bằng chứng xác minh.
 * - Bộ đếm 3 lần gửi lại/giờ và 5 lần sai/15 phút chỉ là thông tin hiển thị phía client.
 */
import type {SupabaseClient} from '@supabase/supabase-js';
import {runtimeConfig} from '../config/runtime';
import type {Database} from '../types/database.types';
import {requireSupabaseClient} from './supabaseClient';
import {
  CHO_GUI_LAI_GIAY,
  CUA_SO_GUI_LAI_GIAY,
  CUA_SO_SAI_GIAY,
  HIEU_LUC_GIAY,
  MA_MO_PHONG,
  NHAN_MO_PHONG,
  OtpServiceError,
  SO_LAN_GUI_LAI_TOI_DA,
  SO_LAN_SAI_TOI_DA,
  capNhatSauLoi,
  datLaiSauThanhCong,
  ghiNhanGui,
  ghiNhanSai,
  guiOtpTheoCauHinh,
  phanLoaiLoiAuth,
  taoTrangThaiOtp,
  thongBaoLoiOtp,
  tinhThoiGianOtp,
  xacMinhOtpTheoCauHinh,
} from '../domain/otpServiceCore.js';
import type {
  AuthGuiOtp,
  AuthXacMinhOtp,
  KetQuaGuiOtp,
  KetQuaXacMinhOtp,
  LoaiLoiOtp,
  ThoiGianOtp,
  TrangThaiOtp,
  TuyChonLoiOtp,
} from '../domain/otpServiceCore';

export {
  CHO_GUI_LAI_GIAY,
  CUA_SO_GUI_LAI_GIAY,
  CUA_SO_SAI_GIAY,
  HIEU_LUC_GIAY,
  MA_MO_PHONG,
  NHAN_MO_PHONG,
  OtpServiceError,
  SO_LAN_GUI_LAI_TOI_DA,
  SO_LAN_SAI_TOI_DA,
  capNhatSauLoi,
  datLaiSauThanhCong,
  ghiNhanGui,
  ghiNhanSai,
  phanLoaiLoiAuth,
  taoTrangThaiOtp,
  thongBaoLoiOtp,
  tinhThoiGianOtp,
};

export type {
  AuthGuiOtp,
  AuthXacMinhOtp,
  KetQuaGuiOtp,
  KetQuaXacMinhOtp,
  LoaiLoiOtp,
  ThoiGianOtp,
  TrangThaiOtp,
  TuyChonLoiOtp,
};

export type OtpAuthClient = AuthGuiOtp & AuthXacMinhOtp;

export interface OtpServiceOptions {
  client?: SupabaseClient<Database> | {auth: OtpAuthClient};
  trangThai?: TrangThaiOtp;
  now?: number;
}

/**
 * Chỉ cấu hình runtime quyết định nhánh mock; không có tùy chọn nào của caller được ghi đè.
 * Lỗi lấy client (thiếu cấu hình) được core đổi thành OtpServiceError CAU_HINH, không rơi sang mock.
 */
function cauHinhOtp(opts: OtpServiceOptions) {
  return {
    useMockData: runtimeConfig.useMockData,
    layAuth: () => (opts.client ?? requireSupabaseClient()).auth as OtpAuthClient,
  };
}

function taoTuyChon(opts: OtpServiceOptions): TuyChonLoiOtp | undefined {
  if (!opts.trangThai && opts.now === undefined) return undefined;
  return {
    ...(opts.trangThai ? {trangThai: opts.trangThai} : {}),
    nowMs: opts.now ?? Date.now(),
  };
}

export async function guiMaOtp(email: string, opts: OtpServiceOptions = {}): Promise<KetQuaGuiOtp> {
  return guiOtpTheoCauHinh(cauHinhOtp(opts), email, taoTuyChon(opts));
}

export async function xacMinhMaOtp(
  email: string,
  token: string,
  opts: OtpServiceOptions = {},
): Promise<KetQuaXacMinhOtp> {
  return xacMinhOtpTheoCauHinh(cauHinhOtp(opts), email, token, taoTuyChon(opts));
}
