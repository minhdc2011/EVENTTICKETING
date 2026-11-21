import type {SeatRecord, ZoneRecord} from '../types/ticketing';
import type {
  MockGhe,
  MockKhuVuc,
  MockNguoiDung,
  MockNow,
  MockPricingState,
  MockQuyTacGiaRow,
  MockSuKien,
  MockSuatDien,
  MockThanhVienToChuc,
} from './mockPricing.d.ts';

export const DEMO_SU_KIEN_ID: 990001;
export const DEMO_SUAT_ID: 990101;
export const DEMO_KHU_IDS: readonly [990201, 990202, 990203];
export const DEMO_SLUG: 'demo-dinh-gia-mo-phong';
export const DEMO_SUAT_SLUG: 'suat-demo';
export const DEMO_TO_CHUC_ID: 'mock-org-1';
export const DEMO_NGUOI_DUNG: Readonly<MockNguoiDung>;
export const DEMO_TEN_SU_KIEN: string;

export interface DemoSuKien extends MockSuKien {
  TrangThaiCongBo: 'CONG_KHAI';
  moPhong: true;
  ToChucID: string;
  TenSuKien: string;
  Slug: string;
}

export interface DemoKhuVuc extends MockKhuVuc {
  TenKhuVuc: string;
  MaKhuVuc: string;
  MauSacHex: string;
  moPhong: true;
  GiaVeNiemYet: number;
  TongSoGhe: number;
}

export interface DemoSeed {
  suKien: Record<number, DemoSuKien>;
  suatDien: Record<number, MockSuatDien>;
  khuVuc: Record<number, DemoKhuVuc>;
  ghe: MockGhe[];
  quyTacGia: Record<number, MockQuyTacGiaRow>;
  thanhVienToChuc: MockThanhVienToChuc[];
}

export interface DemoWorkspaceTier {
  tierId: number;
  code: string;
  name: string;
  type: 'GHE_NGOI';
  price: number;
  capacity: number;
  color: string;
  benefits: string;
  minPerOrder: number;
  maxPerOrder: number;
}

export interface DemoWorkspaceShow {
  showId: number;
  slug: string;
  name: string;
  startsAt: string;
  endsAt: string;
  saleStartsAt: string;
  saleEndsAt: string;
  ticketTiers: DemoWorkspaceTier[];
}

export interface DemoWorkspaceEvent {
  id: number;
  organizationId: string;
  name: string;
  slug: string;
  status: 'CONG_KHAI';
  category: string;
  description: string;
  locationMode: 'OFFLINE';
  venueName: string;
  address: string;
  startsAt: string;
  endsAt: string;
  saleStartsAt: string;
  saleEndsAt: string;
  capacity: number;
  price: number;
  showCount: number;
  moPhong: true;
  createdAt: string;
  updatedAt: string;
  shows: DemoWorkspaceShow[];
}

export interface DemoPublicTier {
  id: number;
  code: string;
  name: string;
  price: number;
  color: string;
  description?: string;
  capacity: number;
  available: number;
}

export interface DemoCatalog {
  zones: ZoneRecord[];
  seats: SeatRecord[];
}

/** id số (hoặc chuỗi số) hoặc slug của sự kiện demo. */
export function laSuKienDemo(idOrSlug: unknown): boolean;
export function taoSeedDemo(now: MockNow): DemoSeed;
/** Gỡ dòng demo rồi chèn seed mới; không mutate `state`; dữ liệu khác giữ nguyên. */
export function khoiTaoDemoPricing(state: MockPricingState | null | undefined, now: MockNow): MockPricingState;
export function taoSuKienWorkspaceDemo(now: MockNow): DemoWorkspaceEvent;
/** Thay dòng demo theo id, giữ nguyên các dòng khác; trả mảng mới (dòng demo đứng đầu). */
export function ghepSuKienWorkspaceDemo<T>(rows: readonly T[] | null | undefined, now: MockNow): Array<T | DemoWorkspaceEvent>;
export function docGiaDemo(state: MockPricingState | null | undefined): Map<number, number>;
export function taoCatalogDemo(state: MockPricingState): DemoCatalog;
export function taoTiersDemo(state: MockPricingState): DemoPublicTier[];
