import type {LuuCauHinhGiaParams} from '../../services/pricingService';

export type PricingFieldKey = keyof LuuCauHinhGiaParams;

export interface PricingFieldSpec {
  key: Exclude<PricingFieldKey, 'trangThaiKichHoat'>;
  sqlParam: string;
  label: string;
  scale: number;
  max: number;
}

export const PRICING_FIELDS: PricingFieldSpec[];
export const PRICING_ROLES: string[];
export const PRICING_ACCOUNT_KINDS: string[];

export type PricingFormErrors = Partial<Record<PricingFieldKey, string>>;

export type PricingFormResult =
  | {
      ok: true;
      params: LuuCauHinhGiaParams;
      errors: Record<string, never>;
      firstInvalidField: null;
      firstInvalidSqlParam: null;
    }
  | {
      ok: false;
      params: null;
      errors: PricingFormErrors;
      firstInvalidField: PricingFieldKey;
      firstInvalidSqlParam: string;
    };

export function parseStrictNumber(value: unknown): number | null;
export function roundScale(value: number, scale: number): number | null;
export function validatePricingForm(input: unknown): PricingFormResult;

export interface PricingMembership {
  organizationId?: string | number | null;
  ToChucID?: string | number | null;
  role?: string | null;
  VaiTro?: string | null;
  accountKind?: string | null;
  LoaiTaiKhoan?: string | null;
}

export function canManagePricing(
  memberships: PricingMembership | PricingMembership[] | null | undefined,
  eventOrganizationId: string | number | null | undefined,
): boolean;
