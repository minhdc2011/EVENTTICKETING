export interface PricingRule {
  basePrice: number | null;
  floor: number | null;
  ceiling: number | null;
  step?: number;
  maxChange?: number;
  lowFill?: number;
  highFill?: number;
  wFill?: number;
  wVelocity?: number;
  wTime?: number;
  active?: boolean;
}

export const PRICING_DEFAULTS: Readonly<{
  maxChange: number;
  step: number;
  lowFill: number;
  highFill: number;
  wFill: number;
  wVelocity: number;
  wTime: number;
}>;

export type PricingAlertType = 'BINH_THUONG' | 'CHAM_GIA_TRAN' | 'CHAM_GIA_SAN';

export type PricingSkipReason =
  | 'DU_LIEU_KHONG_HOP_LE'
  | 'DU_LIEU_TOC_DO_KHONG_HOP_LE'
  | 'THIEU_DU_LIEU_TOC_DO'
  | 'TRAN_SO_KHI_TINH'
  | 'KHONG_CO_GHE'
  | 'QUY_TAC_KHONG_KICH_HOAT'
  | 'CHENH_LECH_DUOI_BUOC_NHAY'
  | 'DA_CO_DE_XUAT_PENDING';

export type PricingWarning =
  | 'KHONG_CO_TOC_DO_KY_VONG'
  | 'KHONG_CO_SO_LIEU_TOC_DO'
  | 'SAN_BANG_TRAN'
  | 'GIA_HIEN_HANH_NGOAI_KHUNG'
  | 'VUOT_BIEN_DO_SAU_LAM_TRON_HOAC_CHAN';

export interface PricingInput {
  rule: Partial<PricingRule> | null | undefined;
  currentPrice: unknown;
  totalSeats: unknown;
  soldSeats: unknown;
  heldSeats?: unknown;
  hoursRemaining: unknown;
  velocityRatio?: unknown;
  /**
   * Có nhưng không phải số hữu hạn ≥ 0 thì bỏ qua (DU_LIEU_TOC_DO_KHONG_HOP_LE) ở mọi nhánh.
   * Không có velocityRatio hợp lệ mà thiếu targetVelocity, hoặc targetVelocity > 0 thiếu actualVelocity
   * (null/undefined/'') thì bỏ qua (THIEU_DU_LIEU_TOC_DO). targetVelocity = 0 là số hợp lệ, khác thiếu.
   */
  actualVelocity?: unknown;
  targetVelocity?: unknown;
  hasPendingProposal?: boolean;
}

/** Giá trị trung gian là số thực thật, không làm tròn (chỉ làm tròn theo S ở roundedPrice). */
export interface PricingIntermediate {
  fillRate: number | null;
  u: number | null;
  deltaFill: number | null;
  deltaVelocity: number | null;
  deltaTime: number | null;
  deltaTotal: number | null;
  rawPrice: number | null;
  boundedPrice: number | null;
  roundedPrice: number | null;
}

export interface PriceProposalResult {
  shouldPropose: boolean;
  skipReasons: PricingSkipReason[];
  warnings: PricingWarning[];
  intermediate: PricingIntermediate;
  proposedPrice: number | null;
  alertType: PricingAlertType;
  outOfRangeClamped: boolean;
  changeRatio: number | null;
  exceedsMaxChange: boolean;
}

export function ruleFromQuyTacGia(row: Record<string, unknown> | null | undefined): PricingRule;
export function fillRate(totalSeats: unknown, soldSeats: unknown, heldSeats?: unknown): number | null;
export function deltaFill(r: number, lowFill?: number, highFill?: number): number;
export function deltaVelocity(u: number): number;
export function deltaTime(hoursRemaining: number, r: number): number;
export function computePriceProposal(input: PricingInput | null | undefined): PriceProposalResult;
