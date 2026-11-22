export const DEFAULT_SO_VE_TOI_DA: 4;
export const DEFAULT_YEU_CAU_OTP: false;
export const MIN_SO_VE_TOI_DA: number;
export const MAX_SO_VE_TOI_DA: number;
export const VAI_TRO_CAU_HINH: readonly string[];
export const LOAI_TAI_KHOAN_CAU_HINH: readonly string[];
export const RPC_LUU_CAU_HINH: 'luu_cau_hinh_mua_ve';

export type PurchaseConfigErrorCode =
  | 'LOI_DOC'
  | 'KHONG_HOP_LE'
  | 'KHONG_CO_QUYEN'
  | 'CAN_DANG_NHAP'
  | 'SU_KIEN_KHONG_TON_TAI'
  | 'LOI_LUU';

export type PurchaseConfigFieldErrors = {
  soVeToiDaMoiDon?: string;
  yeuCauXacMinhOtp?: string;
  suKienId?: string;
};

export class PurchaseConfigError extends Error {
  ma: PurchaseConfigErrorCode;
  loiTheoTruong?: PurchaseConfigFieldErrors;
  cause?: unknown;
  constructor(
    ma: PurchaseConfigErrorCode,
    message?: string,
    options?: {loiTheoTruong?: PurchaseConfigFieldErrors; cause?: unknown},
  );
}

export interface PurchaseConfigInput {
  soVeToiDaMoiDon: number;
  yeuCauXacMinhOtp: boolean;
}

export interface PurchaseConfigValidation {
  ok: boolean;
  value: PurchaseConfigInput | null;
  errors: PurchaseConfigFieldErrors;
  firstInvalidField: 'soVeToiDaMoiDon' | 'yeuCauXacMinhOtp' | null;
}

export function validatePurchaseConfigInput(input: unknown): PurchaseConfigValidation;

export function canManagePurchaseConfig(memberships: unknown, eventOrganizationId: unknown): boolean;

export type PurchaseConfigNguon = 'SUPABASE' | 'MO_PHONG';

export interface PurchaseConfigRead {
  suKienId: number | string;
  soVeToiDaMoiDon: number;
  yeuCauXacMinhOtp: boolean;
  thoiGianGiuChoPhut: number | null;
  trangThai: 'DA_CAU_HINH' | 'CHUA_CAU_HINH';
  nguon: PurchaseConfigNguon;
  moPhong: boolean;
}

export interface PurchaseConfigSaveResult {
  suKienId: number | string;
  soVeToiDaMoiDon: number;
  yeuCauXacMinhOtp: boolean;
  daThayDoi: boolean;
  nguon: PurchaseConfigNguon;
  moPhong: boolean;
  nhan?: string;
}

export interface PurchaseConfigRpcArgs {
  p_su_kien_id: number | string;
  p_so_ve_toi_da: number;
  p_yeu_cau_otp: boolean;
}

/** Số nguyên trong khoảng MIN_SO_VE_TOI_DA..MAX_SO_VE_TOI_DA. */
export function laSoVeToiDaHopLe(n: unknown): n is number;

/** Đúng khi giá trị là boolean thật. */
export function laCoOtpHopLe(v: unknown): v is boolean;

/**
 * Chỉ row null/undefined (chưa có bản ghi) mới trả mặc định 4/false và 'CHUA_CAU_HINH'.
 * @throws {PurchaseConfigError} mã 'LOI_DOC' khi dòng đã tồn tại nhưng SoVeToiDaMoiDon
 * thiếu/không hợp lệ hoặc YeuCauXacMinhOTP không phải boolean.
 */
export function chuanHoaDongCauHinh(
  row: {SoVeToiDaMoiDon?: unknown; YeuCauXacMinhOTP?: unknown; ThoiGianGiuChoPhut?: unknown} | null | undefined,
  suKienId: number | string,
  nguon: PurchaseConfigNguon,
): PurchaseConfigRead;

export function taoThamSoRpc(suKienId: number | string, value: PurchaseConfigInput): PurchaseConfigRpcArgs;

export function phanLoaiLoiRpc(error: unknown): PurchaseConfigError;

export interface KhoCauHinhMoPhong {
  doc(suKienId: number | string): PurchaseConfigRead | Promise<PurchaseConfigRead>;
  luu(
    suKienId: number | string,
    value: PurchaseConfigInput,
    nguoiDung?: unknown,
  ): PurchaseConfigSaveResult | Promise<PurchaseConfigSaveResult>;
}

export interface PurchaseConfigDeps {
  useMockData: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layClient: () => any | Promise<any>;
  khoMoPhong?: KhoCauHinhMoPhong;
  /** Chỉ dùng cho nhánh mock, truyền thẳng xuống khoMoPhong.luu. */
  nguoiDung?: unknown;
}

export function docCauHinhTheoCauHinh(
  deps: PurchaseConfigDeps,
  suKienId: number | string,
): Promise<PurchaseConfigRead>;

export function luuCauHinhTheoCauHinh(
  deps: PurchaseConfigDeps,
  suKienId: number | string,
  input: unknown,
): Promise<PurchaseConfigSaveResult>;
