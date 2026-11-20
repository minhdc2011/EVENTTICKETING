import type {KetQuaKhu} from '../services/pricingService';

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

export function taoKhoPhienMock<S, N, Seed>(cfg: {
  khoa: string;
  taoState: (seed: Seed | undefined) => S;
  layKhoMacDinh: () => KhoLuuTruCore | null;
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
