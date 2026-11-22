export const HIEU_LUC_GIAY: 300;
export const CHO_GUI_LAI_GIAY: 60;
export const CUA_SO_GUI_LAI_GIAY: 3600;
export const SO_LAN_GUI_LAI_TOI_DA: 3;
export const CUA_SO_SAI_GIAY: 900;
export const SO_LAN_SAI_TOI_DA: 5;
export const MA_MO_PHONG: '123456';
export const NHAN_MO_PHONG: 'MO_PHONG';

export type LoaiLoiOtp =
  | 'SAI_MA'
  | 'HET_HAN'
  | 'CHUA_GUI'
  // Giới hạn phía client (thiết bị này), khác RATE_LIMIT do Auth cưỡng chế.
  | 'CLIENT_CHO_GUI_LAI'
  | 'CLIENT_HET_LUOT_GUI_LAI'
  | 'CLIENT_TAM_KHOA_NHAP'
  | 'RATE_LIMIT'
  | 'MANG'
  | 'CAU_HINH'
  // Phiên đổi giữa lúc kiểm tra: thử lại được, không tăng số lần sai, không bao giờ là đã xác minh.
  | 'PHIEN_THAY_DOI'
  | 'KHONG_XAC_DINH';

/** Danh sách đóng khớp đúng union LoaiLoiOtp. */
export const LOAI_LOI_OTP: readonly LoaiLoiOtp[];
/** Giá trị ngoài whitelist (kể cả chuỗi lạ) → 'KHONG_XAC_DINH'. */
export function chuanHoaLoaiLoiOtp(x: unknown): LoaiLoiOtp;

export interface TrangThaiOtp {
  email: string;
  guiLuc: number | null;
  lichSuGuiLai: number[];
  lichSuSai: number[];
}

export interface ThoiGianOtp {
  conHieuLuc: boolean;
  giayConHieuLuc: number;
  coTheGuiLai: boolean;
  giayChoGuiLai: number;
  soLanGuiLaiConLai: number;
  mocGuiLaiTiepTheo: number | null;
  soLanSaiConLai: number;
  biTamKhoaNhap: boolean;
  mocMoKhoaNhap: number | null;
  gioiHanHienThi: { sai: number; phut: number };
  laThongTinPhiaClient: true;
}

export interface TuyChonLoiOtp {
  trangThai?: TrangThaiOtp;
  nowMs?: number;
  /** Đồng hồ để đo mốc bắt đầu/hoàn tất gửi (chỉ guiMaOtpTheoCauHinh dùng); bị bỏ qua nếu có nowMs. */
  layNow?: () => number;
  /** Mốc hoàn tất gửi cố định (ghi đè mọi nguồn khác). */
  hoanTatMs?: number;
}

export interface KetQuaGuiOtp {
  nguon: 'THAT' | 'MO_PHONG';
  moPhong?: true;
}

export interface KetQuaXacMinhOtp {
  nguon: 'THAT' | 'MO_PHONG';
  moPhong?: true;
  userId?: string;
  email?: string;
}

export interface AuthGuiOtp {
  signInWithOtp: (...args: any[]) => Promise<any>;
}

export interface AuthXacMinhOtp {
  verifyOtp: (...args: any[]) => Promise<any>;
}

export class OtpServiceError extends Error {
  loai: LoaiLoiOtp;
  soLanSaiConLai: number | null;
  soLanGuiLaiConLai: number | null;
  constructor(
    message: string,
    loai: LoaiLoiOtp,
    chiTiet?: { soLanSaiConLai?: number | null; soLanGuiLaiConLai?: number | null },
  );
}

