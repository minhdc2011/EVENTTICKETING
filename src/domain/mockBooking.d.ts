import type {HoldItem, HoldRecord} from '../types/ticketing';

export const TRAN_VE_MOI_LUOT: 4;
export const THOI_GIAN_GIU_MS: 300_000;
export const GIOI_HAN_MAC_DINH: 4;

export interface MockHoldEntry {
  readonly holdId: string;
  readonly eventId: string;
  readonly taiKhoanId: string;
  readonly suKienId: string;
  readonly suatDienId: number | string | null;
  readonly status: 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CONVERTED';
  readonly expiresAt: string;
  readonly expiresAtMs: number;
  readonly soLuong: number;
  readonly gioiHan: number;
  readonly daGiaHan?: boolean;
  readonly items: readonly HoldItem[];
}

export interface MockHoldCreateParams {
  taiKhoanId?: string | number | null;
  suKienId?: string | number | null;
  suatDienId?: string | number | null;
  eventId?: string;
  items: HoldItem[];
  gioiHan?: number | null;
  bangGiaChot?: ReadonlyMap<string, number> | null;
}

export interface MockHoldStore {
  giuCho(params: MockHoldCreateParams): HoldRecord;
  huy(holdId: string): void;
  giaHan(holdId: string): {holdId: string; expiresAt: string; daGiaHan: boolean; giaHanMoi: boolean};
  xacNhan(holdId: string): {holdId: string; status: 'CONVERTED'; soVe?: number; daXacNhanTruoc?: boolean};
  layGiuCho(holdId: string): MockHoldEntry | null;
  dangGiu(taiKhoanId: string | number | null | undefined, suKienId: string | number | null | undefined): number;
  layDanhSach(): readonly MockHoldEntry[];
}

export interface MockHoldStoreOptions {
  now?: () => number;
  thoiGianGiuMs?: number;
  taoId?: () => string;
}

export function tinhSoLuongYeuCau(items: readonly HoldItem[] | unknown): number;

export function ganDonGiaChot(
  items: readonly HoldItem[],
  bangGiaChot?: ReadonlyMap<string, number> | null,
): HoldItem[];

export function demVeDangGiu(
  holds: readonly Partial<MockHoldEntry>[] | unknown,
  taiKhoanId: string | number | null | undefined,
  suKienId: string | number | null | undefined,
  nowMs?: number,
): number;

export function taoKhoGiuChoMoPhong(options?: MockHoldStoreOptions): MockHoldStore;
