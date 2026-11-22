import type {
  PriceProposalResult,
  PricingAlertType,
  PricingSkipReason,
} from './pricingEngine.d.ts';

export const TTL_PHUT = 120;
export const NHAN_MO_PHONG = 'MO_PHONG';
export const TIEN_TO_MO_PHONG = '[MÔ PHỎNG]';
export const TRANG_THAI_SUAT_BI_LOAI: readonly [
  'BAN_NHAP',
  'HUY',
  'DONG_BAN',
  'DA_DIEN_RA',
  'HET_VE',
];

export type MockNow = number | string | Date;
export type KichBanMoPhong = 'ban_nhanh' | 'ban_cham' | 'ban_deu';

export interface MockSuKien {
  TrangThaiCongBo?: string | null;
  moPhong?: boolean;
  ToChucID?: number | string | null;
  TrangThaiMoBan?: string | null;
}

export interface MockSuatDien {
  SuKienID: number;
  TrangThai?: string | null;
  ThoiGianMoBanVe?: MockNow | null;
  ThoiGianDongBanVe?: MockNow | null;
  ThoiGianBatDau?: MockNow | null;
}

export interface MockKhuVuc {
  SuKienID: number;
  SuatDienID: number;
  GiaVeNiemYet: number | null;
  TongSoGhe: number | null;
  TenKhuVuc?: string | null;
  MaKhuVuc?: string | null;
}

export interface MockThanhVienToChuc {
  ToChucID: number | string;
  NguoiDungID: string;
  VaiTro: string;
}

export interface MockNhatKyGiaRow {
  NhatKyGiaID: number;
  KhuVucID: number;
  DeXuatID: number | null;
  LoaiBienDong: 'DUYET_DE_XUAT_AI' | 'DIEU_CHINH_THU_CONG';
  GiaCu: number;
  GiaMoi: number;
  TyLeThayDoiPhanTram: number;
  LyDoThayDoi: string;
  NguoiThucHienID: string;
  ThoiGianApDung: string;
  nhan: typeof NHAN_MO_PHONG;
}

export interface MockGhe {
  GheID: number;
  KhuVucID: number;
  TrangThai: string;
  NgayCapNhatTrangThai?: string | null;
}

export interface MockChiTietGiuCho {
  KhuVucID: number;
  GheID?: number | null;
  SoLuong: number;
}

export interface MockGiuCho {
  GiuChoID: number;
  SuKienID: number;
  SuatDienID: number;
  TrangThai: string;
  HetHanLuc: MockNow;
  chiTiet?: MockChiTietGiuCho[];
}

export interface MockQuyTacGiaRow {
  QuyTacGiaID: number;
  KhuVucID: number;
  GiaGoc: number;
  GiaSan: number;
  GiaTran: number;
  BuocNhayGia: number;
  BienDoToiDaMoiChuKy: number;
  NguongLapDayThap: number;
  NguongLapDayCao: number;
  TrongSoLapDay: number;
  TrongSoTocDoBan: number;
  TrongSoThoiGian: number;
  TrangThaiKichHoat: boolean;
  NgayTao: string;
  NgayCapNhat: string;
}

export type MockTrangThaiDuyet = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface MockDeXuatGiaRow {
  DeXuatID: number;
  QuyTacGiaID: number | null;
  KhuVucID: number;
  TyLeLapDay?: number | null;
  TocDoBanThucTe?: number | null;
  TocDoBanKyVong?: number | null;
  SoGioConLai?: number | null;
  GiaHienTai?: number | null;
  GiaTinhToanTho?: number | null;
  GiaDeXuat: number;
  CoCanhBaoVuotKhung?: boolean;
  LoaiCanhBao?: PricingAlertType;
  TrangThaiDuyet: MockTrangThaiDuyet;
  GhiChuDuyet?: string | null;
  NguoiDuyetID?: string | null;
  ThoiGianDuyet?: string | null;
  LyDoDeXuat?: string | null;
  ThoiGianDeXuat: string;
  nhan?: typeof NHAN_MO_PHONG;
}

export type MockLoaiHanhDongAudit =
  | 'TAO_QUY_TAC'
  | 'CAP_NHAT_QUY_TAC'
  | 'HET_HIEU_LUC_DO_DOI_KHUNG'
  | 'CHAN_DE_XUAT';

