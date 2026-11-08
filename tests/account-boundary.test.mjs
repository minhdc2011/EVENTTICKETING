import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  ACCOUNT_PORTALS,
  canAccessPortal,
  createAuthAttemptGuard,
  createAuthChangeHandler,
  evaluatePortalAccess,
  loadPortalSession,
} from '../src/domain/accountAccess.js';
import {
  ACCOUNT_KINDS,
  canManageOrganizationEvents,
  evaluatePublishReadiness,
  isOrganizerAccount,
  isOrganizerEditorRole,
  mapAuthError,
  mapDatabaseError,
  validateEventDraftInput,
  validateFullEventAggregate,
  validateOrganizationInput,
} from '../src/domain/organizerValidation.js';
import {buildPublicPath, resolvePublicRoute} from '../src/domain/publicRoute.js';

test('isOrganizerAccount and ACCOUNT_KINDS enforce strict account classification', () => {
  assert.equal(ACCOUNT_KINDS.USER, 'USER');
  assert.equal(ACCOUNT_KINDS.ORGANIZER, 'ORGANIZER');
  assert.equal(ACCOUNT_KINDS.ADMIN, 'ADMIN');

  // Organizers and Admins are recognized
  assert.equal(isOrganizerAccount('ORGANIZER'), true);
  assert.equal(isOrganizerAccount('organizer'), true);
  assert.equal(isOrganizerAccount('ADMIN'), true);
  assert.equal(isOrganizerAccount('admin'), true);

  // Pure buyers, non-organizers, and invalid inputs are denied
  assert.equal(isOrganizerAccount('USER'), false);
  assert.equal(isOrganizerAccount('user'), false);
  assert.equal(isOrganizerAccount('SCANNER'), false);
  assert.equal(isOrganizerAccount('BUYER'), false);
  assert.equal(isOrganizerAccount(''), false);
  assert.equal(isOrganizerAccount(null), false);
  assert.equal(isOrganizerAccount(undefined), false);
});

test('mapDatabaseError correctly passes through descriptive account boundary messages', () => {
  // Explicit 42501 error message from organizer boundary RPC
  const errOrgOnly = mapDatabaseError({
    code: '42501',
    message: 'Chi tai khoan Ban to chuc moi co the tao to chuc',
  });
  assert.equal(errOrgOnly.message, 'Chi tai khoan Ban to chuc moi co the tao to chuc');

  // Explicit 42501 error message from self-promotion trigger
  const errNoSelfPromote = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen tu y thay doi loai tai khoan',
  });
  assert.equal(errNoSelfPromote.message, 'Khong co quyen tu y thay doi loai tai khoan');

  // Explicit 42501 error message for unauthenticated organization creation
  const errUnauthOrg = mapDatabaseError({
    code: '42501',
    message: 'Can dang nhap de tao to chuc',
  });
  assert.equal(errUnauthOrg.message, 'Can dang nhap de tao to chuc');

  // Explicit 42501 error messages for editor delegation
  const errEventCreate = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen tao su kien cho to chuc nay',
  });
  assert.equal(errEventCreate.message, 'Khong co quyen tao su kien cho to chuc nay');

  const errEventEdit = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen bien tap su kien cua to chuc',
  });
  assert.equal(errEventEdit.message, 'Khong co quyen bien tap su kien cua to chuc');

  const errEventPublish = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen cong bo su kien',
  });
  assert.equal(errEventPublish.message, 'Khong co quyen cong bo su kien');

  // Explicit 42501 error messages for anti-disclosure protection
  const errRoleDisclosure = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen xem loai tai khoan cua nguoi dung khac',
  });
  assert.equal(errRoleDisclosure.message, 'Khong co quyen xem loai tai khoan cua nguoi dung khac');

  const errPermDisclosure = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen kiem tra phan quyen cua nguoi dung khac',
  });
  assert.equal(errPermDisclosure.message, 'Khong co quyen kiem tra phan quyen cua nguoi dung khac');

  // Generic 42501 falls back to standard Vietnamese error
  const errGeneric = mapDatabaseError({code: '42501'});
  assert.equal(errGeneric.message, 'Bạn không có quyền thực hiện thao tác này.');
});

