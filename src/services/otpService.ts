/**
 * Dịch vụ OTP qua email cho luồng người mua (W5) — lớp mỏng nối cấu hình runtime vào lõi thuần
 * src/domain/otpServiceCore.js (toàn bộ logic có test nằm ở đó).
 *
 * - Nhánh thật: signInWithOtp / verifyOtp qua requireSupabaseClient(); sau verifyOtp phải gọi lại
 *   RPC da_xac_minh_otp() và đối chiếu getSession().user.id. Lỗi cấu hình, mạng hoặc Auth đều ném
 *   OtpServiceError, tuyệt đối không chuyển sang mock.
 * - Nhánh mock: chỉ khi runtimeConfig.useMockData === true; mã '123456', bằng chứng nằm trong bộ nhớ
 *   (24 giờ) và có nguồn 'MO_PHONG'; không bao giờ được coi là bằng chứng thật. Mỗi lần gửi mock được
 *   gắn với email, tài khoản và thế hệ phiên (biên nhận trong bộ nhớ, không chứa mã); đăng xuất/đổi tài
 *   khoản (xoaBangChungMock) thu hồi biên nhận, xác minh bằng trạng thái gửi cũ → CHUA_GUI.
 * - Không lưu OTP vào storage, URL, log hay thông báo lỗi.
 * - Giới hạn gửi lại/nhập sai (CLIENT_*) chỉ là phía client; RATE_LIMIT là cưỡng chế của Auth.
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
  chuanHoaLoaiLoiOtp,
  dangKyThuHoiBangChungMock,
  datLaiSauThanhCong,
  ghiNhanGui,
  ghiNhanSai,
  guiMaOtpTheoCauHinh,
  HIEU_LUC_XAC_MINH_GIAY,
  KIEM_TRA_LAI_THAT_MS,
  LOAI_LOI_OTP,
  taoDinhDanhMockNguoiMua,
  bangChungMockConHieuLuc,
  kiemTraDaXacMinhTheoCauHinh,
  kiemTraTruocKhiGui,
  kiemTraTruocKhiXacMinh,
  khoTrangThaiOtpPhien,
  layTheHeBangChungMock,
  phanLoaiLoiAuth,
  taoBangChungMock,
  taoKhoTrangThaiOtpPhien,
  taoTrangThaiOtp,
  thongBaoLoiOtp,
  tinhThoiGianOtp,
  xacMinhMaOtpTheoCauHinh,
  xoaBangChungMock,
} from '../domain/otpServiceCore.js';
import type {
  AuthGuiOtp,
  AuthXacMinhOtp,
  BangChungMock,
  BienNhanGuiMock,
  ChiTietKhoOtp,
  KhoTrangThaiOtpPhien,
  TuyChonThucHienGui,
  TuyChonThucHienXacMinh,
  KetQuaGuiMaOtp,
  KetQuaGuiOtp,
  KetQuaKiemTraDaXacMinh,
  KetQuaXacMinhMaOtp,
  KetQuaXacMinhOtp,
  LoaiLoiOtp,
  RpcSessionClient,
  ThoiGianOtp,
  TrangThaiOtp,
  TuyChonLoiOtp,
} from '../domain/otpServiceCore';
import {TRANG_THAI_CONG, taoBoDieuPhoiCongOtp} from '../domain/otpGate.js';
import type {
  BoDieuPhoiCongOtp,
  LoiCongOtp,
  StatusCongOtp,
  TrangThaiCongOtp,
} from '../domain/otpGate';

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
  TRANG_THAI_CONG,
  capNhatSauLoi,
  chuanHoaLoaiLoiOtp,
  dangKyThuHoiBangChungMock,
  datLaiSauThanhCong,
  ghiNhanGui,
  ghiNhanSai,
  HIEU_LUC_XAC_MINH_GIAY,
  KIEM_TRA_LAI_THAT_MS,
  LOAI_LOI_OTP,
  taoDinhDanhMockNguoiMua,
  bangChungMockConHieuLuc,
  kiemTraTruocKhiGui,
  kiemTraTruocKhiXacMinh,
  khoTrangThaiOtpPhien,
  layTheHeBangChungMock,
  phanLoaiLoiAuth,
  taoBangChungMock,
  taoKhoTrangThaiOtpPhien,
  taoTrangThaiOtp,
  thongBaoLoiOtp,
  tinhThoiGianOtp,
  xoaBangChungMock,
};

export type {
  ChiTietKhoOtp,
  KhoTrangThaiOtpPhien,
  TuyChonThucHienGui,
  TuyChonThucHienXacMinh,
  BienNhanGuiMock,
  AuthGuiOtp,
  AuthXacMinhOtp,
  BangChungMock,
  BoDieuPhoiCongOtp,
  KetQuaGuiMaOtp,
  KetQuaGuiOtp,
  KetQuaXacMinhMaOtp,
  KetQuaXacMinhOtp,
  LoaiLoiOtp,
  LoiCongOtp,
  StatusCongOtp,
  ThoiGianOtp,
  TrangThaiCongOtp,
  TrangThaiOtp,
  TuyChonLoiOtp,
};

export type OtpAuthClient = AuthGuiOtp & AuthXacMinhOtp;
type SessionClient = {auth: {getSession: () => Promise<any>}};
type RpcClient = {rpc: (fn: any, ...args: any[]) => PromiseLike<any>};

export interface OtpServiceOptions {
  client?: SupabaseClient<Database> | {auth: OtpAuthClient};
  trangThai?: TrangThaiOtp;
  now?: number;
  /** Tài khoản gắn với lần gửi mock (bắt buộc cho guiMaOtp ở nhánh mock; nhánh thật bỏ qua). */
  userId?: string;
}