export function taoTrangThaiOtp(email: string): TrangThaiOtp;
export interface KhoTrangThaiOtpPhien {
  /** Trạng thái của phiên (tạo trống nếu khóa userId+email đổi); null và xóa kho nếu không có phiên. */
  lay(phien: { userId: string; email: string } | null | undefined): TrangThaiOtp | null;
  ghi(phien: { userId: string; email: string }, trangThai: TrangThaiOtp): void;
  /** Tăng thế hệ phiên, bỏ mục hiện tại (yêu cầu đang chờ trở thành cũ) và thông báo người nghe. */
  xoa(): void;
  /** Chi tiết phiên (tạo mục trống nếu khóa đổi); null nếu không có phiên. Không chứa mã nhập. */
  layChiTiet(phien: { userId: string; email: string } | null | undefined): ChiTietKhoOtp | null;
  /** Đăng ký nghe thay đổi (busy/lỗi/thông báo/trạng thái/xóa); trả hàm hủy đăng ký. */
  dangKy(listener: () => void): () => void;
  /**
   * Gắn handler onVerified hiện hành của phiên (panel đang mount); trả hàm gỡ. Khi xác minh thành công,
   * handler đang gắn được ưu tiên hơn tuyChon.onVerified; không gắn thì dùng tuyChon.onVerified (nếu có).
   */
  ganOnVerified?(
    phien: { userId: string; email: string } | null | undefined,
    fn: (ketQua: any) => void | Promise<void>,
  ): () => void;
  /** Gửi mã; busy → trả promise đang chờ, không gửi thêm. Không bao giờ reject. Kết quả cũ bị bỏ hoàn toàn. */
  thucHienGui(phien: { userId: string; email: string }, tuyChon: TuyChonThucHienGui): Promise<void>;
  /** Xác minh mã; maNhap không được lưu. Không bao giờ reject. onVerified chỉ gọi khi kết quả còn hợp lệ. */
  thucHienXacMinh(
    phien: { userId: string; email: string },
    maNhap: string,
    tuyChon: TuyChonThucHienXacMinh,
  ): Promise<void>;
}
export interface ChiTietKhoOtp {
  trangThai: TrangThaiOtp;
  busy: 'send' | 'verify' | null;
  error: string | null;
  notice: string | null;
  theHe: number;
}
export interface TuyChonThucHienGui {
  guiMaOtp: (email: string, opts: { trangThai: TrangThaiOtp; userId: string }) => Promise<{ trangThai: TrangThaiOtp }>;
  layNow?: () => number;
  thongBaoThanhCong?: string;
  thongBaoLoi?: (err: unknown) => string;
}
export interface TuyChonThucHienXacMinh {
  xacMinhMaOtp: (
    email: string,
    token: string,
    userId: string,
    opts: { trangThai: TrangThaiOtp },
  ) => Promise<{ trangThai?: TrangThaiOtp }>;
  onVerified?: (ketQua: any) => void | Promise<void>;
  layNow?: () => number;
  thongBaoThanhCong?: string;
  thongBaoLoi?: (err: unknown) => string;
}
export function taoKhoTrangThaiOtpPhien(): KhoTrangThaiOtpPhien;
/** Kho OTP cấp module theo phiên người mua (sống qua remount cổng); xóa khi thu hồi mock, đổi phiên hoặc đăng xuất. */
export const khoTrangThaiOtpPhien: KhoTrangThaiOtpPhien;
export function ghiNhanGui(st: TrangThaiOtp, nowMs: number, tuyChon?: { laGuiLai?: boolean }): TrangThaiOtp;
export function ghiNhanSai(st: TrangThaiOtp, nowMs: number): TrangThaiOtp;
export function datLaiSauThanhCong(st: TrangThaiOtp): TrangThaiOtp;
export function tinhThoiGianOtp(st: TrangThaiOtp, nowMs: number): ThoiGianOtp;
export function phanLoaiLoiAuth(err: unknown, thoiGian?: { conHieuLuc: boolean } | null): LoaiLoiOtp;
export function thongBaoLoiOtp(loai: unknown, thoiGian?: ThoiGianOtp | null): string;
export function capNhatSauLoi(st: TrangThaiOtp, err: unknown, nowMs: number): TrangThaiOtp;
export function guiOtpLogic(auth: AuthGuiOtp, email: string, tuyChon?: TuyChonLoiOtp): Promise<KetQuaGuiOtp>;
export function xacMinhOtpLogic(
  auth: AuthXacMinhOtp,
  email: string,
  token: string,
  tuyChon?: TuyChonLoiOtp,
): Promise<KetQuaXacMinhOtp>;
export interface CauHinhOtp<A> {
  useMockData: boolean;
  layAuth: () => A;
}
export function guiOtpTheoCauHinh(
  cauHinh: CauHinhOtp<AuthGuiOtp>,
  email: string,
  tuyChon?: TuyChonLoiOtp,
): Promise<KetQuaGuiOtp>;
export function xacMinhOtpTheoCauHinh(
  cauHinh: CauHinhOtp<AuthXacMinhOtp>,
  email: string,
  token: string,
  tuyChon?: TuyChonLoiOtp,
): Promise<KetQuaXacMinhOtp>;
export function guiOtpMock():Promise<KetQuaGuiOtp>;
export function xacMinhOtpMock(token: string, tuyChon?: TuyChonLoiOtp): Promise<KetQuaXacMinhOtp>;

export const HIEU_LUC_XAC_MINH_GIAY: 86400;
/** Chu kỳ kiểm tra lại RPC của nhánh thật (ms); chỉ để hẹn lịch. */
export const KIEM_TRA_LAI_THAT_MS: 300000;
/** Gợi ý hết hạn (ms) từ amr 'otp' của access_token + 24 giờ; null nếu không đọc được. Không ném lỗi. */
export function hetHanTuAccessToken(token: unknown): number | null;
/** Định danh tài khoản mock, đơn ánh theo email chuẩn hóa. */
export function taoDinhDanhMockNguoiMua(email: string): string;
/** Đăng ký callback gọi mỗi khi xoaBangChungMock chạy; trả hàm hủy đăng ký. */
export function dangKyThuHoiBangChungMock(cb: () => void): () => void;

