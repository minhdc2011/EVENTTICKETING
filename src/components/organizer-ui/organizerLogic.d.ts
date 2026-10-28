export interface DefaultDraftDates {
  startsAt: string;
  endsAt: string;
  saleStartsAt: string;
  saleEndsAt: string;
}

export function getDefaultDraftDates(): DefaultDraftDates;
export function toSlug(value: string): string;
export const ROLE_LABELS: Record<string, string>;
export const CATEGORY_LABELS: Record<string, string>;
export const LOCATION_MODE_LABELS: Record<string, string>;
export const WIZARD_STEP_TITLES: string[];
