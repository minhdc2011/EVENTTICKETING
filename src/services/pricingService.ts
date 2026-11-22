/**
 * Dịch vụ client cho các RPC định giá W2 + T1 duyệt/từ chối giá (luu_quy_tac_gia,
 * lay_so_lieu_dinh_gia, luu_de_xuat_gia, het_han_de_xuat_gia, mo_phong_nhu_cau,
 * duyet_de_xuat_gia, tu_choi_de_xuat_gia).
 *
 * - Nhánh thật: chỉ gọi RPC bằng phiên Supabase hiện có (requireSupabaseClient, khóa anon).
 *   Không ghi trực tiếp bảng nào; chỉ ĐỌC QUY_TAC_GIA.NgayCapNhat (PriceGuard) và
 *   DE_XUAT_GIA (danh sách đề xuất theo khu vực thuộc sự kiện).
 *   Lỗi mạng/quyền/thiếu cấu hình được ném ra, không bao giờ chuyển sang mock.
 * - Nhánh mock: chỉ khi runtimeConfig.useMockData bật; dùng src/domain/mockPricing.js (T6)
 *   và lưu trạng thái vào localStorage dưới khóa riêng.
 * - Cờ mở bán lấy từ dang_mo_ban do T2 trả về; không suy ra từ TrangThai/TrangThaiMoBan.
 */
import type {SupabaseClient} from '@supabase/supabase-js';
import {runtimeConfig} from '../config/runtime';
import type {Database} from '../types/database.types';
import {requireSupabaseClient} from './supabaseClient';
import {computePriceProposal, ruleFromQuyTacGia} from '../domain/pricingEngine.js';
import type {
  PriceProposalResult,
  PricingAlertType,
  PricingInput,
  PricingSkipReason,
} from '../domain/pricingEngine';
import {
  NHAN_MO_PHONG,
  createMockState,
  deXuatTuDong,
  duyetDeXuatGia as duyetDeXuatMock,
  hetHanDeXuatGia,
  layDeXuatGia as layDeXuatMock,
  laySoLieuDinhGia as laySoLieuMock,
  luuQuyTacGia as luuQuyTacMock,
  moPhongNhuCau as moPhongNhuCauMock,
  toIso,
  tuChoiDeXuatGia as tuChoiDeXuatMock,
} from '../domain/mockPricing.js';
import {
  LY_DO_QUY_TAC_THAY_DOI,
  PricingServiceError,
  chayDinhGiaNgayLogic,
  docDanhSachDeXuatThat,
  duyetDeXuatGiaThat,
  ghepDanhSachDeXuat,
  nangCapTrangThaiV1,
  phanHoiKhongHopLe,
  taoKhoPhienMock,
  tuChoiDeXuatGiaThat,
} from '../domain/pricingServiceCore.js';
import type {
  KetQuaDaDuyetCore,
  KetQuaDaTuChoiCore,
  KetQuaHetHanCore,
  PhienMockCore,
  PricingServiceErrorOptions,
  RpcClientLike,
} from '../domain/pricingServiceCore';
import type {
  CanhBaoNgoaiKhung,
  KichBanMoPhong,
  MockLoiDuyet,
  MockMaChan,
  MockNguoiDung,
  MockNow,
  MockPricingSeed,
  MockPricingState,
  MoPhongNhuCauResult,
} from '../domain/mockPricing';
import {DEMO_KHU_IDS, DEMO_NGUOI_DUNG, docGiaDemo, khoiTaoDemoPricing} from '../domain/pricingMockDemo.js';
import {phatThongBaoGiaMock} from '../domain/priceRealtime.js';

export {PricingServiceError, DEMO_NGUOI_DUNG};
export type {PricingServiceErrorOptions};

// ---------------------------------------------------------------------------
// Kiểu công khai
// ---------------------------------------------------------------------------

export const KHOA_LUU_TRU_MO_PHONG = 'eventticketing.pricing.mock.v1';

export type NguonDuLieu = 'THAT' | 'MO_PHONG';

export interface ThongTinLuuTru {
  /** Nơi trạng thái mock đang được giữ. */
  luuTru: 'LOCAL_STORAGE' | 'BO_NHO';
  /** true nếu dữ liệu đã lưu bị hỏng/sai dạng và đã được đặt lại. */
  duLieuHong: boolean;
  /** Mô tả bằng tiếng Việt khi luuTru = BO_NHO hoặc duLieuHong; ngược lại null. */
  canhBao: string | null;
}

export interface DichVuMeta {
  nguon: NguonDuLieu;
  /** Chỉ có ở nhánh mock; nhánh thật luôn null. */
  luuTru: ThongTinLuuTru | null;
}

