import type {
  KhoCauHinhMoPhong,
  PurchaseConfigErrorCode,
  PurchaseConfigInput,
  PurchaseConfigRead,
  PurchaseConfigSaveResult,
} from './purchaseConfig';

export const NHAN_MO_PHONG: 'MO_PHONG';
export const KHOA_LUU_TRU_MO_PHONG: string;
export const DEMO_TO_CHUC_ID: string;
export const DEMO_NGUOI_DUNG: Readonly<{id: string; loaiTaiKhoan: 'ORGANIZER'}>;

export interface MockSuKienRecord {
  ToChucID: string | number;
}

export interface MockThanhVienRecord {
  ToChucID: string | number;
  NguoiDungID: string;
  VaiTro: string;
  LoaiTaiKhoan?: string | null;
}

export interface MockCauHinhSuKienRecord {
  SoVeToiDaMoiDon: number | null;
  YeuCauXacMinhOTP: boolean | null;
  ThoiGianGiuChoPhut: number | null;
  nhan: 'MO_PHONG';
  /** true khi dòng gốc sai dạng (không phải object thường): đọc sẽ ném LOI_DOC. */
  hong?: true;
}

export interface MockPurchaseConfigState {
  nhan: 'MO_PHONG';
  suKien: Record<string, MockSuKienRecord>;
  thanhVien: MockThanhVienRecord[];
  cauHinh: Record<string, MockCauHinhSuKienRecord>;
}

export interface MockPurchaseConfigSeed {
  suKien?: Record<string | number, MockSuKienRecord>;
  thanhVien?: MockThanhVienRecord[];
  /** Giá trị không phải object thường (mảng, null, chuỗi, số) được giữ lại như dòng hỏng. */
  cauHinh?: Record<
    string | number,
    | {
        SoVeToiDaMoiDon?: number | null;
        YeuCauXacMinhOTP?: boolean | null;
        ThoiGianGiuChoPhut?: number | null;
        nhan?: 'MO_PHONG';
        hong?: true;
      }
    | unknown
  >;
}

export interface MockPurchaseConfigStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface MockPurchaseConfigStore extends KhoCauHinhMoPhong {
  doc(suKienId: number | string): PurchaseConfigRead;
  luu(suKienId: number | string, value: PurchaseConfigInput, nguoiDung?: unknown): PurchaseConfigSaveResult;
  datLai(seedMoi?: MockPurchaseConfigSeed): void;
  layTrangThai(): MockPurchaseConfigState;
}

export function createMockPurchaseConfigState(seed?: MockPurchaseConfigSeed): MockPurchaseConfigState;

export function khoiTaoDemoCauHinhMuaVe(): MockPurchaseConfigState;

export function docCauHinhMoPhong(
  state: MockPurchaseConfigState | MockPurchaseConfigSeed | null | undefined,
  suKienId: number | string,
): PurchaseConfigRead;

export function luuCauHinhMoPhong(
  state: MockPurchaseConfigState,
  suKienId: number | string,
  input: unknown,
  nguoiDung?: unknown,
): {state: MockPurchaseConfigState; result: PurchaseConfigSaveResult};

/**
 * storage bỏ qua (undefined) = localStorage mặc định; getter localStorage ném lỗi => LOI_DOC (cause giữ lỗi gốc), không seed.
 * storage = null, hoặc localStorage thật sự không tồn tại = bộ nhớ + seed demo.
 */
export function taoKhoMoPhong(
  storage?: MockPurchaseConfigStorage | null,
  options?: {seed?: MockPurchaseConfigSeed; khoa?: string},
): MockPurchaseConfigStore;

export type {PurchaseConfigErrorCode};