test('capability matrix: buyer/USER authentication and public event access invariants', () => {
  // 1. Account classification: USER is purely buyer-oriented
  const buyerAccountKind = ACCOUNT_KINDS.USER;
  assert.equal(isOrganizerAccount(buyerAccountKind), false);
  assert.equal(isOrganizerEditorRole(buyerAccountKind), false);

  // 2. Route resolution: Buyer authentication entry points are cleanly distinguished
  const loginRoute = resolvePublicRoute('/login', 'sample-event');
  assert.deepEqual(loginRoute, {kind: 'account', page: 'login'});

  const registerRoute = resolvePublicRoute('/register', 'sample-event');
  assert.deepEqual(registerRoute, {kind: 'account', page: 'register'});

  const accountRoute = resolvePublicRoute('/account', 'sample-event');
  assert.deepEqual(accountRoute, {kind: 'account', page: 'overview'});

  // 3. Buyer event access: Buyers can reach catalog and event details without organizer permissions
  const catalogRoute = resolvePublicRoute('/events', 'sample-event');
  assert.deepEqual(catalogRoute, {kind: 'catalog'});

  const eventDetailRoute = resolvePublicRoute('/events/rock-concert-2026', 'sample-event');
  assert.deepEqual(eventDetailRoute, {kind: 'detail', eventSlug: 'rock-concert-2026'});

  // 4. Public links generated stably
  assert.equal(buildPublicPath('/', 'login'), '/?route=/login');
  assert.equal(buildPublicPath('/', 'register'), '/?route=/register');
  assert.equal(buildPublicPath('/', 'events'), '/?route=/events');

  // 5. Auth error mapping for buyer operations
  const invalidCreds = mapAuthError({message: 'Invalid login credentials'});
  assert.match(invalidCreds.message, /Email hoặc mật khẩu không chính xác/);

  const existingEmail = mapAuthError({message: 'User already registered'});
  assert.match(existingEmail.message, /Email này đã được đăng ký tài khoản/);
});

test('capability matrix: explicit denial of organizer operations for USER accounts', () => {
  const buyerKind = 'USER';
  assert.equal(isOrganizerAccount(buyerKind), false);

  // 1. Organization onboarding entry point denies USER accounts
  // In the application layer, OrganizerPortal gates access via isOrganizerAccount:
  const canAccessOrganizerStudio = isOrganizerAccount(buyerKind);
  assert.equal(canAccessOrganizerStudio, false, 'USER accounts must be denied access to Organizer Studio');

  // 2. Database level explicit denial: tao_to_chuc_cua_toi raises 42501 for USER
  const orgCreationDenial = mapDatabaseError({
    code: '42501',
    message: 'Chi tai khoan Ban to chuc moi co the tao to chuc',
  });
  assert.equal(orgCreationDenial.message, 'Chi tai khoan Ban to chuc moi co the tao to chuc');

  // 3. Delegation helper denial: USER accounts cannot edit or create events
  assert.equal(canManageOrganizationEvents({role: 'USER'}), false);
  assert.equal(isOrganizerEditorRole('USER'), false);

  const eventCreationDenial = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen tao su kien cho to chuc nay',
  });
  assert.equal(eventCreationDenial.message, 'Khong co quyen tao su kien cho to chuc nay');

  const eventEditDenial = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen bien tap su kien cua to chuc',
  });
  assert.equal(eventEditDenial.message, 'Khong co quyen bien tap su kien cua to chuc');

  const eventPublishDenial = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen cong bo su kien',
  });
  assert.equal(eventPublishDenial.message, 'Khong co quyen cong bo su kien');

  // 4. Self-promotion prevention: Client cannot upgrade own LoaiTaiKhoan
  const selfPromoteDenial = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen tu y thay doi loai tai khoan',
  });
  assert.equal(selfPromoteDenial.message, 'Khong co quyen tu y thay doi loai tai khoan');

  // 5. Anti-disclosure protection: USER cannot probe other users' account classification
  const probeDenial = mapDatabaseError({
    code: '42501',
    message: 'Khong co quyen xem loai tai khoan cua nguoi dung khac',
  });
  assert.equal(probeDenial.message, 'Khong co quyen xem loai tai khoan cua nguoi dung khac');
});

