export const MA_VUOT_GIOI_HAN: 'VUOT_GIOI_HAN_VE';
export const PG_CODE: '22023';
export const HTTP_STATUS: 422;

export interface ChiTietGioiHan {
  gioiHan: number;
  dangGiu: number;
  conLai: number;
}

export class PurchaseLimitError extends Error {
  constructor(
    message: string,
    options?: {
      gioiHan?: number | null;
      dangGiu?: number | null;
      conLai?: number | null;
      chiTietHopLe?: boolean;
      cause?: unknown;
    },
  );
  name: 'PurchaseLimitError';
  ma: 'VUOT_GIOI_HAN_VE';
  status: 422;
  gioiHan: number | null;
  dangGiu: number | null;
  conLai: number | null;
  chiTietHopLe: boolean;
  cause?: unknown;
}

export function laLoiVuotGioiHan(err: unknown): boolean;

export function docChiTietGioiHan(details: unknown): ChiTietGioiHan | null;

export function taoLoiVuotGioiHan(chiTiet: unknown, cause?: unknown): PurchaseLimitError;

export function chuanHoaLoiGiuCho<T>(err: T): T | PurchaseLimitError;

export const THONG_BAO_CAN_DANG_NHAP: string;
export function laLoiChuaDangNhap(err: unknown): boolean;