/**
 * Chỉ cấu hình runtime quyết định nhánh mock; không có tùy chọn nào của caller được ghi đè.
 * Lỗi lấy client (thiếu cấu hình) được core đổi thành OtpServiceError CAU_HINH, không rơi sang mock.
 */
function cauHinhOtp(opts: {client?: unknown}) {
  const layClient = () => (opts.client ?? requireSupabaseClient()) as unknown as RpcSessionClient;
  return {
    useMockData: runtimeConfig.useMockData,
    layAuth: () => (layClient() as unknown as {auth: OtpAuthClient}).auth,
    layClient,
  };
}

function taoTuyChon(opts: OtpServiceOptions): TuyChonLoiOtp & {userId?: string} {
  return {
    ...(opts.trangThai ? {trangThai: opts.trangThai} : {}),
    ...(opts.userId ? {userId: opts.userId} : {}),
    // Không chụp Date.now() trước await: khi không có opts.now, lõi đo mốc hoàn tất bằng layNow.
    ...(typeof opts.now === 'number' ? {nowMs: opts.now} : {layNow: () => Date.now()}),
  };
}

/**
 * Gửi mã. Kiểm tra giới hạn client (CLIENT_CHO_GUI_LAI / CLIENT_HET_LUOT_GUI_LAI) trước khi gọi Auth;
 * chỉ ghi nhận lần gửi sau khi gửi thành công.
 */
export function guiMaOtp(email: string, opts: OtpServiceOptions = {}): Promise<KetQuaGuiMaOtp> {
  return guiMaOtpTheoCauHinh(cauHinhOtp(opts), email, taoTuyChon(opts));
}

/**
 * Xác minh mã cho tài khoản expectedUserId (khóa nhập client được kiểm tra trước).
 * Thật: sau verifyOtp gọi lại da_xac_minh_otp() và đối chiếu phiên hiện tại với expectedUserId.
 */
export function xacMinhMaOtp(
  email: string,
  token: string,
  expectedUserId: string,
  opts: OtpServiceOptions = {},
): Promise<KetQuaXacMinhMaOtp> {
  return xacMinhMaOtpTheoCauHinh(cauHinhOtp(opts), email, token, expectedUserId, taoTuyChon(opts));
}

/**
 * Kiểm tra đã xác minh OTP. Mô phỏng: kho bộ nhớ (24 giờ, trả kèm hetHanLuc nếu còn hạn).
 * Thật: chỉ RPC da_xac_minh_otp() và phiên hiện tại phải đúng args.userId; không cache;
 * lỗi được ném (không bao giờ coi là đã xác minh). Trả kèm hetHanLuc (gợi ý) và kiemTraLaiLuc,
 * chỉ để hẹn lịch kiểm tra lại, không dùng để cấp quyền.
 */
export function kiemTraDaXacMinhOtp(args: {
  userId: string;
  now?: number;
  client?: SessionClient & RpcClient;
}): Promise<KetQuaKiemTraDaXacMinh> {
  return kiemTraDaXacMinhTheoCauHinh(cauHinhOtp(args), args.userId, {nowMs: args.now ?? Date.now()});
}

/**
 * Tạo bộ điều phối cổng OTP cho giao diện người mua, nối vào kiemTraDaXacMinhOtp.
 */
export function taoCongOtpNguoiMua(tuyChon: {
  emit: (trangThai: TrangThaiCongOtp) => void;
  isActive?: () => boolean;
  client?: SessionClient & RpcClient;
}): BoDieuPhoiCongOtp {
  return taoBoDieuPhoiCongOtp({
    kiemTra: ({userId}) => kiemTraDaXacMinhOtp({userId, client: tuyChon.client}),
    emit: tuyChon.emit,
    ...(tuyChon.isActive ? {isActive: tuyChon.isActive} : {}),
    // Mock: thu hồi bằng chứng (xoaBangChungMock) phải tước quyền vào rồi kiểm tra lại, kể cả khi userId không đổi.
    ...(runtimeConfig.useMockData ? {dangKyThuHoi: dangKyThuHoiBangChungMock} : {}),
  });
}