export interface MockNhatKyDinhGiaRow {
  NhatKyDinhGiaID: number;
  LoaiHanhDong: MockLoaiHanhDongAudit | null;
  KhuVucID: number | null;
  SuatDienID: number | null;
  SuKienID: number | null;
  QuyTacGiaID: number | null;
  DeXuatID: number | null;
  ThoiGian: string;
  DuLieuTruoc: unknown;
  DuLieuSau: unknown;
  GiaHienHanh: number | null;
  GiaThu: number | null;
  ThamSo: Record<string, unknown>;
  MaChan: MockMaChan | null;
  LyDo: string | null;
  nhan: typeof NHAN_MO_PHONG;
}

export interface MockMoPhongGheRow {
  GheID: number;
  SuKienID: number;
  SuatDienID: number;
  KhuVucID: number;
  KichBan: KichBanMoPhong;
  TrangThaiTruoc: string;
  NgayCapNhatTruoc: string | null;
  ThoiDiemGiaLap: string;
  NgayTao: string;
}

export interface MockSeq {
  quyTacGia: number;
  deXuatGia: number;
  nhatKyDinhGia: number;
  nhatKyGia: number;
}

export interface MockPricingState {
  nhan: typeof NHAN_MO_PHONG;
  suKien: Record<number, MockSuKien>;
  suatDien: Record<number, MockSuatDien>;
  khuVuc: Record<number, MockKhuVuc>;
  ghe: MockGhe[];
  giuCho: MockGiuCho[];
  quyTacGia: Record<number, MockQuyTacGiaRow>;
  deXuatGia: MockDeXuatGiaRow[];
  nhatKyDinhGia: MockNhatKyDinhGiaRow[];
  moPhongGhe: MockMoPhongGheRow[];
  nhatKyGia: MockNhatKyGiaRow[];
  thanhVienToChuc: MockThanhVienToChuc[];
  seq: MockSeq;
}

export interface MockPricingSeed {
  suKien?: Record<number, MockSuKien>;
  suatDien?: Record<number, MockSuatDien>;
  khuVuc?: Record<number, MockKhuVuc>;
  ghe?: MockGhe[];
  giuCho?: MockGiuCho[];
  quyTacGia?: Record<number, MockQuyTacGiaRow>;
  deXuatGia?: MockDeXuatGiaRow[];
  nhatKyDinhGia?: MockNhatKyDinhGiaRow[];
  moPhongGhe?: MockMoPhongGheRow[];
  nhatKyGia?: MockNhatKyGiaRow[];
  thanhVienToChuc?: MockThanhVienToChuc[];
  seq?: Partial<MockSeq>;
}

export interface MockTransitionResult<T> {
  state: MockPricingState;
  result: T;
}

export interface MockPricingMetricsRow {
  khu_vuc_id: number;
  suat_dien_id: number;
  su_kien_id: number;
  trang_thai_suat: string | null;
  thoi_gian_mo_ban: MockNow | null;
  thoi_gian_dong_ban: MockNow | null;
  thoi_gian_bat_dau: MockNow | null;
  dang_mo_ban: boolean;
  gia_hien_hanh: number | null;
  quy_tac_gia_id: number | null;
  co_quy_tac: boolean;
  kich_hoat: boolean;
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
  n_sold: number;
  n_hold: number;
  so_ban_6h: number;
  v_actual: number;
  t_rem_gio: number | null;
  tong_gio_mo_ban: number | null;
  v_target: number | null;
  de_xuat_pending_id: number | null;
  co_pending: boolean;
  mo_phong: boolean;
  nhan: typeof NHAN_MO_PHONG;
  thoi_diem_tinh: string;
}

export interface HetHanDeXuatResult {
  suKienId: number;
  deXuatHetHan: number[];
  soLuong: number;
  moPhong: boolean;
  nhan: typeof NHAN_MO_PHONG;
}

export interface LuuQuyTacGiaParams {
  giaGoc: unknown;
  giaSan: unknown;
  giaTran: unknown;
  buocNhayGia: unknown;
  bienDoToiDa: unknown;
  nguongLapDayThap: unknown;
  nguongLapDayCao: unknown;
  trongSoLapDay: unknown;
  trongSoTocDoBan: unknown;
  trongSoThoiGian: unknown;
  trangThaiKichHoat: unknown;
}

export interface CanhBaoNgoaiKhung {
  ma: 'GIA_HIEN_HANH_NGOAI_KHUNG';
  giaHienHanh: number;
  giaSan: number;
  giaTran: number;
}

