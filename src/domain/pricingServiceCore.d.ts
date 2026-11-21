import type {KetQuaKhu, QuyTacHienHanh, KhuVucDeXuatItem} from '../services/pricingService';
import type {MockDeXuatGiaRow, MockNow, MockPricingMetricsRow} from './mockPricing';

export const NHAN_MO_PHONG_CORE: 'MO_PHONG';
export const LY_DO_QUY_TAC_THAY_DOI: 'QUY_TAC_THAY_DOI_TRONG_LUC_TINH';

/** null nếu hợp lệ, ngược lại đường dẫn trường sai (ví dụ 'khuVuc["1"]'). */
export function kiemTraTrangThaiMoPhong(v: unknown): string | null;

export interface KhoLuuTruCore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ThongTinLuuTruCore {
  luuTru: 'LOCAL_STORAGE' | 'BO_NHO';
  duLieuHong: boolean;
  canhBao: string | null;
}

export interface PhienMockCore<S, N> {
  state: S;
  storage: KhoLuuTruCore | null;
  meta: ThongTinLuuTruCore;
  now: N;
}

export interface KhoPhienMock<S, N, Seed> {
  moPhien(opts: {storage?: KhoLuuTruCore | null; seed?: Seed; now: N}): PhienMockCore<S, N>;
  luuPhien(phien: PhienMockCore<S, N>, state: S): void;
  datLai(): void;
}

export const CANH_BAO_NANG_CAP_V1: string;
export const CANH_BAO_KHOI_PHUC_SEQ: string;

/** Nâng cấp trạng thái v1 đã qua kiểm tra và bảo đảm 4 bộ đếm seq >= ID lớn nhất. */
export function nangCapTrangThaiV1<S>(v: S): {state: S; daNangCap: boolean; canhBao?: string};

export function taoKhoPhienMock<S, N, Seed>(cfg: {
  khoa: string;
  taoState: (seed: Seed | undefined) => S;
  layKhoMacDinh: () => KhoLuuTruCore | null;
  /** Mặc định nangCapTrangThaiV1. Chạy trên dữ liệu đã lưu hợp lệ; daNangCap=true → meta.canhBao. */
  chuanHoa?: (parsed: S) => {state: S; daNangCap: boolean; canhBao?: string};
}): KhoPhienMock<S, N, Seed>;

export interface QuyTacNgayCapNhat {
  QuyTacGiaID: number;
  NgayCapNhat: string;
}

export function quyTacOnDinh(truoc: QuyTacNgayCapNhat[], sau: QuyTacNgayCapNhat[]): Map<number, string>;

export interface DongSoLieuCore {
  khu_vuc_id: number;
  suat_dien_id: number;
  quy_tac_gia_id: number | null;
  dang_mo_ban: boolean;
}

export interface EngineCore {
  shouldPropose: boolean;
  skipReasons: string[];
  proposedPrice: number | null;
  intermediate: {rawPrice: number | null};
}

export interface LuuDeXuatCore {
  ketQua: 'DA_LUU' | 'BI_CHAN';
  [k: string]: unknown;
}

export interface ChayDinhGiaIo<R extends DongSoLieuCore, E extends EngineCore, L> {
  hetHan(suKienId: number): Promise<{deXuatHetHan: number[]; soLuong: number}>;
  docQuyTac(suKienId: number): Promise<QuyTacNgayCapNhat[]>;
  soLieu(suKienId: number): Promise<R[]>;
  tinh(row: R): E;
  luuDeXuat(row: R, engine: E, ngayCapNhat: string): Promise<L>;
}

export function chayDinhGiaNgayLogic<R extends DongSoLieuCore, E extends EngineCore, L extends LuuDeXuatCore>(
  io: ChayDinhGiaIo<R, E, L>,
  suKienId: number,
): Promise<{
  hetHan: {deXuatHetHan: number[]; soLuong: number};
  theoKhu: KetQuaKhu[];
}>;

export interface PricingServiceErrorOptions {
  status?: number | null;
  ma?: string | null;
  chiTiet?: Record<string, unknown> | null;
}

export class PricingServiceError extends Error {
  readonly code: string | null;
  readonly status: number | null;
  readonly ma: string | null;
  readonly chiTiet: Record<string, unknown> | null;

  constructor(message: string, code?: string | null, opts?: PricingServiceErrorOptions);
}

export function phanHoiKhongHopLe(rpc: string): PricingServiceError;

export function chuanHoaLoiRpc(error: unknown): PricingServiceError;

export interface KetQuaHetHanCore {
  ok: false;
  ketQua: 'HET_HAN';
  ma: 'DE_XUAT_HET_HAN';
  deXuatId: number;
  khuVucId: number;
  suKienId: number;
  thoiGianDeXuat: string;
  hetHanLuc: string;
}