export interface BangChungMock {
  userId: string;
  xacMinhLuc: number;
  nguon: 'MO_PHONG';
}
export function taoBangChungMock(userId: string, nowMs: number): BangChungMock;
export function bangChungMockConHieuLuc(
  bangChung: BangChungMock | null | undefined,
  userId: string,
  nowMs: number,
): boolean;
export function kiemTraBangChungThat(rpcClient: {
  rpc: (fn: any, ...args: any[]) => PromiseLike<any>;
}): Promise<{ daXacMinh: boolean }>;

export function kiemTraTruocKhiGui(st: TrangThaiOtp, nowMs: number): void;
export function kiemTraTruocKhiXacMinh(st: TrangThaiOtp, nowMs: number): void;

export interface RpcSessionClient {
  rpc: (fn: any, ...args: any[]) => PromiseLike<any>;
  // getSession().data.session cần có user.id và access_token (chỉ để so sánh phiên, không lưu/log).
  auth: { getSession: () => Promise<any> };
}
export interface CauHinhOtpDayDu {
  useMockData: boolean;
  layAuth: () => any;
  layClient?: () => RpcSessionClient;
}
export type KhoBangChungMock = Map<string, BangChungMock>;
export const khoBangChungMock: KhoBangChungMock;
/**
 * Biên nhận gửi mô phỏng (trong bộ nhớ): gắn email chuẩn hóa, userId và thế hệ phiên lúc gửi.
 * Không chứa mã OTP; chỉ guiMaOtpTheoCauHinh ghi sau khi gửi mock thành công.
 */
export interface BienNhanGuiMock {
  email: string;
  userId: string;
  theHe: number;
  guiLuc: number;
}
export type KhoGuiMock = Map<string, BienNhanGuiMock>;
export const khoGuiMock: KhoGuiMock;
export function chuanHoaEmail(email: string): string;
/** Đọc biên nhận gửi mock theo email (bản sao, chỉ đọc). */
export function layBienNhanGuiMock(email: string, khoGui?: KhoGuiMock): BienNhanGuiMock | undefined;
/**
 * Luôn tăng thế hệ thu hồi (kể cả khi xóa theo userId); kho mặc định là khoBangChungMock.
 * Đồng thời xóa biên nhận gửi mock: toàn bộ khi không truyền userId, nếu không thì của userId đó.
 */
export function xoaBangChungMock(userId?: string, kho?: KhoBangChungMock, khoGui?: KhoGuiMock): void;
/** Thế hệ thu hồi hiện tại của bằng chứng mô phỏng. */
export function layTheHeBangChungMock(): number;

export interface KetQuaGuiMaOtp extends KetQuaGuiOtp {
  trangThai: TrangThaiOtp;
}
export interface KetQuaXacMinhMaOtp {
  daXacMinh: boolean;
  nguon: 'THAT' | 'MO_PHONG';
  userId: string;
  trangThai: TrangThaiOtp;
}
export function guiMaOtpTheoCauHinh(
  cauHinh: CauHinhOtpDayDu,
  email: string,
  tuyChon?: TuyChonLoiOtp & { userId?: string; khoGui?: KhoGuiMock },
): Promise<KetQuaGuiMaOtp>;
export function xacMinhMaOtpTheoCauHinh(
  cauHinh: CauHinhOtpDayDu,
  email: string,
  token: string,
  expectedUserId: string,
  tuyChon?: TuyChonLoiOtp & { kho?: KhoBangChungMock; khoGui?: KhoGuiMock },
): Promise<KetQuaXacMinhMaOtp>;
export function kiemTraDaXacMinhTheoCauHinh(
  cauHinh: { useMockData: boolean; layClient?: () => RpcSessionClient },
  userId: string,
  tuyChon?: { nowMs?: number; kho?: KhoBangChungMock },
): Promise<KetQuaKiemTraDaXacMinh>;
export interface KetQuaKiemTraDaXacMinh {
  daXacMinh: boolean;
  nguon: 'THAT' | 'MO_PHONG';
  /** Gợi ý thời điểm hết hạn (ms) hoặc null; chỉ để hẹn lịch, không cấp quyền. */
  hetHanLuc: number | null;
  /** Mốc (ms) nên kiểm tra lại; chỉ để hẹn lịch. */
  kiemTraLaiLuc: number | null;
}