export type LuuQuyTacGiaResult =
  | {
      ok: true;
      quyTacGiaId: number;
      khuVucId: number;
      suatDienId: number;
      suKienId: number;
      taoMoi: boolean;
      canhBao: CanhBaoNgoaiKhung[];
      deXuatHetHieuLuc: number[];
      nhatKyId: number;
      moPhong: boolean;
      nhan: typeof NHAN_MO_PHONG;
    }
  | {
      ok: false;
      loi: 'KHU_VUC_KHONG_TON_TAI' | 'QUY_TAC_GIA_KHONG_HOP_LE';
      truong?: string;
      nhan: typeof NHAN_MO_PHONG;
    };

export type MockMaChan =
  | 'QUY_TAC_KHONG_TON_TAI'
  | 'LIEN_KET_KHONG_HOP_LE'
  | 'QUY_TAC_DA_THAY_DOI'
  | 'QUY_TAC_TAT'
  | 'SUAT_DIEN_KHONG_MO_BAN'
  | 'GIA_KHONG_HOP_LE'
  | 'GIA_HIEN_HANH_KHONG_HOP_LE'
  | 'NGOAI_KHUNG_GIA'
  | 'VUOT_BIEN_DO'
  | 'DUOI_BUOC_NHAY'
  | 'DA_CO_PENDING'
  | 'THIEU_DU_LIEU';

export interface LuuDeXuatGiaInput {
  khuVucId: number;
  quyTacGiaId: number | null | undefined;
  quyTacNgayCapNhat: string | null | undefined;
  giaDeXuat: unknown;
  giaTinhToanTho: unknown;
  lyDo?: string | null;
}

export type LuuDeXuatGiaResult =
  | {
      ketQua: 'DA_LUU';
      deXuatId: number;
      khuVucId: number;
      suKienId: number;
      giaDeXuat: number;
      giaHienTai: number;
      loaiCanhBao: PricingAlertType;
      moPhong: boolean;
      nhan: typeof NHAN_MO_PHONG;
      deXuatHetHan: number[];
    }
  | {
      ketQua: 'BI_CHAN';
      maChan: MockMaChan;
      nhatKyId: number;
      deXuatHetHan: number[];
      moPhong: boolean;
      nhan: typeof NHAN_MO_PHONG;
    }
  | {
      ketQua: 'LOI';
      loi: 'KHU_VUC_KHONG_TON_TAI';
      moPhong: boolean;
      nhan: typeof NHAN_MO_PHONG;
    };

export type DeXuatTuDongResult =
  | (Exclude<LuuDeXuatGiaResult, { ketQua: 'LOI' }> & { engine: PriceProposalResult })
  | {
      ketQua: 'BO_QUA';
      lyDoBoQua: Array<PricingSkipReason | 'SUAT_DIEN_KHONG_MO_BAN'>;
      engine: PriceProposalResult | null;
      moPhong: boolean;
      nhan: typeof NHAN_MO_PHONG;
    }
  | {
      ketQua: 'LOI';
      loi: 'KHU_VUC_KHONG_TON_TAI';
      moPhong: boolean;
      nhan: typeof NHAN_MO_PHONG;
    };

export interface MoPhongSuatBoQua {
  suatDienId: number;
  lyDo: 'KHONG_MO_BAN';
}

export interface MoPhongKhuVucResult {
  khuVucId: number;
  suatDienId: number;
  ghiMoi: number;
  datLai: number;
  boQuaDangGiu: number;
  khongCoGhe: boolean;
  biKepVaoCuaSo6h: number;
}

export type MoPhongNhuCauResult =
  | {
      ketQua: 'DA_MO_PHONG';
      nhan: typeof NHAN_MO_PHONG;
      moPhong: true;
      kichBan: KichBanMoPhong;
      suKienId: number;
      thoiDiemNeo: string;
      suatDaMoPhong: number[];
      suatBoQua: MoPhongSuatBoQua[];
      khuVuc: MoPhongKhuVucResult[];
      datLai: {
        tong: number;
        boQuaDaThayDoi: number;
        boQuaDangKhoa: number;
        chuaDatLai: number;
      };
    }
  | {
      ketQua: 'KHONG_CO_SUAT_HOP_LE';
      nhan: typeof NHAN_MO_PHONG;
      moPhong: true;
      kichBan: KichBanMoPhong;
      suKienId: number;
      suatBoQua: MoPhongSuatBoQua[];
    }
  | {
      ketQua: 'LOI';
      loi: 'KICH_BAN_KHONG_HOP_LE' | 'SU_KIEN_KHONG_TON_TAI' | 'MO_PHONG_CHUA_BAT';
      nhan: typeof NHAN_MO_PHONG;
      moPhong: false;
    };

export interface MockNguoiDung {
  id: string;
  loaiTaiKhoan: string;
}