export interface KetQuaDaDuyetCore {
  ok: true;
  ketQua: 'DA_DUYET';
  deXuatId: number;
  khuVucId: number;
  suKienId: number;
  giaCu: number;
  giaMoi: number;
  tyLeThayDoiPhanTram: number;
  loaiBienDong: 'DUYET_DE_XUAT_AI' | 'DIEU_CHINH_THU_CONG';
  nhatKyGiaId: number;
  nguoiDuyetId: string;
  thoiGianDuyet: string;
}

export interface KetQuaDaTuChoiCore {
  ok: true;
  ketQua: 'DA_TU_CHOI';
  deXuatId: number;
  khuVucId: number;
  suKienId: number;
  giaHienHanh: number | null;
  nguoiDuyetId: string;
  thoiGianDuyet: string;
  lyDo: string | null;
}

export type KetQuaDuyetCore = KetQuaDaDuyetCore | KetQuaHetHanCore;
export type KetQuaTuChoiCore = KetQuaDaTuChoiCore | KetQuaHetHanCore;

export function docKetQuaDuyet(v: unknown): KetQuaDuyetCore | null;
export function docKetQuaTuChoi(v: unknown): KetQuaTuChoiCore | null;

export interface SoLieuDeXuatInput {
  khu_vuc_id: number;
  suat_dien_id: number;
  su_kien_id: number;
  ma_khu_vuc: string | null;
  ten_khu_vuc: string | null;
  gia_hien_hanh: number | null;
  dang_mo_ban: boolean | null;
  co_quy_tac: boolean | null;
  quy_tac_gia_id: number | null;
  kich_hoat: boolean | null;
  gia_goc: number | null;
  gia_san: number | null;
  gia_tran: number | null;
  buoc_nhay: number | null;
  bien_do: number | null;
  nguong_thap: number | null;
  nguong_cao: number | null;
  trong_so_lap_day: number | null;
  trong_so_toc_do: number | null;
  trong_so_thoi_gian: number | null;
  n_total: number | null;
  n_sold: number | null;
  n_hold: number | null;
  v_actual: number | null;
  v_target: number | null;
  t_rem_gio: number | null;
  thoi_diem_tinh?: string | null;
}

export interface DeXuatGiaRowInput {
  DeXuatID: number;
  KhuVucID: number;
  TrangThaiDuyet: string;
  GiaHienTai?: number | null;
  GiaDeXuat: number;
  GiaTinhToanTho?: number | null;
  TyLeLapDay?: number | null;
  TocDoBanThucTe?: number | null;
  TocDoBanKyVong?: number | null;
  SoGioConLai?: number | null;
  LoaiCanhBao?: string | null;
  CoCanhBaoVuotKhung?: boolean | null;
  LyDoDeXuat?: string | null;
  ThoiGianDeXuat: string;
}

export function ghepDanhSachDeXuat(
  rowsSoLieu: Array<SoLieuDeXuatInput | (MockPricingMetricsRow & {ten_khu_vuc: string | null; ma_khu_vuc: string | null})>,
  rowsDeXuat: Array<DeXuatGiaRowInput | MockDeXuatGiaRow>,
  now?: MockNow,
): KhuVucDeXuatItem[];

export interface RpcClientLike {
  rpc(fn: 'lay_so_lieu_dinh_gia', args: {p_su_kien_id: number}): PromiseLike<{data: unknown; error: unknown}>;
  rpc(
    fn: 'duyet_de_xuat_gia',
    args: {p_de_xuat_id: number; p_ghi_chu: string; p_gia_dieu_chinh?: number},
  ): PromiseLike<{data: unknown; error: unknown}>;
  rpc(
    fn: 'tu_choi_de_xuat_gia',
    args: {p_de_xuat_id: number; p_ly_do: string},
  ): PromiseLike<{data: unknown; error: unknown}>;
  from(table: 'DE_XUAT_GIA'): {
    select(columns: string): {
      in(column: 'KhuVucID', values: readonly number[]): PromiseLike<{data: unknown; error: unknown}>;
    };
  };
}

export function docDanhSachDeXuatThat(
  client: RpcClientLike,
  suKienId: number,
  now?: MockNow,
): Promise<{suKienId: number; khuVuc: KhuVucDeXuatItem[]}>;

export function duyetDeXuatGiaThat(
  client: RpcClientLike,
  deXuatId: number,
  params?: {ghiChu?: string | null; giaDieuChinh?: number | null},
): Promise<KetQuaDuyetCore>;

export function tuChoiDeXuatGiaThat(
  client: RpcClientLike,
  deXuatId: number,
  params?: {lyDo?: string | null},
): Promise<KetQuaTuChoiCore>;

export type {QuyTacHienHanh};
