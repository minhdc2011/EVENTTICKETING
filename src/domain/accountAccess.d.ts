export type AccountKind = 'USER' | 'ORGANIZER' | 'ADMIN';
export type AccountPortal = 'BUYER' | 'ORGANIZER';
export type ProfileFailureReason = 'QUERY_ERROR' | 'PROFILE_MISSING' | 'INVALID_KIND';
export type AccessDenialReason = 'WRONG_PORTAL' | ProfileFailureReason;

export interface ProfileQueryResult {
  data?: {LoaiTaiKhoan?: unknown} | null;
  error?: unknown;
}

export type ProfileKindResult =
  | {ok: true; accountKind: AccountKind}
  | {ok: false; reason: ProfileFailureReason};

export type PortalAccessResult =
  | {allowed: true; accountKind: AccountKind}
  | {allowed: false; reason: AccessDenialReason; accountKind: AccountKind | null; message: string};

export interface MockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const ACCOUNT_PORTALS: {readonly BUYER: 'BUYER'; readonly ORGANIZER: 'ORGANIZER'};
export const MOCK_ACCOUNT_PROFILES_KEY: string;

export class AccountAccessError extends Error {
  reason: AccessDenialReason;
  constructor(message: string, reason: AccessDenialReason);
}

export function normalizeAccountKind(raw: unknown): AccountKind | null;
export function resolveProfileAccountKind(result: ProfileQueryResult | null | undefined): ProfileKindResult;
export function canAccessPortal(accountKind: unknown, portal: AccountPortal): boolean;
export function evaluatePortalAccess(
  profileResult: ProfileQueryResult | null | undefined,
  portal: AccountPortal,
): PortalAccessResult;
export function authorizePortalSignIn(args: {
  portal: AccountPortal;
  loadProfile: () => PromiseLike<ProfileQueryResult> | ProfileQueryResult;
  revokeSession?: () => PromiseLike<unknown> | unknown;
}): Promise<AccountKind>;
export function loadPortalSession<T extends {userId: string; email: string}>(args: {
  portal: AccountPortal;
  loadSession: () => PromiseLike<T | null> | T | null;
  loadProfile: (base: T) => PromiseLike<ProfileQueryResult> | ProfileQueryResult;
}): Promise<(T & {accountKind: AccountKind}) | null>;
export function createAuthChangeHandler<S>(args: {
  resolveSession: () => PromiseLike<S | null> | S | null;
  emit: (session: S | null) => void;
  isActive?: () => boolean;
}): AuthChangeHandler;
export interface AuthChangeHandler {
  (rawSession: unknown): Promise<void>;
  invalidate: () => void;
  refresh: () => Promise<void>;
}
export interface AuthAttemptGuard {
  begin: () => () => boolean;
  invalidate: () => void;
}
export function createAuthAttemptGuard(): AuthAttemptGuard;
export function readMockAccountKind(
  storage: Pick<MockStorage, 'getItem'>,
  email: string,
): {data: {LoaiTaiKhoan: string} | null; error: null};
export function registerMockAccount(storage: MockStorage, email: string): void;
