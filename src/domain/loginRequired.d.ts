export const EVENT_CAN_DANG_NHAP: string;
export const EVENT_DA_DANG_NHAP: string;
export const KHOA_GIU_CHO_DANG_CHO: string;
export const THONG_BAO_CAN_DANG_NHAP_GIU_CHO: string;
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
