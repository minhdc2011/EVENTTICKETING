export const EVENT_CAN_DANG_NHAP: string;
export const EVENT_DA_DANG_NHAP: string;
export const KHOA_GIU_CHO_DANG_CHO: string;
export const THONG_BAO_CAN_DANG_NHAP_GIU_CHO: string;
export const EVENT_CAN_OTP: string;
export const EVENT_MA_DEMO: string;
export function phatMaDemo(ma: string, target?: unknown): boolean;
export function laTaiKhoanDemo(email: unknown): boolean;
export const EVENT_DA_XAC_MINH_OTP: string;
export const THONG_BAO_CAN_OTP_THANH_TOAN: string;
export class OtpRequiredError extends Error {
  ma: 'CAN_XAC_MINH_OTP';
  constructor(message?: string, options?: {cause?: unknown});
}
export function laLoiCanOtp(err: unknown): boolean;
export class HoldExpiredError extends Error {
  ma: 'GIU_CHO_HET_HAN';
  constructor(message?: string, options?: {cause?: unknown});
}
export function laLoiGiuChoHetHan(err: unknown): boolean;
export function phatYeuCauOtp(target?: unknown): boolean;
export function phatDaXacMinhOtp(target?: unknown): boolean;
export class LoginRequiredError extends Error {
  ma: 'CAN_DANG_NHAP';
  status: 401;
  constructor(message?: string, options?: {cause?: unknown});
}
export function laLoiCanDangNhap(err: unknown): boolean;
export function phatYeuCauDangNhap(target?: unknown): boolean;
export function phatDaDangNhap(target?: unknown): boolean;
export function taoYDinhGiuCho(input: {scopeKey: string; seatCodes: string[]; standing: Record<string, number>; now?: number}): string;
export function docYDinhGiuCho(
  raw: string | null | undefined,
  scopeKey: string,
  now?: number,
): {seatCodes: string[]; standing: Record<string, number>} | null;