test('capability matrix: ORGANIZER authentication, onboarding entry point, and management capabilities', () => {
  // 1. ORGANIZER and ADMIN accounts pass account classification
  assert.equal(isOrganizerAccount(ACCOUNT_KINDS.ORGANIZER), true);
  assert.equal(isOrganizerAccount(ACCOUNT_KINDS.ADMIN), true);

  // 2. Organizer route resolution
  assert.deepEqual(resolvePublicRoute('/organizer', 'fallback'), {
    kind: 'organizer',
    page: 'dashboard',
  });
  assert.deepEqual(resolvePublicRoute('/organizer/login', 'fallback'), {
    kind: 'organizer',
    page: 'login',
  });

  // 3. Organization onboarding validation (entry point for organizers with no org)
  const validOrg = validateOrganizationInput('Gamma Entertainment', 'gamma-entertainment');
  assert.equal(validOrg.trimmedName, 'Gamma Entertainment');
  assert.equal(validOrg.trimmedSlug, 'gamma-entertainment');

  assert.throws(
    () => validateOrganizationInput('AB', 'ab-corp'),
    /Tên tổ chức phải có tối thiểu 3 ký tự/,
  );
  assert.throws(
    () => validateOrganizationInput('Valid Name', 'invalid slug with spaces'),
    /Slug tổ chức chỉ được chứa chữ thường/,
  );

  // 4. Role-based event management permissions
  // Editors/Owners/Admins can manage
  assert.equal(canManageOrganizationEvents({role: 'CHU_SO_HUU'}), true);
  assert.equal(canManageOrganizationEvents({role: 'QUAN_TRI'}), true);
  assert.equal(canManageOrganizationEvents({role: 'BIEN_TAP'}), true);

  // Read-only/Scanner roles cannot manage
  assert.equal(canManageOrganizationEvents({role: 'VAN_HANH'}), false);
  assert.equal(canManageOrganizationEvents({role: 'SOAT_VE'}), false);
  assert.equal(canManageOrganizationEvents(null), false);

  // 5. Draft event creation input validation
  const validDraftInput = {
    organizationId: '11111111-0000-0000-0000-000000000001',
    name: 'Festival Âm Nhạc 2026',
    slug: 'festival-am-nhac-2026',
    description: 'Lễ hội âm nhạc mùa hè.',
    category: 'AM_NHAC',
    venueName: 'Trung tâm Hội nghị Quốc gia',
    address: 'Đại lộ Thăng Long, Hà Nội',
    startsAt: '2026-11-20T19:30:00.000Z',
    endsAt: '2026-11-20T22:30:00.000Z',
    saleStartsAt: '2026-10-15T09:00:00.000Z',
    saleEndsAt: '2026-11-20T18:00:00.000Z',
    price: 350000,
    capacity: 1000,
  };
  assert.doesNotThrow(() => validateEventDraftInput(validDraftInput));

  // 6. Full event aggregate validation and readiness checks
  const validAggregate = {
    organizationId: '11111111-0000-0000-0000-000000000001',
    name: 'Festival Âm Nhạc 2026',
    slug: 'festival-am-nhac-2026',
    category: 'AM_NHAC',
    description: 'Mô tả chi tiết lễ hội âm nhạc đỉnh cao năm 2026 với sự góp mặt của nhiều nghệ sĩ.',
    locationMode: 'OFFLINE',
    venueName: 'Sân vận động Mỹ Đình',
    address: 'Đường Lê Đức Thọ, Nam Từ Liêm, Hà Nội',
    bannerUrl: 'https://images.unsplash.com/photo-festival.jpg',
    contactEmail: 'contact@festival.vn',
    contactHotline: '0901234567',
    refundPolicy: 'Chính sách hoàn hủy chi tiết theo quy định của ban tổ chức.',
    shows: [
      {
        slug: 'suat-1',
        name: 'Đêm diễn 1',
        startsAt: '2026-11-20T19:30:00.000Z',
        endsAt: '2026-11-20T22:30:00.000Z',
        saleStartsAt: '2026-10-15T09:00:00.000Z',
        saleEndsAt: '2026-11-20T18:00:00.000Z',
        ticketTiers: [
          {
            code: 'GA',
            name: 'Vé tiêu chuẩn',
            type: 'DUNG_STAND',
            price: 350000,
            capacity: 1000,
          },
        ],
      },
    ],
  };

  assert.doesNotThrow(() => validateFullEventAggregate(validAggregate, {isPublishing: false}));
  const readiness = evaluatePublishReadiness(validAggregate);
  assert.equal(readiness.isReady, true);
  assert.equal(readiness.blockers.length, 0);
});

test('portal access matrix: USER->BUYER allowed, USER->ORGANIZER denied, ORGANIZER reverse, ADMIN both', () => {
  assert.equal(canAccessPortal('USER', ACCOUNT_PORTALS.BUYER), true);
  assert.equal(canAccessPortal('USER', ACCOUNT_PORTALS.ORGANIZER), false);
  assert.equal(canAccessPortal('ORGANIZER', ACCOUNT_PORTALS.BUYER), false);
  assert.equal(canAccessPortal('ORGANIZER', ACCOUNT_PORTALS.ORGANIZER), true);
  assert.equal(canAccessPortal('ADMIN', ACCOUNT_PORTALS.BUYER), true);
  assert.equal(canAccessPortal('ADMIN', ACCOUNT_PORTALS.ORGANIZER), true);

  const makeProfile = (kind) => ({data: {LoaiTaiKhoan: kind}, error: null});
  assert.equal(evaluatePortalAccess(makeProfile('USER'), ACCOUNT_PORTALS.BUYER).allowed, true);
  assert.equal(evaluatePortalAccess(makeProfile('USER'), ACCOUNT_PORTALS.ORGANIZER).allowed, false);
  assert.equal(evaluatePortalAccess(makeProfile('ORGANIZER'), ACCOUNT_PORTALS.BUYER).allowed, false);
  assert.equal(evaluatePortalAccess(makeProfile('ORGANIZER'), ACCOUNT_PORTALS.ORGANIZER).allowed, true);
  assert.equal(evaluatePortalAccess(makeProfile('ADMIN'), ACCOUNT_PORTALS.BUYER).allowed, true);
  assert.equal(evaluatePortalAccess(makeProfile('ADMIN'), ACCOUNT_PORTALS.ORGANIZER).allowed, true);
});

