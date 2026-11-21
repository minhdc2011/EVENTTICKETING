import type {
  DeXuatGiaItem,
  DuyetDeXuatGiaResult,
  KhuVucDeXuatItem,
  LayDanhSachDeXuatResult,
  TuChoiDeXuatGiaResult,
} from '../../services/pricingService';
import type {
  PricingErrorInfo,
  PricingEventLike,
  PricingOrgLike,
  PricingSession,
} from './pricingPanelController';

export {
  createDialogFocusScope,
  createPricingSession,
  getFocusableElements,
  hasPricingAccess,
  resolveDialogKeyDown,
  runGuarded,
} from './pricingPanelController';

export const TRANG_THAI_CHO_DUYET: 'PENDING';
export const NHAN_KHONG_XAC_DINH: string;

export function formatPriceVnd(value: unknown): string;
export function formatSignedPercent(value: unknown): string;
export function formatFillRate(r: unknown): string;
export function formatVelocityRatio(u: unknown): string;
export function formatHoursRemaining(hours: unknown): string;
export function formatDeadline(value: string | number | Date | null | undefined): string;
export function formatPriceBand(khung: {giaSan: number; giaTran: number} | null | undefined): string;

export const NHAN_CANH_BAO: Readonly<Record<'BINH_THUONG' | 'CHAM_GIA_TRAN' | 'CHAM_GIA_SAN', string>>;
export const NHAN_VUOT_KHUNG: string;
export function labelWarning(loaiCanhBao: string | null | undefined): string;

export interface ProposalWarning {
  ma: string;
  nhan: string;
  muc: 'info' | 'warn';
}
export function buildWarnings(
  dx: Pick<DeXuatGiaItem, 'loaiCanhBao' | 'coCanhBaoVuotKhung'> | null | undefined,
): ProposalWarning[];

export type HuongDoi = 'TANG' | 'GIAM' | 'KHONG_DOI' | 'KHONG_XAC_DINH';
export const NHAN_HUONG_DOI: Readonly<Record<HuongDoi, string>>;
export function computePercentChange(giaHienTai: unknown, giaDeXuat: unknown): number | null;
export function directionOf(giaHienTai: unknown, giaDeXuat: unknown): HuongDoi;
export function resolveVelocityRatio(
  khu: Pick<KhuVucDeXuatItem, 'u'> | null | undefined,
  dx: Pick<DeXuatGiaItem, 'tocDoThucTe' | 'tocDoKyVong'> | null | undefined,
): number | null;
export function resolveFillRate(
  khu: Pick<KhuVucDeXuatItem, 'r'> | null | undefined,
  dx: Pick<DeXuatGiaItem, 'tyLeLapDay'> | null | undefined,
): number | null;
export function isProposalExpired(
  dx: Pick<DeXuatGiaItem, 'hetHanLuc' | 'conHieuLuc'> | null | undefined,
  now?: string | number | Date,
): boolean;

export interface ProposalBand {
  giaSan: number;
  giaTran: number;
}

export interface PriceProposalView {
  deXuatId: number;
  khuVucId: number;
  suatDienId: number;
  maKhuVuc: string | null;
  tenKhuVuc: string | null;
  nhanKhu: string;
  giaHienTai: number | null;
  giaHienHanh: number | null;
  giaDaThayDoi: boolean;
  giaDeXuat: number | null;
  phanTramDoi: number | null;
  huongDoi: HuongDoi;
  nhanHuongDoi: string;
  r: number | null;
  u: number | null;
  tRem: number | null;
  khung: ProposalBand | null;
  hetHanLuc: string | null;
  daQuaHan: boolean;
  conHieuLuc: boolean;
  thoiGianDeXuat: string | null;
  lyDo: string | null;
  loaiCanhBao: string | null;
  coCanhBaoVuotKhung: boolean;
  canhBao: ProposalWarning[];
  canhBaoGiaDoi: string | null;
  canhBaoHetHan: string | null;
  hienThi: {
    giaHienTai: string;
    giaHienHanh: string;
    giaDeXuat: string;
    phanTramDoi: string;
    r: string;
    u: string;
    tRem: string;
    khung: string;
    hetHan: string;
  };
}
export function normalizeProposal(
  khu: KhuVucDeXuatItem,
  dx: DeXuatGiaItem,
  now?: string | number | Date,
): PriceProposalView;
export function normalizeProposals(
  listResult: Pick<LayDanhSachDeXuatResult, 'khuVuc'> | null | undefined,
  now?: string | number | Date,
): PriceProposalView[];

