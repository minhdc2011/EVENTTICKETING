import type { BuyerSession } from '../services/buyerAuthService';
import type { LoaiLoiOtp } from './otpServiceCore';

export type StatusCongOtp =
  | 'DANG_KIEM_TRA'
  | 'CAN_DANG_NHAP'
  | 'CAN_OTP'
  | 'DUOC_VAO'
  | 'LOI';

export const TRANG_THAI_CONG: {
  readonly DANG_KIEM_TRA: 'DANG_KIEM_TRA';
  readonly CAN_DANG_NHAP: 'CAN_DANG_NHAP';
  readonly CAN_OTP: 'CAN_OTP';
  readonly DUOC_VAO: 'DUOC_VAO';
  readonly LOI: 'LOI';
};

export interface LoiCongOtp {
  loai: LoaiLoiOtp;
  thongBao: string;
}

export interface TrangThaiCongOtp {
  status: StatusCongOtp;
  userId: string | null;
  suKienId: string | null;
  phienBan: number;
  nguon: 'THAT' | 'MO_PHONG' | null;
  coTheThuLai: boolean;
  loi: LoiCongOtp | null;
}

export function taoTrangThaiCong(): TrangThaiCongOtp;

export function batDauKiemTra(
  st: TrangThaiCongOtp,
  thamSo: { userId: string | null | undefined; suKienId?: string | null | undefined },
): TrangThaiCongOtp;

export function apDungKetQua(
  st: TrangThaiCongOtp,
  ketQua: {
    phienBan: number;
    userId: string | null;
    suKienId: string | null;
    daXacMinh: unknown;
    nguon?: 'THAT' | 'MO_PHONG' | null;
  },
): TrangThaiCongOtp;

export function apDungLoi(
  st: TrangThaiCongOtp,
  thamSo: {
    phienBan: number;
    userId: string | null;
    suKienId: string | null;
    loai?: unknown;
  },
): TrangThaiCongOtp;

export function dangXuat(st: TrangThaiCongOtp): TrangThaiCongOtp;

export function doiPhien(
  st: TrangThaiCongOtp,
  session: BuyerSession | null | undefined,
): TrangThaiCongOtp;

export function hetHieuLuc(st: TrangThaiCongOtp): TrangThaiCongOtp;

export function thuLai(st: TrangThaiCongOtp): TrangThaiCongOtp;

export interface BoDieuPhoiCongOtp {
  kiemTraLai: (
    session: BuyerSession | null | undefined,
    suKienId: string | null | undefined,
  ) => Promise<TrangThaiCongOtp>;
  dangXuat: () => TrangThaiCongOtp;
  doiPhien: (session: BuyerSession | null | undefined) => Promise<TrangThaiCongOtp>;
  hetHieuLuc: () => TrangThaiCongOtp;
  thuHoi: () => Promise<TrangThaiCongOtp>;
  thuLai: () => Promise<TrangThaiCongOtp>;
  apDungXacMinh: (
    ketQuaXacMinh:
      | { daXacMinh?: unknown; nguon?: string; userId?: string | null }
      | null
      | undefined,
  ) => Promise<TrangThaiCongOtp>;
  layTrangThai: () => TrangThaiCongOtp;
  huy: () => void;
}

export interface KetQuaKiemTraCongOtp {
  daXacMinh: boolean;
  nguon: 'THAT' | 'MO_PHONG';
  hetHanLuc?: number | null;
  kiemTraLaiLuc?: number | null;
}

export function taoBoDieuPhoiCongOtp(tuyChon: {
  kiemTra: (args: { userId: string }) => Promise<KetQuaKiemTraCongOtp>;
  emit: (trangThai: TrangThaiCongOtp) => void;
  isActive?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: any) => void;
  now?: () => number;
  dangKyThuHoi?: (cb: () => void) => () => void;
}): BoDieuPhoiCongOtp;
