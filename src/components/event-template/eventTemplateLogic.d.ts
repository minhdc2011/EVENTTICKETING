export const SALE_STATUS: {
  readonly UPCOMING: 'UPCOMING';
  readonly ON_SALE: 'ON_SALE';
  readonly SOLD_OUT: 'SOLD_OUT';
  readonly CLOSED: 'CLOSED';
};

export function formatMoney(amount: number | null | undefined): string;
export function formatEventDateTime(isoString: string | null | undefined): string;
export function formatDateShort(isoString: string | null | undefined): string;
export function getCategoryLabel(categoryKey: string | null | undefined): string;

export function getSaleStatusMeta(saleStatus: string | null | undefined): {
  label: string;
  tone: 'amber' | 'emerald' | 'rose' | 'slate';
  isLive: boolean;
};

export function resolveEventBackdrop(bannerUrl?: string | null, posterUrl?: string | null): {
  backgroundUrl: string | null;
  hasImage: boolean;
  posterUrl: string | null;
};

export function parseTierBenefits(description?: string | null): string[];

export function calculateCountdown(targetIso: string | null | undefined, now?: Date | number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  isPast: boolean;
  formatted: {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
  };
};

export function determineCountdownTarget(
  event: {
    saleStartsAt?: string;
    saleEndsAt?: string;
    startsAt?: string;
  },
  saleStatus: string,
  now?: Date | number
): {
  targetIso: string | null;
  heading: string;
  description: string;
  isActive: boolean;
};

export function hasAssistAction(event: {
  contactHotline?: string | null;
  contactEmail?: string | null;
  onlineLink?: string | null;
} | null | undefined): boolean;

export function resolveCtaState(params: {
  saleStatus: string;
  selectedTier: {available: number; price: number; name: string} | null;
  hasTiers: boolean;
  hasAssistAction?: boolean;
}): {
  disabled: boolean;
  label: string;
  action:
    | 'none'
    | 'upcoming'
    | 'closed'
    | 'sold_out'
    | 'select_tier'
    | 'tier_sold_out'
    | 'checkout_assist'
    | 'no_assist_channel';
  helperText: string;
};

export function hasMediaContent(event: {trailerUrl?: string; seatingMapUrl?: string}): boolean;
export function hasVenueContent(event: {
  venueName?: string;
  address?: string;
  locationMode?: string;
  onlineLink?: string;
  onlineInstructions?: string;
}): boolean;
export function hasPolicyContent(event: {
  ageRestriction?: string;
  refundPolicy?: string;
  termsAndConditions?: string;
}): boolean;
export function hasContactContent(event: {
  contactEmail?: string;
  contactHotline?: string;
  fanpageUrl?: string;
  permitNumber?: string;
}): boolean;

export function isMachineSloganToken(
  slogan?: string | null,
  category?: string | null
): boolean;

export function normalizeEventSlogan(
  slogan?: string | null,
  category?: string | null
): string | null;

export function resolveHeroCta(
  saleStatus?: string | null,
  isConcert?: boolean
): {
  label: string;
  href: string;
  ariaLabel: string;
};