test('static check: services do not infer kind from email substring or default to USER', async () => {
  const buyerService = await readFile('src/services/buyerAuthService.ts', 'utf8');
  const orgService = await readFile('src/services/organizerService.ts', 'utf8');
  assert.ok(!buyerService.includes("includes('buyer')"), 'buyerAuthService must not include includes("buyer")');
  assert.ok(!orgService.includes("includes('buyer')"), 'organizerService must not include includes("buyer")');
  assert.ok(!buyerService.includes("let accountKind = 'USER'"), 'buyerAuthService must not contain let accountKind = USER');
  assert.ok(!orgService.includes("let accountKind = 'USER'"), 'organizerService must not contain let accountKind = USER');
});

test('static check: organizerService uses loadPortalSession and createAuthChangeHandler without unsafe fallback', async () => {
  const orgService = await readFile('src/services/organizerService.ts', 'utf8');
  assert.ok(orgService.includes('loadPortalSession'), 'organizerService must use loadPortalSession');
  assert.ok(orgService.includes('createAuthChangeHandler'), 'organizerService must use createAuthChangeHandler');
  assert.ok(
    !orgService.includes('accountKind = resolved.ok ? resolved.accountKind : undefined'),
    'organizerService must not use undefined accountKind fallback',
  );
});

test('static check: buyerAuthService uses loadPortalSession and createAuthChangeHandler', async () => {
  const buyerService = await readFile('src/services/buyerAuthService.ts', 'utf8');
  assert.ok(buyerService.includes('loadPortalSession'), 'buyerAuthService must use loadPortalSession');
  assert.ok(buyerService.includes('createAuthChangeHandler'), 'buyerAuthService must use createAuthChangeHandler');
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return {promise, resolve};
}

test('auth handler: a stale resolve after invalidate or sign-out emits nothing', async () => {
  const slow = deferred();
  const emitted = [];
  const handle = createAuthChangeHandler({resolveSession: () => slow.promise, emit: (s) => emitted.push(s)});

  const pending = handle({user: {id: 'u1'}});
  handle.invalidate();
  slow.resolve({userId: 'u1', email: 'a@b.vn', accountKind: 'USER'});
  await pending;
  assert.deepEqual(emitted, []);

  const slow2 = deferred();
  const emitted2 = [];
  const handle2 = createAuthChangeHandler({resolveSession: () => slow2.promise, emit: (s) => emitted2.push(s)});
  const pending2 = handle2({user: {id: 'u1'}});
  await handle2(null); // sign-out lands while the read is in flight
  slow2.resolve({userId: 'u1', email: 'a@b.vn', accountKind: 'USER'});
  await pending2;
  assert.deepEqual(emitted2, [null]);
});

test('auth handler: inactive subscriptions never emit', async () => {
  let active = true;
  const emitted = [];
  const handle = createAuthChangeHandler({
    resolveSession: async () => ({userId: 'u1', email: 'a@b.vn'}),
    emit: (s) => emitted.push(s),
    isActive: () => active,
  });
  const pending = handle({});
  active = false;
  await pending;
  await handle(null);
  assert.deepEqual(emitted, []);
});

test('auth handler: account switch (userId mismatch) emits null, matching id emits the session', async () => {
  const session = {userId: 'u1', email: 'a@b.vn', accountKind: 'USER'};
  const emitted = [];
  const handle = createAuthChangeHandler({resolveSession: async () => session, emit: (s) => emitted.push(s)});
  await handle({user: {id: 'u2'}});
  await handle({user: {id: 'u1'}});
  await handle({});
  assert.deepEqual(emitted, [null, session, session]);
});

test('auth handler: refresh goes through the same versioned path as subscription events', async () => {
  const slow = deferred();
  const fast = {userId: 'u1', email: 'a@b.vn', accountKind: 'USER'};
  const reads = [slow.promise, Promise.resolve(fast)];
  const emitted = [];
  const handle = createAuthChangeHandler({resolveSession: () => reads.shift(), emit: (s) => emitted.push(s)});
  const first = handle({});
  const second = handle.refresh();
  await second;
  slow.resolve({userId: 'old', email: 'old@b.vn', accountKind: 'USER'});
  await first;
  await tick();
  assert.deepEqual(emitted, [fast]);
});

test('auth handler: wrong-portal profiles resolve to null (ORGANIZER at BUYER, USER at ORGANIZER)', async () => {
  const base = {userId: 'u1', email: 'a@b.vn'};
  const resolveFor = (portal, kind) => () =>
    loadPortalSession({portal, loadSession: () => base, loadProfile: () => ({data: {LoaiTaiKhoan: kind}, error: null})});

  for (const [portal, kind, expected] of [
    [ACCOUNT_PORTALS.BUYER, 'ORGANIZER', null],
    [ACCOUNT_PORTALS.ORGANIZER, 'USER', null],
    [ACCOUNT_PORTALS.BUYER, 'USER', {...base, accountKind: 'USER'}],
    [ACCOUNT_PORTALS.ORGANIZER, 'ADMIN', {...base, accountKind: 'ADMIN'}],
  ]) {
    const emitted = [];
    const handle = createAuthChangeHandler({resolveSession: resolveFor(portal, kind), emit: (s) => emitted.push(s)});
    await handle({user: {id: 'u1'}});
    assert.deepEqual(emitted, [expected], `${kind} at ${portal}`);
  }
});

// Mirrors BuyerAuth.handleSubmit: sign in -> guard -> refresh -> guard -> message/navigate.
function makeLoginHarness(currentUser) {
  const events = [];
  let state;
  let active = true;
  const resolveSession = async () => (currentUser.id ? {userId: currentUser.id, email: `${currentUser.id}@b.vn`} : null);
  const handle = createAuthChangeHandler({
    resolveSession,
    emit: (s) => {
      state = s;
    },
    isActive: () => active,
  });
  const guard = createAuthAttemptGuard();
  async function submit(signIn) {
    const isCurrent = guard.begin();
    try {
      await signIn();
      if (!isCurrent()) return;
      await handle.refresh();
      if (!isCurrent()) return;
      events.push('message');
      events.push('navigate');
    } catch {
      if (isCurrent()) events.push('error');
    }
  }
  return {
    events,
    guard,
    handle,
    submit,
    getState: () => state,
    deactivate: () => {
      active = false;
      guard.invalidate();
      handle.invalidate();
    },
  };
}

test('login race: sign-out while sign-in is pending never restores account A', async () => {
  const user = {id: null};
  const h = makeLoginHarness(user);
  const pendingSignIn = deferred();
  const run = h.submit(() => pendingSignIn.promise);
  await h.handle(null); // sign-out lands first
  h.guard.invalidate();
  user.id = 'A'; // A's sign-in settles late
  pendingSignIn.resolve();
  await run;
  assert.equal(h.getState(), null);
  assert.deepEqual(h.events, []);
});

test('login race: sign-out followed by a refresh reads null, never stale A', async () => {
  const user = {id: 'A'};
  const h = makeLoginHarness(user);
  const pendingSignIn = deferred();
  const run = h.submit(() => pendingSignIn.promise);
  user.id = null;
  await h.handle(null);
  h.guard.invalidate();
  pendingSignIn.resolve();
  await run;
  await h.handle.refresh();
  assert.equal(h.getState(), null);
  assert.ok(!h.events.includes('navigate'));
});

test('login race: account switch to B while A is pending leaves state on B', async () => {
  const user = {id: 'B'};
  const h = makeLoginHarness(user);
  const pendingSignIn = deferred();
  const run = h.submit(() => pendingSignIn.promise);
  await h.handle({user: {id: 'B'}});
  h.guard.invalidate();
  pendingSignIn.resolve({userId: 'A'});
  await run;
  assert.equal(h.getState().userId, 'B');
  assert.deepEqual(h.events, []);
});

test('login race: unsubscribe while A is pending emits nothing and navigates nowhere', async () => {
  const user = {id: 'A'};
  const h = makeLoginHarness(user);
  const pendingSignIn = deferred();
  const run = h.submit(() => pendingSignIn.promise);
  h.deactivate();
  pendingSignIn.resolve();
  await run;
  assert.equal(h.getState(), undefined);
  assert.deepEqual(h.events, []);
});

test('auth attempt guard: a newer attempt or invalidate makes older attempts stale', () => {
  const guard = createAuthAttemptGuard();
  const first = guard.begin();
  assert.equal(first(), true);
  const second = guard.begin();
  assert.equal(first(), false);
  assert.equal(second(), true);
  guard.invalidate();
  assert.equal(second(), false);
});

test('static check: BuyerAuth takes session state only from subscription/refresh, guarded per attempt', async () => {
  const src = await readFile('src/components/BuyerAuth.tsx', 'utf8');
  assert.ok(!/setSession\(\s*(nextSession|result\.session)/.test(src), 'BuyerAuth must not set session from sign-in results');
  assert.ok(src.includes('refreshBuyerSession'));
  assert.ok(src.includes('createAuthAttemptGuard'));
  assert.ok(/guard\.invalidate\(\);\s*unsub\(\)/.test(src), 'subscribe cleanup must invalidate the guard');
});

test('static check: both services route state through the handler with invalidate and refresh', async () => {
  const buyerService = await readFile('src/services/buyerAuthService.ts', 'utf8');
  const orgService = await readFile('src/services/organizerService.ts', 'utf8');
  for (const [name, src] of [['buyerAuthService', buyerService], ['organizerService', orgService]]) {
    assert.ok(src.includes('handle.invalidate()'), `${name} must invalidate the handler on unsubscribe`);
    assert.ok(src.includes('void handle({})'), `${name} must emit the initial mock session through the handler`);
    assert.match(src, /onAuthStateChange[\s\S]*?catch/, `${name} must guard onAuthStateChange with try/catch`);
  }
  assert.ok(buyerService.includes('export async function refreshBuyerSession'));
  assert.ok(orgService.includes('export async function refreshOrganizerSession'));
});

test('static check: useBuyerSession and EventCatalog do not read the session outside the subscription', async () => {
  for (const file of ['src/components/site/useBuyerSession.ts', 'src/components/EventCatalog.tsx']) {
    const src = await readFile(file, 'utf8');
    assert.ok(!/getBuyerSession\(\)\s*\.then\(\s*set/.test(src), `${file} must not call getBuyerSession().then(set...)`);
    assert.ok(!/set\w*\(\s*await getBuyerSession\(\)/.test(src), `${file} must not set state from a bare getBuyerSession`);
    assert.ok(src.includes('subscribeBuyerAuth'), `${file} must use subscribeBuyerAuth`);
  }
});

test('static check: neither service contains user_metadata near role decision or || USER fallback', async () => {
  const buyerService = await readFile('src/services/buyerAuthService.ts', 'utf8');
  const orgService = await readFile('src/services/organizerService.ts', 'utf8');

  // No || 'USER' or || "USER" fallback in either service
  assert.ok(!buyerService.includes("|| 'USER'"), "buyerAuthService must not contain || 'USER' fallback");
  assert.ok(!buyerService.includes('|| "USER"'), 'buyerAuthService must not contain || "USER" fallback');
  assert.ok(!orgService.includes("|| 'USER'"), "organizerService must not contain || 'USER' fallback");
  assert.ok(!orgService.includes('|| "USER"'), 'organizerService must not contain || "USER" fallback');

  // organizerService must not contain user_metadata
  assert.ok(!orgService.includes('user_metadata'), 'organizerService must not reference user_metadata');

  // buyerAuthService only uses user_metadata for display fullName and never for role decisions
  assert.ok(
    !buyerService.match(/user_metadata\?\.?(role|accountKind|LoaiTaiKhoan|kind)/i),
    'buyerAuthService must not infer role/accountKind from user_metadata',
  );
  const metadataLines = buyerService.split('\n').filter((l) => l.includes('user_metadata'));
  assert.ok(metadataLines.length > 0, 'buyerAuthService should only use user_metadata for fullName');
  for (const line of metadataLines) {
    assert.ok(line.includes('full_name'), 'user_metadata line must only read full_name');
    assert.ok(!line.includes('accountKind'), 'user_metadata line must not set accountKind');
    assert.ok(!line.includes('role'), 'user_metadata line must not set role');
  }
});

test('static check: readMockSessionBase in organizerService no longer reads mock buyer session', async () => {
  const orgService = await readFile('src/services/organizerService.ts', 'utf8');
  const match = orgService.match(/function readMockSessionBase\(\)[\s\S]*?\n\}/);
  assert.ok(match, 'readMockSessionBase function definition must be found');
  const functionBody = match[0];
  assert.ok(
    !functionBody.includes('eventticketing:mock-buyer-session'),
    'readMockSessionBase must not read eventticketing:mock-buyer-session',
  );
  assert.ok(
    !functionBody.includes('mock-buyer-session'),
    'readMockSessionBase must not reference mock-buyer-session',
  );
});

test('overload bug regression: clean install and corrective migration guarantee unambiguous zero-arg helpers', async () => {
  // 1. Inspect clean install migration: 20261006210000_user_organizer_boundary.sql
  const boundarySql = await readFile(
    new URL('../supabase/migrations/20261006210000_user_organizer_boundary.sql', import.meta.url),
    'utf8',
  );

  // Must drop UUID overloads before recreating to ensure no stale parameter defaults survive
  assert.match(boundarySql, /DROP FUNCTION IF EXISTS public\.lay_loai_tai_khoan\(UUID\);/);
  assert.match(boundarySql, /DROP FUNCTION IF EXISTS public\.la_ban_to_chuc\(UUID\);/);

  // Must define exact signatures without DEFAULT parameter values
  assert.match(boundarySql, /CREATE OR REPLACE FUNCTION public\.lay_loai_tai_khoan\(p_user_id UUID\)/);
  assert.match(boundarySql, /CREATE OR REPLACE FUNCTION public\.la_ban_to_chuc\(p_user_id UUID\)/);
  assert.doesNotMatch(boundarySql, /lay_loai_tai_khoan\(p_user_id UUID DEFAULT/);
  assert.doesNotMatch(boundarySql, /la_ban_to_chuc\(p_user_id UUID DEFAULT/);

  // Must define zero-argument wrappers
  assert.match(boundarySql, /CREATE OR REPLACE FUNCTION public\.lay_loai_tai_khoan\(\)/);
  assert.match(boundarySql, /CREATE OR REPLACE FUNCTION public\.la_ban_to_chuc\(\)/);

  // 2. Inspect corrective migration: 20261007090000_fix_account_role_function_overload.sql
  const correctiveSql = await readFile(
    new URL('../supabase/migrations/20261007090000_fix_account_role_function_overload.sql', import.meta.url),
    'utf8',
  );

  // Drops exact UUID overload without CASCADE
  assert.match(correctiveSql, /DROP FUNCTION IF EXISTS public\.lay_loai_tai_khoan\(UUID\);/);
  assert.match(correctiveSql, /DROP FUNCTION IF EXISTS public\.la_ban_to_chuc\(UUID\);/);
  assert.doesNotMatch(correctiveSql, /CASCADE/);

  // Re-creates UUID variants without defaults
  assert.match(correctiveSql, /CREATE OR REPLACE FUNCTION public\.lay_loai_tai_khoan\(p_user_id UUID\)/);
  assert.match(correctiveSql, /CREATE OR REPLACE FUNCTION public\.la_ban_to_chuc\(p_user_id UUID\)/);
  assert.doesNotMatch(correctiveSql, /UUID DEFAULT/);

  // Re-creates/reinforces zero-argument wrappers
  assert.match(correctiveSql, /CREATE OR REPLACE FUNCTION public\.lay_loai_tai_khoan\(\)/);
  assert.match(correctiveSql, /CREATE OR REPLACE FUNCTION public\.la_ban_to_chuc\(\)/);

  // Regression safety check: pg_proc pronargdefaults must be 0
  assert.match(correctiveSql, /pronargdefaults/);
  assert.match(correctiveSql, /must not define default arguments/);
  assert.match(correctiveSql, /PERFORM 'public\.lay_loai_tai_khoan\(\)'::regprocedure;/);
  assert.match(correctiveSql, /PERFORM 'public\.la_ban_to_chuc\(\)'::regprocedure;/);
});

test('migration 20261006210000_user_organizer_boundary.sql defines authoritative schema, backfill, and delegation', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20261006210000_user_organizer_boundary.sql', import.meta.url),
    'utf8',
  );

  // 1. Column and constraint additions on HO_SO_NGUOI_DUNG
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "LoaiTaiKhoan" VARCHAR\(30\) NOT NULL DEFAULT 'USER'/);
  assert.match(sql, /CHECK \("LoaiTaiKhoan" IN \('USER', 'ORGANIZER', 'ADMIN'\)\)/);

  // 2. Safe backfill strategy
  assert.match(sql, /INSERT INTO public\."HO_SO_NGUOI_DUNG" \("NguoiDungID", "HoTen", "LoaiTaiKhoan"\)/);
  assert.match(sql, /UPDATE public\."HO_SO_NGUOI_DUNG"[^;]*SET "LoaiTaiKhoan" = 'ORGANIZER'/);
  assert.match(sql, /FROM public\."THANH_VIEN_TO_CHUC"/);

  // 3. Self-promotion prevention trigger
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.kiem_tra_khong_tu_nang_cap_loai_tai_khoan/);
  assert.match(sql, /CREATE TRIGGER "trg_kiem_tra_khong_tu_nang_cap"/);
  assert.match(sql, /BEFORE UPDATE OF "LoaiTaiKhoan" ON public\."HO_SO_NGUOI_DUNG"/);
  assert.match(sql, /Khong co quyen tu y thay doi loai tai khoan/);

  // 4. Default USER assignment on signup trigger
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.tao_ho_so_nguoi_dung_moi/);
  assert.match(sql, /'USER'/);

  // 5. Authoritative account kind helpers with anti-disclosure protection
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.lay_loai_tai_khoan/);
  assert.match(sql, /Khong co quyen xem loai tai khoan cua nguoi dung khac/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.la_ban_to_chuc/);
  assert.match(sql, /Khong co quyen kiem tra phan quyen cua nguoi dung khac/);
  assert.doesNotMatch(sql, /la_ban_to_chuc\(p_user_id UUID DEFAULT/);
  assert.doesNotMatch(sql, /lay_loai_tai_khoan\(p_user_id UUID DEFAULT/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.gan_loai_tai_khoan/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.gan_loai_tai_khoan\(TEXT, TEXT\) FROM authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.gan_loai_tai_khoan\(TEXT, TEXT\) TO service_role/);

  // 6. Gated editor & membership check helpers
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.la_thanh_vien_to_chuc/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.co_quyen_bien_tap_to_chuc/);

  // 7. Gated organizer onboarding RPC
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.tao_to_chuc_cua_toi/);
  assert.match(sql, /Chi tai khoan Ban to chuc moi co the tao to chuc/);
  assert.match(sql, /public\.la_ban_to_chuc\(v_user_id\)/);

  // 8. Non-duplicative design: downstream RPC bodies are NOT duplicated in this migration
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.tao_ban_nhap_su_kien/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.luu_su_kien_toan_dien/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.cong_bo_su_kien/);

  // 9. No destructive operations
  assert.doesNotMatch(sql, /DROP TABLE/);
});