export interface MockLoiDuyet {
  status: 403 | 409 | 422;
  ma: string;
  chiTiet: Record<string, unknown> | null;
}

export type MockLoiResult = { ok: false; loi: MockLoiDuyet; nhan: typeof NHAN_MO_PHONG };

export interface MockHetHanResult {
  ok: false;
  ketQua: 'HET_HAN';
  ma: 'DE_XUAT_HET_HAN';
  deXuatId: number;
  khuVucId: number;
  suKienId: number;
  thoiGianDeXuat: string;
  hetHanLuc: string;
  nhan: typeof NHAN_MO_PHONG;
}

export interface MockDaDuyetResult {
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
  nhan: typeof NHAN_MO_PHONG;
}

export interface MockDaTuChoiResult {
  ok: true;
  ketQua: 'DA_TU_CHOI';
  deXuatId: number;
  khuVucId: number;
  suKienId: number;
  giaHienHanh: number | null;
  nguoiDuyetId: string;
  thoiGianDuyet: string;
  lyDo: string | null;
  nhan: typeof NHAN_MO_PHONG;
}

export type DuyetDeXuatMockResult = MockDaDuyetResult | MockHetHanResult | MockLoiResult;
export type TuChoiDeXuatMockResult = MockDaTuChoiResult | MockHetHanResult | MockLoiResult;

export interface DuyetDeXuatMockInput {
  deXuatId: number;
  ghiChu?: string | null;
  giaDieuChinh?: unknown;
  nguoiDung?: MockNguoiDung | null;
}

export interface TuChoiDeXuatMockInput {
  deXuatId: number;
  lyDo?: string | null;
  nguoiDung?: MockNguoiDung | null;
}

export type MockDongSoLieuDeXuat = MockPricingMetricsRow & {
  ten_khu_vuc: string | null;
  ma_khu_vuc: string | null;
};

export type LayDeXuatGiaMockResult =
  | {
      ok: true;
      suKienId: number;
      soLieu: MockDongSoLieuDeXuat[];
      deXuat: MockDeXuatGiaRow[];
      nhan: typeof NHAN_MO_PHONG;
    }
  | MockLoiResult;

export function toMs(now: MockNow): number;
/** ThoiGianDeXuat + TTL_PHUT (ISO); thời điểm không hợp lệ → null. Quá mốc này (nghiêm ngặt) là hết hạn. */
export function hetHanLuc(thoiGianDeXuat: MockNow | null | undefined): string | null;
export function toIso(now: MockNow): string;
export function createMockState(seed?: MockPricingSeed): MockPricingState;
export function dangMoBan(
  suKien: MockSuKien | null | undefined,
  suatDien: MockSuatDien | null | undefined,
  now: MockNow,
): boolean;
export function laySoLieuDinhGia(
  state: MockPricingState,
  suKienId: number,
  now: MockNow,
): MockPricingMetricsRow[];
export function hetHanDeXuatGia(
  state: MockPricingState,
  suKienId: number,
  now: MockNow,
): MockTransitionResult<HetHanDeXuatResult>;
export function luuQuyTacGia(
  state: MockPricingState,
  khuVucId: number,
  params: LuuQuyTacGiaParams,
  now: MockNow,
): MockTransitionResult<LuuQuyTacGiaResult>;
export function luuDeXuatGia(
  state: MockPricingState,
  input: LuuDeXuatGiaInput,
  now: MockNow,
): MockTransitionResult<LuuDeXuatGiaResult>;
export function duyetDeXuatGia(
  state: MockPricingState,
  input: DuyetDeXuatMockInput,
  now: MockNow,
): MockTransitionResult<DuyetDeXuatMockResult>;
export function tuChoiDeXuatGia(
  state: MockPricingState,
  input: TuChoiDeXuatMockInput,
  now: MockNow,
): MockTransitionResult<TuChoiDeXuatMockResult>;
export function layDeXuatGia(
  state: MockPricingState,
  suKienId: number,
  nguoiDung: MockNguoiDung | null | undefined,
  now: MockNow,
): MockTransitionResult<LayDeXuatGiaMockResult>;
export function deXuatTuDong(
  state: MockPricingState,
  khuVucId: number,
  now: MockNow,
  lyDo?: string | null,
): MockTransitionResult<DeXuatTuDongResult>;
export function moPhongNhuCau(
  state: MockPricingState,
  suKienId: number,
  kichBan: KichBanMoPhong | string,
  now: MockNow,
): MockTransitionResult<MoPhongNhuCauResult>;