export interface KhoLuuTru {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PricingServiceOptions {
  /** Chỉ dùng ở nhánh thật; mặc định requireSupabaseClient(). */
  client?: SupabaseClient<Database>;
  /** Nhánh mock: kho lưu trữ; null = không có localStorage; bỏ trống = localStorage của trình duyệt. */
  storage?: KhoLuuTru | null;
  /** Nhánh mock: dữ liệu gieo khi chưa có/hỏng trạng thái đã lưu. */
  seed?: MockPricingSeed;
  /** Nhánh mock: thời điểm giả lập; mặc định Date.now(). */
  now?: MockNow;
  /** Nhánh mock: thông tin người dùng hiện tại để kiểm quyền đọc/duyệt/từ chối đề xuất. */
  nguoiDung?: MockNguoiDung | null;
}

export interface QuyTacHienHanh {
  quyTacGiaId: number;
  kichHoat: boolean;
  giaGoc: number | null;
  giaSan: number | null;
  giaTran: number | null;
  buocNhayGia: number | null;
  bienDoToiDa: number | null;
  nguongLapDayThap: number | null;
  nguongLapDayCao: number | null;
  trongSoLapDay: number | null;
  trongSoTocDoBan: number | null;
  trongSoThoiGian: number | null;
}

export interface DeXuatGiaItem {
  deXuatId: number;
  trangThai: string;
  giaHienTai: number | null;
  giaDeXuat: number;
  giaTinhToanTho: number | null;
  tyLeLapDay: number | null;
  tocDoThucTe: number | null;
  tocDoKyVong: number | null;
  soGioConLai: number | null;
  loaiCanhBao: string | null;
  coCanhBaoVuotKhung: boolean;
  lyDo: string | null;
  thoiGianDeXuat: string;
  hetHanLuc: string | null;
  conHieuLuc: boolean;
}

export interface KhuVucDeXuatItem {
  khuVucId: number;
  suatDienId: number;
  maKhuVuc: string | null;
  tenKhuVuc: string | null;
  giaHienHanh: number | null;
  dangMoBan: boolean;
  quyTac: QuyTacHienHanh | null;
  r: number | null;
  u: number | null;
  tRem: number | null;
  deXuat: DeXuatGiaItem[];
}

export type LayDanhSachDeXuatResult = DichVuMeta & {
  suKienId: number;
  khuVuc: KhuVucDeXuatItem[];
};

export interface DuyetDeXuatParams {
  ghiChu?: string | null;
  giaDieuChinh?: number | null;
}

export interface TuChoiDeXuatParams {
  lyDo?: string | null;
}

export type DuyetDeXuatGiaResult = DichVuMeta & (KetQuaDaDuyetCore | KetQuaHetHanCore);
export type TuChoiDeXuatGiaResult = DichVuMeta & (KetQuaDaTuChoiCore | KetQuaHetHanCore);

export interface LuuCauHinhGiaParams {
  giaGoc: number;
  giaSan: number;
  giaTran: number;
  buocNhayGia: number;
  bienDoToiDa: number;
  nguongLapDayThap: number;
  nguongLapDayCao: number;
  trongSoLapDay: number;
  trongSoTocDoBan: number;
  trongSoThoiGian: number;
  trangThaiKichHoat: boolean;
}

/** Nhánh thật ném lỗi khi dữ liệu sai (22023/42501...), nhánh mock trả ok:false. */
export type LuuCauHinhGiaResult = DichVuMeta &
  (
    | {
        ok: true;
        quyTacGiaId: number;
        khuVucId: number;
        suatDienId: number;
        suKienId: number;
        taoMoi: boolean;
        canhBao: CanhBaoNgoaiKhung[];
        deXuatHetHieuLuc: number[];
        /** null khi RPC không ghi nhật ký (không có auth.uid()). */
        nhatKyId: number | null;
      }
    | {
        ok: false;
        loi: 'KHU_VUC_KHONG_TON_TAI' | 'QUY_TAC_GIA_KHONG_HOP_LE';
        truong?: string;
      }
  );

export type SoLieuDinhGiaRaw =
  Database['public']['Functions']['lay_so_lieu_dinh_gia']['Returns'][number];

export type SoLieuDinhGiaRow = Omit<
  SoLieuDinhGiaRaw,
  'khu_vuc_id' | 'suat_dien_id' | 'su_kien_id' | 'dang_mo_ban'
> & {
  khu_vuc_id: number;
  suat_dien_id: number;
  su_kien_id: number;
  /** Cờ mở bán do T2 tính theo khu/suất; null từ DB được coi là false (như COALESCE trong SQL). */
  dang_mo_ban: boolean;
};

export type SoLieuDinhGiaResult = DichVuMeta & {hang: SoLieuDinhGiaRow[]};

export type HetHanDeXuatResult = DichVuMeta & {
  suKienId: number;
  deXuatHetHan: number[];
  soLuong: number;
};

export type MoPhongNhuCauServiceResult = MoPhongNhuCauResult & DichVuMeta;

export type LyDoBoQuaKhu =
  | PricingSkipReason
  | 'SUAT_DIEN_KHONG_MO_BAN'
  | typeof LY_DO_QUY_TAC_THAY_DOI;

interface KhuBase {
  khuVucId: number;
  suatDienId: number;
}

export type KetQuaKhu =
  | (KhuBase & {
      ketQua: 'DA_LUU';
      deXuatId: number;
      giaDeXuat: number;
      giaHienTai: number;
      loaiCanhBao: PricingAlertType;
      deXuatHetHan: number[];
    })
  | (KhuBase & {
      ketQua: 'BI_CHAN';
      maChan: MockMaChan;
      nhatKyId: number | null;
      deXuatHetHan: number[];
    })
  | (KhuBase & {
      ketQua: 'BO_QUA';
      lyDoBoQua: LyDoBoQuaKhu[];
    })
  | (KhuBase & {
      ketQua: 'LOI';
      loi: string;
    });

export type ChayDinhGiaNgayResult = DichVuMeta & {
  suKienId: number;
  hetHan: {deXuatHetHan: number[]; soLuong: number};
  theoKhu: KetQuaKhu[];
};

// ---------------------------------------------------------------------------
// Kiểu phản hồi RPC thật (khác mock: không có nhan/moPhong ở vài nhánh, không có LOI)
// ---------------------------------------------------------------------------

type LuuQuyTacGiaThat = {
  quyTacGiaId: number;
  khuVucId: number;
  suatDienId: number;
  suKienId: number;
  taoMoi: boolean;
  canhBao: CanhBaoNgoaiKhung[];
  deXuatHetHieuLuc: number[];
  nhatKyId: number | null;
};

type LuuDeXuatGiaThat =
  | {
      ketQua: 'DA_LUU';
      deXuatId: number;
      khuVucId: number;
      suKienId: number;
      giaDeXuat: number;
      giaHienTai: number;
      loaiCanhBao: PricingAlertType;
      moPhong: boolean;
      deXuatHetHan: number[];
    }
  | {
      ketQua: 'BI_CHAN';
      maChan: MockMaChan;
      nhatKyId: number | null;
      deXuatHetHan: number[];
    };

type HetHanThat = {suKienId: number; deXuatHetHan: number[]; soLuong: number};

// ---------------------------------------------------------------------------
// Type guard nhỏ cho JSONB
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

function laBanGhi(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function laSo(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function laSoHoacNull(v: unknown): v is number | null {
  return v === null || laSo(v);
}

function laMangSo(v: unknown): v is number[] {
  return Array.isArray(v) && v.every(laSo);
}

const MA_CHAN_HOP_LE: readonly MockMaChan[] = [
  'QUY_TAC_KHONG_TON_TAI',
  'LIEN_KET_KHONG_HOP_LE',
  'QUY_TAC_DA_THAY_DOI',
  'QUY_TAC_TAT',
  'SUAT_DIEN_KHONG_MO_BAN',
  'GIA_KHONG_HOP_LE',
  'GIA_HIEN_HANH_KHONG_HOP_LE',
  'NGOAI_KHUNG_GIA',
  'VUOT_BIEN_DO',
  'DUOI_BUOC_NHAY',
  'DA_CO_PENDING',
  'THIEU_DU_LIEU',
];

function laMaChan(v: unknown): v is MockMaChan {
  return typeof v === 'string' && MA_CHAN_HOP_LE.some((m) => m === v);
}

function laLoaiCanhBao(v: unknown): v is PricingAlertType {
  return v === 'BINH_THUONG' || v === 'CHAM_GIA_TRAN' || v === 'CHAM_GIA_SAN';
}

function laKichBan(v: unknown): v is KichBanMoPhong {
  return v === 'ban_nhanh' || v === 'ban_cham' || v === 'ban_deu';
}

function laCanhBaoNgoaiKhung(v: unknown): v is CanhBaoNgoaiKhung {
  return (
    laBanGhi(v) &&
    v.ma === 'GIA_HIEN_HANH_NGOAI_KHUNG' &&
    laSo(v.giaHienHanh) &&
    laSo(v.giaSan) &&
    laSo(v.giaTran)
  );
}

function docLuuQuyTacGia(v: unknown): LuuQuyTacGiaThat | null {
  if (!laBanGhi(v)) return null;
  const {canhBao} = v;
  if (
    !laSo(v.quyTacGiaId) ||
    !laSo(v.khuVucId) ||
    !laSo(v.suatDienId) ||
    !laSo(v.suKienId) ||
    typeof v.taoMoi !== 'boolean' ||
    !Array.isArray(canhBao) ||
    !canhBao.every(laCanhBaoNgoaiKhung) ||
    !laMangSo(v.deXuatHetHieuLuc) ||
    !laSoHoacNull(v.nhatKyId)
  ) {
    return null;
  }
  return {
    quyTacGiaId: v.quyTacGiaId,
    khuVucId: v.khuVucId,
    suatDienId: v.suatDienId,
    suKienId: v.suKienId,
    taoMoi: v.taoMoi,
    canhBao,
    deXuatHetHieuLuc: v.deXuatHetHieuLuc,
    nhatKyId: v.nhatKyId,
  };
}

function docHetHan(v: unknown): HetHanThat | null {
  if (!laBanGhi(v)) return null;
  if (!laSo(v.suKienId) || !laMangSo(v.deXuatHetHan) || !laSo(v.soLuong)) return null;
  return {suKienId: v.suKienId, deXuatHetHan: v.deXuatHetHan, soLuong: v.soLuong};
}

function docLuuDeXuatGia(v: unknown): LuuDeXuatGiaThat | null {
  if (!laBanGhi(v) || !laMangSo(v.deXuatHetHan)) return null;
  if (v.ketQua === 'DA_LUU') {
    if (
      !laSo(v.deXuatId) ||
      !laSo(v.khuVucId) ||
      !laSo(v.suKienId) ||
      !laSo(v.giaDeXuat) ||
      !laSo(v.giaHienTai) ||
      !laLoaiCanhBao(v.loaiCanhBao) ||
      typeof v.moPhong !== 'boolean'
    ) {
      return null;
    }
    return {
      ketQua: 'DA_LUU',
      deXuatId: v.deXuatId,
      khuVucId: v.khuVucId,
      suKienId: v.suKienId,
      giaDeXuat: v.giaDeXuat,
      giaHienTai: v.giaHienTai,
      loaiCanhBao: v.loaiCanhBao,
      moPhong: v.moPhong,
      deXuatHetHan: v.deXuatHetHan,
    };
  }
  if (v.ketQua === 'BI_CHAN') {
    if (!laMaChan(v.maChan) || !laSoHoacNull(v.nhatKyId)) return null;
    return {
      ketQua: 'BI_CHAN',
      maChan: v.maChan,
      nhatKyId: v.nhatKyId,
      deXuatHetHan: v.deXuatHetHan,
    };
  }
  return null;
}

function docMoPhongNhuCau(v: unknown): MoPhongNhuCauResult | null {
  if (!laBanGhi(v) || v.nhan !== NHAN_MO_PHONG || v.moPhong !== true) return null;
  if (!laKichBan(v.kichBan) || !laSo(v.suKienId)) return null;
  const {suatBoQua} = v;
  const boQua: Array<{suatDienId: number; lyDo: 'KHONG_MO_BAN'}> = [];
  if (!Array.isArray(suatBoQua)) return null;
  for (const s of suatBoQua) {
    if (!laBanGhi(s) || !laSo(s.suatDienId) || s.lyDo !== 'KHONG_MO_BAN') return null;
    boQua.push({suatDienId: s.suatDienId, lyDo: 'KHONG_MO_BAN'});
  }

  if (v.ketQua === 'KHONG_CO_SUAT_HOP_LE') {
    return {
      ketQua: 'KHONG_CO_SUAT_HOP_LE',
      nhan: NHAN_MO_PHONG,
      moPhong: true,
      kichBan: v.kichBan,
      suKienId: v.suKienId,
      suatBoQua: boQua,
    };
  }

  if (v.ketQua !== 'DA_MO_PHONG') return null;
  const {khuVuc, datLai} = v;
  if (typeof v.thoiDiemNeo !== 'string' || !laMangSo(v.suatDaMoPhong)) return null;
  if (!Array.isArray(khuVuc) || !laBanGhi(datLai)) return null;
  if (
    !laSo(datLai.tong) ||
    !laSo(datLai.boQuaDaThayDoi) ||
    !laSo(datLai.boQuaDangKhoa) ||
    !laSo(datLai.chuaDatLai)
  ) {
    return null;
  }
  const khu: Array<Extract<MoPhongNhuCauResult, {ketQua: 'DA_MO_PHONG'}>['khuVuc'][number]> = [];
  for (const k of khuVuc) {
    if (
      !laBanGhi(k) ||
      !laSo(k.khuVucId) ||
      !laSo(k.suatDienId) ||
      !laSo(k.ghiMoi) ||
      !laSo(k.datLai) ||
      !laSo(k.boQuaDangGiu) ||
      typeof k.khongCoGhe !== 'boolean' ||
      !laSo(k.biKepVaoCuaSo6h)
    ) {
      return null;
    }
    khu.push({
      khuVucId: k.khuVucId,
      suatDienId: k.suatDienId,
      ghiMoi: k.ghiMoi,
      datLai: k.datLai,
      boQuaDangGiu: k.boQuaDangGiu,
      khongCoGhe: k.khongCoGhe,
      biKepVaoCuaSo6h: k.biKepVaoCuaSo6h,
    });
  }
  return {
    ketQua: 'DA_MO_PHONG',
    nhan: NHAN_MO_PHONG,
    moPhong: true,
    kichBan: v.kichBan,
    suKienId: v.suKienId,
    thoiDiemNeo: v.thoiDiemNeo,
    suatDaMoPhong: v.suatDaMoPhong,
    suatBoQua: boQua,
    khuVuc: khu,
    datLai: {
      tong: datLai.tong,
      boQuaDaThayDoi: datLai.boQuaDaThayDoi,
      boQuaDangKhoa: datLai.boQuaDangKhoa,
      chuaDatLai: datLai.chuaDatLai,
    },
  };
}

// ---------------------------------------------------------------------------
// Tiện ích chung
// ---------------------------------------------------------------------------

function thongBaoLoi(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function kiemTraSuKienId(suKienId: number): void {
  if (!Number.isInteger(suKienId) || suKienId <= 0) {
    throw new PricingServiceError('suKienId không hợp lệ.', 'THAM_SO_KHONG_HOP_LE');
  }
}

function kiemTraKhuVucId(khuVucId: number): void {
  if (!Number.isInteger(khuVucId) || khuVucId <= 0) {
    throw new PricingServiceError('khuVucId không hợp lệ.', 'THAM_SO_KHONG_HOP_LE');
  }
}

function kiemTraDeXuatId(deXuatId: number): void {
  if (!Number.isInteger(deXuatId) || deXuatId <= 0) {
    throw new PricingServiceError('deXuatId không hợp lệ.', 'THAM_SO_KHONG_HOP_LE');
  }
}

function loiMockSangError(loi: MockLoiDuyet): PricingServiceError {
  const code = loi.status === 403 ? '42501' : loi.status === 409 ? '40001' : '22023';
  return new PricingServiceError(loi.ma, code, {
    status: loi.status,
    ma: loi.ma,
    chiTiet: loi.chiTiet,
  });
}

/** Chỉ cấu hình runtime quyết định nhánh mock; không có tùy chọn nào của caller được ghi đè. */
function dungMock(_opts: PricingServiceOptions): boolean {
  return runtimeConfig.useMockData;
}

function layClient(opts: PricingServiceOptions): SupabaseClient<Database> {
  // Ném lỗi khi thiếu cấu hình; tuyệt đối không chuyển sang mock.
  return opts.client ?? requireSupabaseClient();
}

function taoRpcClient(client: SupabaseClient<Database>): RpcClientLike {
  function rpc(fn: 'lay_so_lieu_dinh_gia', args: {p_su_kien_id: number}): PromiseLike<{data: unknown; error: unknown}>;
  function rpc(
    fn: 'duyet_de_xuat_gia',
    args: {p_de_xuat_id: number; p_ghi_chu: string; p_gia_dieu_chinh?: number},
  ): PromiseLike<{data: unknown; error: unknown}>;
  function rpc(
    fn: 'tu_choi_de_xuat_gia',
    args: {p_de_xuat_id: number; p_ly_do: string},
  ): PromiseLike<{data: unknown; error: unknown}>;
  function rpc(fn: string, args: Record<string, unknown>): PromiseLike<{data: unknown; error: unknown}> {
    if (fn === 'lay_so_lieu_dinh_gia') {
      return client.rpc('lay_so_lieu_dinh_gia', args as Database['public']['Functions']['lay_so_lieu_dinh_gia']['Args']);
    }
    if (fn === 'duyet_de_xuat_gia') {
      return client.rpc('duyet_de_xuat_gia', args as Database['public']['Functions']['duyet_de_xuat_gia']['Args']);
    }
    return client.rpc('tu_choi_de_xuat_gia', args as Database['public']['Functions']['tu_choi_de_xuat_gia']['Args']);
  }

  return {
    rpc,
    from: (table) => ({
      select: (_columns) => ({
        in: async (column, values) => {
          const {data, error} = await client
            .from(table)
            .select(
              'DeXuatID,KhuVucID,QuyTacGiaID,TrangThaiDuyet,GiaHienTai,GiaDeXuat,GiaTinhToanTho,TyLeLapDay,TocDoBanThucTe,TocDoBanKyVong,SoGioConLai,LoaiCanhBao,CoCanhBaoVuotKhung,LyDoDeXuat,ThoiGianDeXuat,GhiChuDuyet,NguoiDuyetID,ThoiGianDuyet',
            )
            .in(column, [...values]);
          return {data, error};
        },
      }),
    }),
  };
}

function datMeta(luuTru: ThongTinLuuTru | null): DichVuMeta {
  return luuTru ? {nguon: 'MO_PHONG', luuTru} : {nguon: 'THAT', luuTru: null};
}

function thuHepHang(raw: SoLieuDinhGiaRaw): SoLieuDinhGiaRow {
  if (raw.khu_vuc_id === null || raw.suat_dien_id === null || raw.su_kien_id === null) {
    throw phanHoiKhongHopLe('lay_so_lieu_dinh_gia');
  }
  return {
    ...raw,
    khu_vuc_id: raw.khu_vuc_id,
    suat_dien_id: raw.suat_dien_id,
    su_kien_id: raw.su_kien_id,
    dang_mo_ban: raw.dang_mo_ban === true,
  };
}

function isoHoacNull(v: MockNow | null): string | null {
  return v === null || v === undefined ? null : toIso(v);
}

/** Đầu vào engine từ một dòng số liệu T2; không đụng tới TrangThai/TrangThaiMoBan. */
function dauVaoEngine(row: SoLieuDinhGiaRow): PricingInput {
  const quyTac =
    row.co_quy_tac === true
      ? {
          GiaGoc: row.gia_goc,
          GiaSan: row.gia_san,
          GiaTran: row.gia_tran,
          BuocNhayGia: row.buoc_nhay,
          BienDoToiDaMoiChuKy: row.bien_do,
          NguongLapDayThap: row.nguong_thap,
          NguongLapDayCao: row.nguong_cao,
          TrongSoLapDay: row.trong_so_lap_day,
          TrongSoTocDoBan: row.trong_so_toc_do,
          TrongSoThoiGian: row.trong_so_thoi_gian,
          TrangThaiKichHoat: row.kich_hoat === true,
        }
      : null;
  return {
    rule: ruleFromQuyTacGia(quyTac),
    currentPrice: row.gia_hien_hanh,
    totalSeats: row.n_total,
    soldSeats: row.n_sold,
    heldSeats: row.n_hold,
    hoursRemaining: row.t_rem_gio,
    actualVelocity: row.v_actual,
    targetVelocity: row.v_target,
    hasPendingProposal: row.co_pending === true,
  };
}

function lyDoMacDinh(engine: PriceProposalResult): string {
  return `Đề xuất tự động (r=${((engine.intermediate.fillRate ?? 0) * 100).toFixed(1)}%)`;
}

// ---------------------------------------------------------------------------
// Nhánh thật: gọi RPC
// ---------------------------------------------------------------------------

async function rpcSoLieu(client: SupabaseClient<Database>, suKienId: number): Promise<SoLieuDinhGiaRow[]> {
  const {data, error} = await client.rpc('lay_so_lieu_dinh_gia', {p_su_kien_id: suKienId});
  if (error) throw new PricingServiceError(error.message, error.code);
  if (!Array.isArray(data)) throw phanHoiKhongHopLe('lay_so_lieu_dinh_gia');
  return data.map(thuHepHang);
}

async function rpcHetHan(client: SupabaseClient<Database>, suKienId: number): Promise<HetHanThat> {
  const {data, error} = await client.rpc('het_han_de_xuat_gia', {p_su_kien_id: suKienId});
  if (error) throw new PricingServiceError(error.message, error.code);
  const parsed = docHetHan(data);
  if (!parsed) throw phanHoiKhongHopLe('het_han_de_xuat_gia');
  return parsed;
}

async function rpcLuuDeXuat(
  client: SupabaseClient<Database>,
  args: Database['public']['Functions']['luu_de_xuat_gia']['Args'],
): Promise<LuuDeXuatGiaThat> {
  const {data, error} = await client.rpc('luu_de_xuat_gia', args);
  if (error) throw new PricingServiceError(error.message, error.code);
  const parsed = docLuuDeXuatGia(data);
  if (!parsed) throw phanHoiKhongHopLe('luu_de_xuat_gia');
  return parsed;
}

async function chayDinhGiaNgayThat(
  client: SupabaseClient<Database>,
  suKienId: number,
): Promise<ChayDinhGiaNgayResult> {
  // Đọc QUY_TAC_GIA (QuyTacGiaID, NgayCapNhat) của các khu thuộc sự kiện: metrics RPC không trả NgayCapNhat
  // (guard.sql so p_quy_tac_ngay_cap_nhat với bản hiện hành). Lỗi đọc được ném ra, không nuốt.
  const docQuyTac = async (id: number) => {
    const khu = await client.from('KHU_VUC').select('KhuVucID').eq('SuKienID', id);
    if (khu.error) throw new PricingServiceError(khu.error.message, khu.error.code);
    const khuIds = khu.data.map((k) => k.KhuVucID);
    if (khuIds.length === 0) return [];
    const qt = await client.from('QUY_TAC_GIA').select('QuyTacGiaID,NgayCapNhat').in('KhuVucID', khuIds);
    if (qt.error) throw new PricingServiceError(qt.error.message, qt.error.code);
    return qt.data;
  };

  const {hetHan, theoKhu} = await chayDinhGiaNgayLogic<SoLieuDinhGiaRow, PriceProposalResult, LuuDeXuatGiaThat>(
    {
      hetHan: (id) => rpcHetHan(client, id),
      docQuyTac,
      soLieu: (id) => rpcSoLieu(client, id),
      tinh: (row) => computePriceProposal(dauVaoEngine(row)),
      luuDeXuat: (row, engine, ngay) => {
        if (row.quy_tac_gia_id === null || engine.proposedPrice === null || engine.intermediate.rawPrice === null) {
          throw new PricingServiceError('Thiếu dữ liệu để lưu đề xuất.', 'THAM_SO_KHONG_HOP_LE');
        }
        return rpcLuuDeXuat(client, {
          p_khu_vuc_id: row.khu_vuc_id,
          p_quy_tac_gia_id: row.quy_tac_gia_id,
          p_quy_tac_ngay_cap_nhat: ngay,
          p_gia_de_xuat: engine.proposedPrice,
          p_gia_tinh_toan_tho: engine.intermediate.rawPrice,
          p_ly_do: lyDoMacDinh(engine),
        });
      },
    },
    suKienId,
  );

  return {...datMeta(null), suKienId, hetHan, theoKhu};
}

// ---------------------------------------------------------------------------
// Nhánh mock: trạng thái + localStorage
// ---------------------------------------------------------------------------

const khoMock = taoKhoPhienMock<MockPricingState, MockNow, MockPricingSeed>({
  khoa: KHOA_LUU_TRU_MO_PHONG,
  taoState: (seed) => createMockState(seed),
  layKhoMacDinh: () => layKhoMacDinh(),
  chuanHoa: nangCapTrangThaiV1,
});

/** Xóa trạng thái bộ nhớ tạm và cờ ưu tiên bộ nhớ (sau lỗi ghi localStorage). Dùng cho kiểm thử. */
export function datLaiBoNhoMoPhong(): void {
  khoMock.datLai();
}

/** Khởi tạo hoặc khôi phục bộ dữ liệu demo định giá trong kho mô phỏng (chỉ nhánh mock). */
export async function khoiTaoDemoDinhGia(
  opts: PricingServiceOptions = {},
): Promise<DichVuMeta> {
  if (!dungMock(opts)) {
    throw new PricingServiceError(
      'Khởi tạo dữ liệu demo định giá chỉ hỗ trợ ở chế độ mô phỏng.',
      'KHONG_HO_TRO_NHANH_THAT',
    );
  }
  const phien = moPhien(opts);
  const nextState = khoiTaoDemoPricing(phien.state, phien.now);
  luuPhien(phien, nextState);
  phatThongBaoGiaMockAnToan({khoiTaoDemo: true});
  return datMeta(phien.meta);
}

/** Đọc trạng thái mô phỏng hiện tại từ kho pricing mà không ghi (chỉ nhánh mock). */
export async function docTrangThaiMoPhong(
  opts: PricingServiceOptions = {},
): Promise<DichVuMeta & {state: MockPricingState}> {
  if (!dungMock(opts)) {
    throw new PricingServiceError(
      'Đọc trạng thái mô phỏng chỉ hỗ trợ ở chế độ mô phỏng.',
      'KHONG_HO_TRO_NHANH_THAT',
    );
  }
  const phien = moPhien(opts);
  return {...datMeta(phien.meta), state: phien.state};
}

/**
 * Bảng MaKhuVuc → GiaVeNiemYet hiện hành của các khu demo, đọc không ghi (chỉ nhánh mock).
 * Dùng để chốt giá khi tạo giữ chỗ; không khởi tạo lại seed demo.
 */
export async function docBangGiaChotDemo(
  opts: PricingServiceOptions = {},
): Promise<ReadonlyMap<string, number>> {
  if (!dungMock(opts)) {
    throw new PricingServiceError(
      'Đọc bảng giá chốt demo chỉ hỗ trợ ở chế độ mô phỏng.',
      'KHONG_HO_TRO_NHANH_THAT',
    );
  }
  const {state} = moPhien(opts);
  const giaTheoKhu = docGiaDemo(state);
  const bang = new Map<string, number>();
  for (const khuId of DEMO_KHU_IDS) {
    const gia = giaTheoKhu.get(khuId);
    const ma = state.khuVuc[khuId]?.MaKhuVuc;
    if (gia !== undefined && typeof ma === 'string' && ma !== '') bang.set(ma, gia);
  }
  return bang;
}

function layKhoMacDinh(): KhoLuuTru | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    // Truy cập localStorage có thể ném SecurityError (chặn cookie/trang riêng tư).
    return null;
  }
}

type PhienMock = PhienMockCore<MockPricingState, MockNow>;

function layEventTarget(): EventTarget | null {
  if (typeof globalThis === 'undefined') return null;
  const candidate = globalThis as {dispatchEvent?: unknown};
  return typeof candidate.dispatchEvent === 'function'
    ? (globalThis as unknown as EventTarget)
    : null;
}

function phatThongBaoGiaMockAnToan(detail: unknown): void {
  try {
    phatThongBaoGiaMock(layEventTarget(), detail);
  } catch {
    // Lỗi phát thông báo thay đổi giá mock không làm hỏng lệnh đã lưu.
  }
}

function moPhien(opts: PricingServiceOptions): PhienMock {
  return khoMock.moPhien({storage: opts.storage, seed: opts.seed, now: opts.now ?? Date.now()});
}

function luuPhien(phien: PhienMock, state: MockPricingState): void {
  khoMock.luuPhien(phien, state);
}

// ---------------------------------------------------------------------------
// API cho W3
// ---------------------------------------------------------------------------

export async function luuCauHinhGia(
  khuVucId: number,
  params: LuuCauHinhGiaParams,
  opts: PricingServiceOptions = {},
): Promise<LuuCauHinhGiaResult> {
  kiemTraKhuVucId(khuVucId);

  if (dungMock(opts)) {
    const phien = moPhien(opts);
    const {state, result} = luuQuyTacMock(phien.state, khuVucId, params, phien.now);
    luuPhien(phien, state);
    const meta = datMeta(phien.meta);
    if ('loi' in result) {
      return {...meta, ok: false, loi: result.loi, ...(result.truong === undefined ? {} : {truong: result.truong})};
    }
    return {
      ...meta,
      ok: true,
      quyTacGiaId: result.quyTacGiaId,
      khuVucId: result.khuVucId,
      suatDienId: result.suatDienId,
      suKienId: result.suKienId,
      taoMoi: result.taoMoi,
      canhBao: result.canhBao,
      deXuatHetHieuLuc: result.deXuatHetHieuLuc,
      nhatKyId: result.nhatKyId,
    };
  }

  const client = layClient(opts);
  const {data, error} = await client.rpc('luu_quy_tac_gia', {
    p_khu_vuc_id: khuVucId,
    p_gia_goc: params.giaGoc,
    p_gia_san: params.giaSan,
    p_gia_tran: params.giaTran,
    p_buoc_nhay_gia: params.buocNhayGia,
    p_bien_do_toi_da: params.bienDoToiDa,
    p_nguong_lap_day_thap: params.nguongLapDayThap,
    p_nguong_lap_day_cao: params.nguongLapDayCao,
    p_trong_so_lap_day: params.trongSoLapDay,
    p_trong_so_toc_do_ban: params.trongSoTocDoBan,
    p_trong_so_thoi_gian: params.trongSoThoiGian,
    p_trang_thai_kich_hoat: params.trangThaiKichHoat,
  });
  if (error) throw new PricingServiceError(error.message, error.code);
  const parsed = docLuuQuyTacGia(data);
  if (!parsed) throw phanHoiKhongHopLe('luu_quy_tac_gia');
  return {...datMeta(null), ok: true, ...parsed};
}

export async function laySoLieuDinhGia(
  suKienId: number,
  opts: PricingServiceOptions = {},
): Promise<SoLieuDinhGiaResult> {
  kiemTraSuKienId(suKienId);

  if (dungMock(opts)) {
    const phien = moPhien(opts);
    const hang = laySoLieuMock(phien.state, suKienId, phien.now).map(
      (r): SoLieuDinhGiaRow => ({
        ...r,
        ma_khu_vuc: null,
        ten_khu_vuc: null,
        thoi_gian_mo_ban: isoHoacNull(r.thoi_gian_mo_ban),
        thoi_gian_dong_ban: isoHoacNull(r.thoi_gian_dong_ban),
        thoi_gian_bat_dau: isoHoacNull(r.thoi_gian_bat_dau),
      }),
    );
    return {...datMeta(phien.meta), hang};
  }

  return {...datMeta(null), hang: await rpcSoLieu(layClient(opts), suKienId)};
}

export async function hetHanDeXuat(
  suKienId: number,
  opts: PricingServiceOptions = {},
): Promise<HetHanDeXuatResult> {
  kiemTraSuKienId(suKienId);

  if (dungMock(opts)) {
    const phien = moPhien(opts);
    const {state, result} = hetHanDeXuatGia(phien.state, suKienId, phien.now);
    luuPhien(phien, state);
    return {
      ...datMeta(phien.meta),
      suKienId: result.suKienId,
      deXuatHetHan: result.deXuatHetHan,
      soLuong: result.soLuong,
    };
  }

  return {...datMeta(null), ...(await rpcHetHan(layClient(opts), suKienId))};
}

export async function chayDinhGiaNgay(
  suKienId: number,
  opts: PricingServiceOptions = {},
): Promise<ChayDinhGiaNgayResult> {
  kiemTraSuKienId(suKienId);

  if (!dungMock(opts)) {
    return chayDinhGiaNgayThat(layClient(opts), suKienId);
  }

  const phien = moPhien(opts);
  const hetHan = hetHanDeXuatGia(phien.state, suKienId, phien.now);
  let state = hetHan.state;
  const theoKhu: KetQuaKhu[] = [];
  try {
    const rows = laySoLieuMock(state, suKienId, phien.now);
    for (const row of rows) {
      const base: KhuBase = {khuVucId: row.khu_vuc_id, suatDienId: row.suat_dien_id};
      try {
        const step = deXuatTuDong(state, row.khu_vuc_id, phien.now);
        state = step.state;
        const r = step.result;
        if (r.ketQua === 'DA_LUU') {
          theoKhu.push({
            ...base,
            ketQua: 'DA_LUU',
            deXuatId: r.deXuatId,
            giaDeXuat: r.giaDeXuat,
            giaHienTai: r.giaHienTai,
            loaiCanhBao: r.loaiCanhBao,
            deXuatHetHan: r.deXuatHetHan,
          });
        } else if (r.ketQua === 'BI_CHAN') {
          theoKhu.push({
            ...base,
            ketQua: 'BI_CHAN',
            maChan: r.maChan,
            nhatKyId: r.nhatKyId,
            deXuatHetHan: r.deXuatHetHan,
          });
        } else if (r.ketQua === 'BO_QUA') {
          theoKhu.push({...base, ketQua: 'BO_QUA', lyDoBoQua: r.lyDoBoQua});
        } else {
          theoKhu.push({...base, ketQua: 'LOI', loi: r.loi});
        }
      } catch (e) {
        theoKhu.push({...base, ketQua: 'LOI', loi: thongBaoLoi(e)});
      }
    }
  } finally {
    luuPhien(phien, state);
  }

  return {
    ...datMeta(phien.meta),
    suKienId,
    hetHan: {deXuatHetHan: hetHan.result.deXuatHetHan, soLuong: hetHan.result.soLuong},
    theoKhu,
  };
}

export async function moPhongNhuCau(
  suKienId: number,
  kichBan: KichBanMoPhong,
  opts: PricingServiceOptions = {},
): Promise<MoPhongNhuCauServiceResult> {
  kiemTraSuKienId(suKienId);

  if (dungMock(opts)) {
    const phien = moPhien(opts);
    const {state, result} = moPhongNhuCauMock(phien.state, suKienId, kichBan, phien.now);
    luuPhien(phien, state);
    return {...result, ...datMeta(phien.meta)};
  }

  const client = layClient(opts);
  const {data, error} = await client.rpc('mo_phong_nhu_cau', {
    p_su_kien_id: suKienId,
    p_kich_ban: kichBan,
  });
  if (error) throw new PricingServiceError(error.message, error.code);
  const parsed = docMoPhongNhuCau(data);
  if (!parsed) throw phanHoiKhongHopLe('mo_phong_nhu_cau');
  return {...parsed, ...datMeta(null)};
}

export async function layDanhSachDeXuat(
  suKienId: number,
  opts: PricingServiceOptions = {},
): Promise<LayDanhSachDeXuatResult> {
  kiemTraSuKienId(suKienId);

  if (dungMock(opts)) {
    const phien = moPhien(opts);
    const {result} = layDeXuatMock(phien.state, suKienId, opts.nguoiDung, phien.now);
    if ('loi' in result) throw loiMockSangError(result.loi);
    const khuVuc = ghepDanhSachDeXuat(result.soLieu, result.deXuat, phien.now);
    return {...datMeta(phien.meta), suKienId: result.suKienId, khuVuc};
  }

  const data = await docDanhSachDeXuatThat(taoRpcClient(layClient(opts)), suKienId, opts.now);
  return {...datMeta(null), ...data};
}

export async function duyetDeXuatGia(
  deXuatId: number,
  params: DuyetDeXuatParams = {},
  opts: PricingServiceOptions = {},
): Promise<DuyetDeXuatGiaResult> {
  kiemTraDeXuatId(deXuatId);

  if (dungMock(opts)) {
    const phien = moPhien(opts);
    const {state, result} = duyetDeXuatMock(
      phien.state,
      {
        deXuatId,
        ghiChu: params.ghiChu ?? null,
        giaDieuChinh: params.giaDieuChinh,
        nguoiDung: opts.nguoiDung,
      },
      phien.now,
    );
    if (state !== phien.state) luuPhien(phien, state);
    if ('loi' in result) throw loiMockSangError(result.loi);
    const meta = datMeta(phien.meta);
    if (result.ketQua === 'HET_HAN') {
      const {nhan: _nhan, ...hetHan} = result;
      return {...meta, ...hetHan};
    }
    if (result.ketQua === 'DA_DUYET') {
      phatThongBaoGiaMockAnToan({khuVucId: result.khuVucId, giaMoi: result.giaMoi});
    }
    const {nhan: _nhan, ...daDuyet} = result;
    return {...meta, ...daDuyet};
  }

  const res = await duyetDeXuatGiaThat(taoRpcClient(layClient(opts)), deXuatId, params);
  return {...datMeta(null), ...res};
}

export async function tuChoiDeXuatGia(
  deXuatId: number,
  params: TuChoiDeXuatParams = {},
  opts: PricingServiceOptions = {},
): Promise<TuChoiDeXuatGiaResult> {
  kiemTraDeXuatId(deXuatId);

  if (dungMock(opts)) {
    const phien = moPhien(opts);
    const {state, result} = tuChoiDeXuatMock(
      phien.state,
      {
        deXuatId,
        lyDo: params.lyDo ?? null,
        nguoiDung: opts.nguoiDung,
      },
      phien.now,
    );
    if (state !== phien.state) luuPhien(phien, state);
    if ('loi' in result) throw loiMockSangError(result.loi);
    const meta = datMeta(phien.meta);
    if (result.ketQua === 'HET_HAN') {
      const {nhan: _nhan, ...hetHan} = result;
      return {...meta, ...hetHan};
    }
    const {nhan: _nhan, ...daTuChoi} = result;
    return {...meta, ...daTuChoi};
  }

  const res = await tuChoiDeXuatGiaThat(taoRpcClient(layClient(opts)), deXuatId, params);
  return {...datMeta(null), ...res};
}
