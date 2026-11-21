import type {
  ChayDinhGiaNgayResult,
  DichVuMeta,
  LuuCauHinhGiaParams,
  LuuCauHinhGiaResult,
  MoPhongNhuCauServiceResult,
  SoLieuDinhGiaResult,
  SoLieuDinhGiaRow,
} from '../../services/pricingService';
import type {PricingFieldKey, PricingFormErrors, PricingMembership} from './pricingFormLogic';

export type KichBan = 'ban_nhanh' | 'ban_cham' | 'ban_deu';
export const KICH_BAN_MO_PHONG: KichBan[];
export const NHAN_MO_PHONG_UI: string;

export interface PricingSession {
  readonly epoch: number;
  readonly busy: boolean;
  reset(): void;
  isCurrent(token: number): boolean;
  _setBusy(value: boolean): void;
  _nextSeq(channel: string): number;
  _isLatest(channel: string, seq: number): boolean;
}
export function createPricingSession(): PricingSession;

export interface PricingErrorInfo {
  message: string;
  code: string | null;
}
export function describeError(error: unknown): PricingErrorInfo;

export type GuardedResult<T> =
  | {status: 'ok'; value: T}
  | {status: 'error'; error: PricingErrorInfo}
  | {status: 'stale'}
  | {status: 'busy'};
export function runGuarded<T>(
  session: PricingSession,
  task: () => Promise<T>,
  options?: {exclusive?: boolean; channel?: string},
): Promise<GuardedResult<T>>;

export const FOCUSABLE_SELECTOR: string;
export function getFocusableElements(container: Element | null | undefined): HTMLElement[];

export type DialogKeyAction =
  | {action: 'close'}
  | {action: 'wrap'; target: HTMLElement}
  | {action: 'none'};
export function resolveDialogKeyDown(input: {
  key: string;
  shiftKey?: boolean;
  activeElement: Element | null | undefined;
  dialogElement: HTMLElement;
  focusables?: HTMLElement[];
}): DialogKeyAction;

export interface DialogFocusScope {
  readonly opener: Element | null;
  cleanup(): void;
}
export function createDialogFocusScope(options: {
  dialog: HTMLElement;
  overlay?: HTMLElement;
  ownerDocument?: Document;
  backgroundElements?: HTMLElement[];
}): DialogFocusScope;

export interface PricingServices {
  laySoLieuDinhGia(suKienId: number): Promise<SoLieuDinhGiaResult>;
  luuCauHinhGia(khuVucId: number, params: LuuCauHinhGiaParams): Promise<LuuCauHinhGiaResult>;
  chayDinhGiaNgay(suKienId: number): Promise<ChayDinhGiaNgayResult>;
  moPhongNhuCau(suKienId: number, kichBan: KichBan): Promise<MoPhongNhuCauServiceResult>;
}

export interface PricingEventLike {
  id: number;
  organizationId: string | number | null | undefined;
  moPhong?: boolean;
}
export type PricingOrgLike = PricingMembership | PricingMembership[] | null | undefined;

export function hasPricingAccess(activeOrg: PricingOrgLike, event: PricingEventLike | null | undefined): boolean;
export function isSimulationEnabled(event: {moPhong?: boolean} | null | undefined, rows: SoLieuDinhGiaRow[] | null | undefined): boolean;
export function isSimulatedView(input: {
  meta: Pick<DichVuMeta, 'nguon'> | null | undefined;
  rows: SoLieuDinhGiaRow[] | null | undefined;
  event: {moPhong?: boolean} | null | undefined;
}): boolean;
export function storageWarning(meta: Pick<DichVuMeta, 'luuTru'> | null | undefined): string | null;

export interface SuatGroup {
  suatDienId: number;
  trangThai: string | null;
  thoiGianBatDau: string | null;
  khuVuc: SoLieuDinhGiaRow[];
}
export function groupBySuat(rows: SoLieuDinhGiaRow[]): SuatGroup[];
export function resolveSelection(
  rows: SoLieuDinhGiaRow[],
  previous?: {suatDienId: number | null; khuVucId: number | null} | null,
): {suatDienId: number | null; khuVucId: number | null};
export function findRow(rows: SoLieuDinhGiaRow[], khuVucId: number | null): SoLieuDinhGiaRow | null;

