import type {
  PurchaseConfigFieldErrors,
  PurchaseConfigInput,
  PurchaseConfigRead,
  PurchaseConfigSaveResult,
} from '../../services/purchaseConfigService';
import type {PricingMembership} from './pricingFormLogic';

export {
  DEFAULT_SO_VE_TOI_DA,
  DEFAULT_YEU_CAU_OTP,
  MAX_SO_VE_TOI_DA,
  MIN_SO_VE_TOI_DA,
  PurchaseConfigError,
  canManagePurchaseConfig,
  validatePurchaseConfigInput,
} from '../../services/purchaseConfigService';
export {
  NHAN_MO_PHONG_UI,
  createDialogFocusScope,
  getFocusableElements,
  resolveDialogKeyDown,
} from './pricingPanelController';
export type {DialogFocusScope, DialogKeyAction} from './pricingPanelController';

export const THONG_BAO_AP_DUNG_SAU: string;

export interface PurchaseConfigSession {
  readonly epoch: number;
  readonly busy: boolean;
  reset(): void;
  isCurrent(token: number): boolean;
  _setBusy(value: boolean): void;
  _nextSeq(channel: string): number;
  _isLatest(channel: string, seq: number): boolean;
}
export function createPurchaseConfigSession(): PurchaseConfigSession;

export interface PurchaseConfigServices {
  docCauHinhMuaVe(suKienId: number | string): Promise<PurchaseConfigRead>;
  luuCauHinhMuaVe(suKienId: number | string, input: unknown): Promise<PurchaseConfigSaveResult>;
}

export interface PurchaseConfigEventLike {
  id: number | string;
  organizationId: string | number | null | undefined;
  moPhong?: boolean;
}
export type PurchaseConfigOrgLike = PricingMembership | PricingMembership[] | null | undefined;

export type PurchaseConfigFieldKey = 'soVeToiDaMoiDon' | 'yeuCauXacMinhOtp';
export interface PurchaseConfigFormValues {
  soVeToiDaMoiDon: string;
  yeuCauXacMinhOtp: boolean;
}
export interface PurchaseConfigSavedValue {
  soVeToiDaMoiDon: number;
  yeuCauXacMinhOtp: boolean;
}

export function hasPurchaseConfigAccess(
  activeOrg: PurchaseConfigOrgLike,
  event: PurchaseConfigEventLike | null | undefined,
): boolean;

export function isSimulatedPurchaseConfig(input?: {
  config?: {moPhong?: boolean; nguon?: string} | null;
  saveResult?: {moPhong?: boolean; nguon?: string} | null;
  event?: {moPhong?: boolean} | null;
}): boolean;

export function buildPurchaseConfigFormValues(
  config: Partial<PurchaseConfigSavedValue> | null | undefined,
): PurchaseConfigFormValues;

export interface PurchaseConfigFormValidation {
  ok: boolean;
  value: PurchaseConfigInput | null;
  errors: PurchaseConfigFieldErrors;
  firstInvalidField: PurchaseConfigFieldKey | null;
}
export function validatePurchaseConfigForm(formValues: unknown): PurchaseConfigFormValidation;

export type PurchaseConfigErrorKind =
  | 'KHONG_CO_QUYEN'
  | 'CAN_DANG_NHAP'
  | 'KHONG_HOP_LE'
  | 'SU_KIEN_KHONG_TON_TAI'
  | 'LOI_DOC'
  | 'LOI_LUU';
export interface ClassifiedPurchaseConfigError {
  code: PurchaseConfigErrorKind | string;
  message: string;
  fieldErrors: Partial<Record<PurchaseConfigFieldKey, string>>;
  retryable: boolean;
}
export function classifyPurchaseConfigError(
  error: unknown,
  fallback?: 'LOI_DOC' | 'LOI_LUU',
): ClassifiedPurchaseConfigError;

export type LoadPurchaseConfigOutcome =
  | {status: 'ok'; config: PurchaseConfigRead; formValues: PurchaseConfigFormValues; simulated: boolean}
  | {status: 'forbidden'}
  | {status: 'error'; error: ClassifiedPurchaseConfigError}
  | {status: 'stale'};
export function loadPurchaseConfig(
  session: PurchaseConfigSession,
  services: Pick<PurchaseConfigServices, 'docCauHinhMuaVe'>,
  ctx: {activeOrg: PurchaseConfigOrgLike; event: PurchaseConfigEventLike | null | undefined},
): Promise<LoadPurchaseConfigOutcome>;

export type SavePurchaseConfigOutcome =
  | {
      status: 'saved';
      result: PurchaseConfigSaveResult;
      config: PurchaseConfigSavedValue;
      formValues: PurchaseConfigFormValues;
      simulated: boolean;
      message: string;
    }
  | {status: 'invalid'; errors: PurchaseConfigFieldErrors; firstInvalidField: PurchaseConfigFieldKey | null}
  | {status: 'forbidden'}
  | {status: 'error'; error: ClassifiedPurchaseConfigError; fieldErrors: ClassifiedPurchaseConfigError['fieldErrors']}
  | {status: 'stale'}
  | {status: 'busy'};
export function savePurchaseConfig(
  session: PurchaseConfigSession,
  services: Pick<PurchaseConfigServices, 'luuCauHinhMuaVe'>,
  ctx: {
    activeOrg: PurchaseConfigOrgLike;
    event: PurchaseConfigEventLike | null | undefined;
    formValues: unknown;
  },
): Promise<SavePurchaseConfigOutcome>;