test('corrective migration removes ambiguous defaults from account-role overloads', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20261007090000_fix_account_role_function_overload.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /lay_loai_tai_khoan\(p_user_id UUID\)/);
  assert.match(sql, /la_ban_to_chuc\(p_user_id UUID\)/);
  assert.doesNotMatch(sql, /UUID DEFAULT/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.lay_loai_tai_khoan\(UUID\)/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.la_ban_to_chuc\(UUID\)/);
  assert.doesNotMatch(sql, /CASCADE/);
  assert.match(sql, /pronargdefaults/);
  assert.match(sql, /must not define default arguments/);
  assert.match(sql, /PERFORM 'public\.lay_loai_tai_khoan\(\)'::regprocedure;/);
  assert.match(sql, /PERFORM 'public\.la_ban_to_chuc\(\)'::regprocedure;/);
});

test('RPC ACL hardening explicitly blocks public clients from administrative functions', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20261027120000_harden_rpc_acls_and_service_boundaries.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.gan_loai_tai_khoan/);
  assert.match(sql, /auth\.role\(\) IN \('anon', 'authenticated'\)/);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.gan_loai_tai_khoan\(TEXT, TEXT\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.gan_loai_tai_khoan\(TEXT, TEXT\) TO service_role/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.luu_su_kien_toan_dien\(JSONB\) FROM PUBLIC, anon/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.cong_bo_su_kien\(INT\) FROM PUBLIC, anon/,
  );
  assert.match(sql, /has_function_privilege/);
  assert.match(sql, /anon still holds EXECUTE on gan_loai_tai_khoan/);
});

