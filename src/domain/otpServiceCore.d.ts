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
  | 'RATE_LIMIT'
  | 'MANG'
  | 'CAU_HINH'
  | 'KHONG_XAC_DINH';

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
export function ghiNhanGui(st: TrangThaiOtp, nowMs: number, tuyChon?: { laGuiLai?: boolean }): TrangThaiOtp;
export function ghiNhanSai(st: TrangThaiOtp, nowMs: number): TrangThaiOtp;
export function datLaiSauThanhCong(st: TrangThaiOtp): TrangThaiOtp;
export function tinhThoiGianOtp(st: TrangThaiOtp, nowMs: number): ThoiGianOtp;
export function phanLoaiLoiAuth(err: unknown, thoiGian?: { conHieuLuc: boolean } | null): LoaiLoiOtp;
export function thongBaoLoiOtp(loai: LoaiLoiOtp | string, thoiGian?: ThoiGianOtp | null): string;
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