export interface AdjustedPriceFormValues {
  giaDieuChinh: string | number | null | undefined;
  ghiChu: string | null | undefined;
}
export interface AdjustedPriceContext {
  giaSan?: number | null;
  giaTran?: number | null;
  giaHienHanh?: number | null;
  giaHienTai?: number | null;
}
export interface AdjustedPriceErrors {
  giaDieuChinh?: string;
  ghiChu?: string;
  khung?: ProposalBand;
}
export type AdjustedPriceField = 'giaDieuChinh' | 'ghiChu';
export function validateAdjustedPriceForm(
  input: Partial<AdjustedPriceFormValues> | null | undefined,
  context?: AdjustedPriceContext,
): {
  ok: boolean;
  errors: AdjustedPriceErrors;
  firstInvalidField: AdjustedPriceField | null;
  params: {giaDieuChinh: number; ghiChu: string} | null;
};

export const THONG_BAO_HET_HAN: string;
export const THONG_BAO_KHONG_CO_QUYEN: string;

export type ProposalErrorClass =
  | {status: 'forbidden_error'; message: string; canReload: false}
  | {status: 'expired'; message: string; canReload: true}
  | {status: 'conflict'; ma: string | null; message: string; canReload: true; trangThai: string | null}
  | {status: 'out_of_bounds'; ma: string; message: string; canReload: false; khung: ProposalBand | null}
  | {status: 'validation_error'; ma: string | null; message: string; canReload: false}
  | {status: 'error'; message: string; canReload: false};
export function classifyProposalError(error: unknown): ProposalErrorClass;

export interface PriceProposalServices {
  layDanhSachDeXuat(suKienId: number): Promise<LayDanhSachDeXuatResult>;
  duyetDeXuatGia(deXuatId: number, params: {ghiChu?: string; giaDieuChinh?: number}): Promise<DuyetDeXuatGiaResult>;
  tuChoiDeXuatGia(deXuatId: number, params: {lyDo?: string}): Promise<TuChoiDeXuatGiaResult>;
}

type Ctx = {activeOrg: PricingOrgLike; event: PricingEventLike | null | undefined};
type Notify = {onReload?: () => unknown | Promise<unknown>; refreshMetrics?: () => unknown | Promise<unknown>};

export type LoadProposalsOutcome =
  | {
      status: 'ok';
      result: LayDanhSachDeXuatResult;
      proposals: PriceProposalView[];
      meta: {nguon: LayDanhSachDeXuatResult['nguon']; luuTru: LayDanhSachDeXuatResult['luuTru']};
    }
  | {status: 'forbidden'}
  | (Exclude<ProposalErrorClass, {status: 'expired' | 'conflict' | 'out_of_bounds' | 'validation_error'}>)
  | {status: 'stale'}
  | {status: 'busy'};
export function loadPriceProposals(
  session: PricingSession,
  services: Pick<PriceProposalServices, 'layDanhSachDeXuat'>,
  ctx: Ctx & {now?: string | number | Date},
): Promise<LoadProposalsOutcome>;

type Reloaded = {reloaded: boolean; reloadFailed: boolean};
export type ProposalActionOutcome =
  | ({status: 'approved'; result: Extract<DuyetDeXuatGiaResult, {ok: true}>; message: string} & Reloaded)
  | ({status: 'rejected'; result: Extract<TuChoiDeXuatGiaResult, {ok: true}>; message: string} & Reloaded)
  | ({status: 'expired'; message: string; canReload: true; hetHanLuc?: string | null; result?: unknown} & Reloaded)
  | Exclude<ProposalErrorClass, {status: 'expired'}>
  | {status: 'invalid'; errors: AdjustedPriceErrors; firstInvalidField: AdjustedPriceField | null}
  | {status: 'forbidden'}
  | {status: 'no_selection'}
  | {status: 'stale'}
  | {status: 'busy'};

export function approvePriceProposal(
  session: PricingSession,
  services: Pick<PriceProposalServices, 'duyetDeXuatGia'>,
  ctx: Ctx & Notify & {deXuatId: number | null; ghiChu?: string | null},
): Promise<ProposalActionOutcome>;
export function approveAdjustedPriceProposal(
  session: PricingSession,
  services: Pick<PriceProposalServices, 'duyetDeXuatGia'>,
  ctx: Ctx &
    Notify & {
      deXuatId: number | null;
      formValues: Partial<AdjustedPriceFormValues> | null | undefined;
      context?: AdjustedPriceContext;
    },
): Promise<ProposalActionOutcome>;
export function rejectPriceProposal(
  session: PricingSession,
  services: Pick<PriceProposalServices, 'tuChoiDeXuatGia'>,
  ctx: Ctx & Notify & {deXuatId: number | null; lyDo?: string | null},
): Promise<ProposalActionOutcome>;

/** true nếu onReload/refreshMetrics ném lỗi hoặc trả kết quả thất bại (false, {ok:false}, status error/forbidden). */
export function reloadAfter(
  onReload?: (() => unknown) | null,
  refreshMetrics?: (() => unknown) | null,
): Promise<boolean>;

export type {PricingErrorInfo};