export type PricingFormValues = Record<Exclude<PricingFieldKey, 'trangThaiKichHoat'>, string> & {
  trangThaiKichHoat: boolean;
};
export function buildFormValues(row: SoLieuDinhGiaRow | null): PricingFormValues;
export function emptyFormValues(): PricingFormValues;

export type DuLieuMeta = Pick<DichVuMeta, 'nguon' | 'luuTru'>;
export type LoadMetricsOutcome =
  | {status: 'ok'; rows: SoLieuDinhGiaRow[]; meta: DuLieuMeta}
  | {status: 'forbidden'}
  | {status: 'error'; error: PricingErrorInfo}
  | {status: 'stale'}
  | {status: 'busy'};
export function loadMetrics(
  session: PricingSession,
  services: Pick<PricingServices, 'laySoLieuDinhGia'>,
  ctx: {activeOrg: PricingOrgLike; event: PricingEventLike | null | undefined},
): Promise<LoadMetricsOutcome>;

export interface SaveNotice {
  khongTuApDungGia: true;
  taoMoi: boolean;
  canhBaoNgoaiKhung: Array<{giaHienHanh: number; giaSan: number; giaTran: number}>;
  deXuatHetHieuLuc: number[];
}
export function describeSaveResult(result: {
  taoMoi?: boolean;
  canhBao?: Array<{ma: string; giaHienHanh: number; giaSan: number; giaTran: number}>;
  deXuatHetHieuLuc?: number[];
}): SaveNotice;

export type SaveConfigOutcome =
  | {status: 'saved'; result: Extract<LuuCauHinhGiaResult, {ok: true}>; notice: SaveNotice}
  | {status: 'rejected'; loi: string; truong: string | null}
  | {status: 'invalid'; errors: PricingFormErrors; firstInvalidField: PricingFieldKey}
  | {status: 'forbidden'}
  | {status: 'no_selection'}
  | {status: 'error'; error: PricingErrorInfo}
  | {status: 'stale'}
  | {status: 'busy'};
export function saveConfig(
  session: PricingSession,
  services: Pick<PricingServices, 'luuCauHinhGia'>,
  ctx: {
    activeOrg: PricingOrgLike;
    event: PricingEventLike | null | undefined;
    khuVucId: number | null;
    formValues: unknown;
  },
): Promise<SaveConfigOutcome>;

export interface RunSummary {
  counts: {DA_LUU: number; BO_QUA: number; BI_CHAN: number; LOI: number};
  soDeXuatHetHan: number;
  tong: number;
}
export function summarizeRun(result: Pick<ChayDinhGiaNgayResult, 'theoKhu' | 'hetHan'>): RunSummary;

export type RunNowOutcome =
  | {status: 'done'; result: ChayDinhGiaNgayResult; summary: RunSummary}
  | {status: 'forbidden'}
  | {status: 'error'; error: PricingErrorInfo}
  | {status: 'stale'}
  | {status: 'busy'};
export function runPricingNow(
  session: PricingSession,
  services: Pick<PricingServices, 'chayDinhGiaNgay'>,
  ctx: {activeOrg: PricingOrgLike; event: PricingEventLike | null | undefined},
): Promise<RunNowOutcome>;

export type SimulationOutcome =
  | {status: 'done'; result: MoPhongNhuCauServiceResult}
  | {status: 'forbidden'}
  | {status: 'not_available'}
  | {status: 'invalid_scenario'}
  | {status: 'error'; error: PricingErrorInfo}
  | {status: 'stale'}
  | {status: 'busy'};
export function runSimulation(
  session: PricingSession,
  services: Pick<PricingServices, 'moPhongNhuCau'>,
  ctx: {
    activeOrg: PricingOrgLike;
    event: PricingEventLike | null | undefined;
    rows: SoLieuDinhGiaRow[] | null | undefined;
    kichBan: unknown;
  },
): Promise<SimulationOutcome>;