test('pgTAP test file supabase/tests/account_role_boundary.sql validates delegation, anti-disclosure, RLS, and overload safety', async () => {
  const sql = await readFile(
    new URL('../supabase/tests/account_role_boundary.sql', import.meta.url),
    'utf8',
  );

  // Verify plan
  assert.match(sql, /SELECT plan\(31\);/);
  assert.doesNotMatch(sql, /\\gset/);

  // Verify zero-argument overload assertions in pgTAP
  assert.match(sql, /lay_loai_tai_khoan\(\) zero-argument wrapper exists/);
  assert.match(sql, /la_ban_to_chuc\(\) zero-argument wrapper exists/);
  assert.match(sql, /lay_loai_tai_khoan\(uuid\) defines 0 argument defaults/);
  assert.match(sql, /la_ban_to_chuc\(uuid\) defines 0 argument defaults/);
  assert.match(sql, /Zero-argument lay_loai_tai_khoan\(\) returns USER for authenticated buyer without overload ambiguity/);
  assert.match(sql, /Zero-argument la_ban_to_chuc\(\) returns false for authenticated buyer without overload ambiguity/);
  assert.match(sql, /Zero-argument lay_loai_tai_khoan\(\) returns ORGANIZER for authenticated organizer without overload ambiguity/);
  assert.match(sql, /Zero-argument la_ban_to_chuc\(\) returns true for authenticated organizer without overload ambiguity/);

  // Verify direct RPC reject assertions for USER
  assert.match(sql, /Buyer \(USER\) is denied from creating an organization via tao_to_chuc_cua_toi/);
  assert.match(sql, /Buyer \(USER\) is denied from creating event draft via tao_ban_nhap_su_kien/);
  assert.match(sql, /Buyer \(USER\) is denied from mutating event data via luu_su_kien_toan_dien/);
  assert.match(sql, /Buyer \(USER\) is denied from publishing event via cong_bo_su_kien/);

  // Verify direct table RLS prevents buyer mutation
  assert.match(sql, /Direct-table RLS blocks buyer \(USER\) from mutating organizer events/);

  // Verify self-promotion rejection
  assert.match(sql, /Buyer \(USER\) cannot self-promote by direct table UPDATE on HO_SO_NGUOI_DUNG/);

  // Verify anti-disclosure assertions
  assert.match(sql, /lay_loai_tai_khoan denies authenticated caller from probing other users/);
  assert.match(sql, /la_ban_to_chuc denies authenticated caller from probing other users/);

  // Verify ORGANIZER access
  assert.match(sql, /Organizer \(ORGANIZER\) can successfully create an organization via tao_to_chuc_cua_toi/);
  assert.match(sql, /Organizer \(ORGANIZER\) can successfully save full event draft via luu_su_kien_toan_dien/);

  // Verify backfill & admin assignment
  assert.match(sql, /Backfill strategy classifies organization members as ORGANIZER/);
  assert.match(sql, /Service role can assign account kinds via gan_loai_tai_khoan/);
});
