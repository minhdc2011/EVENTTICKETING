export const ACCOUNT_PORTALS = {BUYER: 'BUYER', ORGANIZER: 'ORGANIZER'};

export const MOCK_ACCOUNT_PROFILES_KEY = 'eventticketing:mock-account-profiles';

const KNOWN_KINDS = ['USER', 'ORGANIZER', 'ADMIN'];
const PORTAL_KINDS = {
  BUYER: ['USER', 'ADMIN'],
  ORGANIZER: ['ORGANIZER', 'ADMIN'],
};
const MOCK_SEED_PROFILES = {'organizer@demo.vn': 'ORGANIZER', 'buyer@demo.vn': 'USER'};

const VERIFY_MESSAGE = 'Không thể xác minh loại tài khoản. Vui lòng thử lại hoặc liên hệ hỗ trợ.';
const MESSAGES = {
  QUERY_ERROR: VERIFY_MESSAGE,
  PROFILE_MISSING: 'Không tìm thấy hồ sơ tài khoản. Vui lòng thử lại hoặc liên hệ hỗ trợ.',
  INVALID_KIND: 'Loại tài khoản không hợp lệ. Vui lòng liên hệ hỗ trợ.',
  WRONG_PORTAL_BUYER:
    'Tài khoản Ban tổ chức không đăng nhập tại cổng người mua vé. Vui lòng đăng nhập tại Cổng Ban tổ chức (/organizer/login).',
  WRONG_PORTAL_ORGANIZER:
    'Tài khoản người mua vé không có quyền vào Cổng Ban tổ chức. Vui lòng đăng nhập tại trang người mua vé (/login).',
};

export class AccountAccessError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = 'AccountAccessError';
    this.reason = reason;
  }
}

export function normalizeAccountKind(raw) {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toUpperCase();
  return KNOWN_KINDS.includes(normalized) ? normalized : null;
}

export function resolveProfileAccountKind(result) {
  const {data, error} = result || {};
  if (error) return {ok: false, reason: 'QUERY_ERROR'};
  if (!data || typeof data !== 'object') return {ok: false, reason: 'PROFILE_MISSING'};
  const accountKind = normalizeAccountKind(data.LoaiTaiKhoan);
  if (!accountKind) return {ok: false, reason: 'INVALID_KIND'};
  return {ok: true, accountKind};
}

export function canAccessPortal(accountKind, portal) {
  const kind = normalizeAccountKind(accountKind);
  const allowed = PORTAL_KINDS[portal];
  return Boolean(kind && allowed && allowed.includes(kind));
}

export function evaluatePortalAccess(profileResult, portal) {
  const resolved = resolveProfileAccountKind(profileResult);
  if (!resolved.ok) {
    return {allowed: false, reason: resolved.reason, accountKind: null, message: MESSAGES[resolved.reason]};
  }
  const {accountKind} = resolved;
  if (canAccessPortal(accountKind, portal)) return {allowed: true, accountKind};
  const message = portal === ACCOUNT_PORTALS.BUYER ? MESSAGES.WRONG_PORTAL_BUYER : MESSAGES.WRONG_PORTAL_ORGANIZER;
  return {allowed: false, reason: 'WRONG_PORTAL', accountKind, message};
}

export async function authorizePortalSignIn({portal, loadProfile, revokeSession}) {
  let profileResult;
  try {
    profileResult = await loadProfile();
  } catch {
    profileResult = {data: null, error: new Error('PROFILE_LOAD_FAILED')};
  }
  const decision = evaluatePortalAccess(profileResult, portal);
  if (decision.allowed) return decision.accountKind;
  try {
    await revokeSession?.();
  } catch {
    // Keep the original denial; revoke failures must not mask it.
  }
  throw new AccountAccessError(decision.message, decision.reason);
}

export async function loadPortalSession({portal, loadSession, loadProfile}) {
  try {
    const base = await loadSession();
    if (!base) return null;
    const decision = evaluatePortalAccess(await loadProfile(base), portal);
    return decision.allowed ? {...base, accountKind: decision.accountKind} : null;
  } catch {
    return null;
  }
}

export function createAuthChangeHandler({resolveSession, emit, isActive = () => true}) {
  let generation = 0;
  async function handleAuthChange(rawSession) {
    const current = ++generation;
    if (!rawSession) {
      if (isActive()) emit(null);
      return;
    }
    let session = null;
    try {
      session = await resolveSession();
    } catch {
      session = null;
    }
    if (current !== generation || !isActive()) return;
    const rawUserId = rawSession && rawSession.user && rawSession.user.id;
    if (session && rawUserId && session.userId !== rawUserId) {
      emit(null);
      return;
    }
    emit(session || null);
  }
  // Drops any resolve still in flight (sign-out, unsubscribe, account switch).
  handleAuthChange.invalidate = () => {
    generation += 1;
  };
  // Re-reads the session through the same versioned path (no raw session id to compare).
  handleAuthChange.refresh = () => handleAuthChange({});
  return handleAuthChange;
}

// Per-attempt token: begin() returns isCurrent(), invalidate() makes every earlier attempt stale.
export function createAuthAttemptGuard() {
  let attempt = 0;
  return {
    begin() {
      const mine = ++attempt;
      return () => mine === attempt;
    },
    invalidate() {
      attempt += 1;
    },
  };
}

function readProfiles(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(MOCK_ACCOUNT_PROFILES_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function readMockAccountKind(storage, email) {
  const key = normalizeEmail(email);
  const stored = readProfiles(storage);
  const kind = Object.prototype.hasOwnProperty.call(stored, key)
    ? stored[key]
    : Object.prototype.hasOwnProperty.call(MOCK_SEED_PROFILES, key)
      ? MOCK_SEED_PROFILES[key]
      : null;
  return {data: kind === null ? null : {LoaiTaiKhoan: kind}, error: null};
}

export function registerMockAccount(storage, email) {
  const key = normalizeEmail(email);
  if (!key) return;
  const profiles = readProfiles(storage);
  if (Object.prototype.hasOwnProperty.call(profiles, key)) return;
  if (Object.prototype.hasOwnProperty.call(MOCK_SEED_PROFILES, key)) return;
  profiles[key] = 'USER';
  storage.setItem(MOCK_ACCOUNT_PROFILES_KEY, JSON.stringify(profiles));
}
