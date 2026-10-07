export type CreateDraftInput = {
  organizationId: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  venueName: string;
  address: string;
  startsAt: string;
  endsAt: string;
  saleStartsAt: string;
  saleEndsAt: string;
  price: number;
  capacity: number;
};

export type FullEventTierInput = {
  tierId?: number;
  code: string;
  name: string;
  type?: 'DUNG_STAND' | 'GHE_NGOI';
  price: number;
  capacity: number;
  color?: string;
  benefits?: string;
  minPerOrder?: number;
  maxPerOrder?: number;
};

export type FullEventShowInput = {
  showId?: number;
  slug: string;
  name: string;
  startsAt: string;
  endsAt: string;
  doorsOpenAt?: string;
  saleStartsAt: string;
  saleEndsAt?: string;
  ticketTiers: FullEventTierInput[];
};

export type FullEventAggregateInput = {
  eventId?: number;
  organizationId: string;
  name: string;
  slug: string;
  category: string;
  slogan?: string;
  description?: string;
  locationMode: 'OFFLINE' | 'ONLINE' | 'HYBRID' | 'TBA';
  venueName?: string;
  address?: string;
  onlineLink?: string;
  onlineInstructions?: string;
  bannerUrl?: string;
  posterUrl?: string;
  trailerUrl?: string;
  seatingMapUrl?: string;
  ageRestriction?: string;
  refundPolicy?: string;
  termsAndConditions?: string;
  contactEmail?: string;
  contactHotline?: string;
  fanpageUrl?: string;
  permitNumber?: string;
  shows: FullEventShowInput[];
};

export type PublishReadinessResult = {
  isReady: boolean;
  blockers: {field: string; message: string}[];
  warnings: {field: string; message: string}[];
};

export const VALID_CATEGORIES: readonly string[];
export const VALID_LOCATION_MODES: readonly string[];

export const ACCOUNT_KINDS: {
  readonly USER: 'USER';
  readonly ORGANIZER: 'ORGANIZER';
  readonly ADMIN: 'ADMIN';
};

export function isOrganizerAccount(accountKind?: string | null): boolean;
export function isOrganizerEditorRole(role?: string): boolean;
export function filterEventsByOrganization<T extends {organizationId: string}>(
  events: T[],
  organizationId?: string | null,
): T[];
export function canManageOrganizationEvents(membership?: {role?: string} | null): boolean;
export function getActiveOrgStorageKey(userId?: string | null): string | null;
export function resolveActiveOrganizationId<T extends {organizationId: string}>(
  memberships: T[],
  candidateOrgId?: string | null,
): string | null;
export function loadSavedActiveOrganizationId(
  userId?: string | null,
  storage?: {getItem(key: string): string | null} | null,
): string | null;
export function saveActiveOrganizationId(
  userId?: string | null,
  organizationId?: string | null,
  storage?: {setItem(key: string, value: string): void; removeItem(key: string): void} | null,
): void;
export function validateOrganizationInput(name: string, slug: string): {trimmedName: string; trimmedSlug: string};
export function validateEventDraftInput(input: CreateDraftInput): void;
export function validateFullEventAggregate(input: FullEventAggregateInput, options?: {isPublishing?: boolean}): void;
export function evaluatePublishReadiness(aggregate: FullEventAggregateInput): PublishReadinessResult;
export function isValidUrl(value?: string | null): boolean;
export function isValidHttpsUrl(value?: string | null): boolean;
export function isValidEmail(value?: string | null): boolean;
export function isValidPhone(value?: string | null): boolean;
export function mapAuthError(error: unknown): Error;
export function mapDatabaseError(error: unknown): Error;
