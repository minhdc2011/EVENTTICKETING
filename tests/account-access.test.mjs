import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_PORTALS,
  AccountAccessError,
  authorizePortalSignIn,
  canAccessPortal,
  createAuthChangeHandler,
  evaluatePortalAccess,
  loadPortalSession,
  normalizeAccountKind,
  readMockAccountKind,
  registerMockAccount,
  resolveProfileAccountKind,
} from '../src/domain/accountAccess.js';

const fakeStorage = () => {
  const map = new Map();
  return {getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v)};
};
const profile = (kind) => ({data: {LoaiTaiKhoan: kind}, error: null});

test('portal permission matrix', () => {
  const expected = {
    USER: [true, false],
    ORGANIZER: [false, true],
    ADMIN: [true, true],
    user: [true, false],
    SCANNER: [false, false],
    '': [false, false],
    null: [false, false],
  };
  for (const [key, [buyer, organizer]] of Object.entries(expected)) {
    const kind = key === 'null' ? null : key;
    assert.equal(canAccessPortal(kind, ACCOUNT_PORTALS.BUYER), buyer, `${key} -> BUYER`);
    assert.equal(canAccessPortal(kind, ACCOUNT_PORTALS.ORGANIZER), organizer, `${key} -> ORGANIZER`);
    assert.equal(evaluatePortalAccess(profile(kind), 'BUYER').allowed, buyer);
    assert.equal(evaluatePortalAccess(profile(kind), 'ORGANIZER').allowed, organizer);
  }
  assert.equal(canAccessPortal('USER', 'UNKNOWN'), false);
});

test('normalizeAccountKind trims, upper-cases and rejects unknown values', () => {
  assert.equal(normalizeAccountKind('  organizer '), 'ORGANIZER');
  assert.equal(normalizeAccountKind('SCANNER'), null);
  assert.equal(normalizeAccountKind(undefined), null);
  assert.equal(normalizeAccountKind(5), null);
});

test('resolveProfileAccountKind fails closed and never yields USER by default', () => {
  const cases = [
    [{data: {LoaiTaiKhoan: 'USER'}, error: new Error('x')}, 'QUERY_ERROR'],
    [{data: null, error: null}, 'PROFILE_MISSING'],
    [undefined, 'PROFILE_MISSING'],
    [{data: {}, error: null}, 'INVALID_KIND'],
    [{data: {LoaiTaiKhoan: 'SCANNER'}, error: null}, 'INVALID_KIND'],
    [{data: {LoaiTaiKhoan: null}, error: null}, 'INVALID_KIND'],
  ];
  for (const [input, reason] of cases) {
    const result = resolveProfileAccountKind(input);
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.equal(result.accountKind, undefined);
  }
  assert.deepEqual(resolveProfileAccountKind(profile('admin')), {ok: true, accountKind: 'ADMIN'});
});

function harness(result) {
  const calls = {revoke: 0};
  return {
    calls,
    loadProfile: typeof result === 'function' ? result : async () => result,
    revokeSession: async () => {
      calls.revoke += 1;
    },
  };
}

test('authorizePortalSignIn allows matching portal without revoking', async () => {
  const h = harness(profile('USER'));
  assert.equal(await authorizePortalSignIn({portal: 'BUYER', ...h}), 'USER');
  assert.equal(h.calls.revoke, 0);
});

test('authorizePortalSignIn rejects ORGANIZER at buyer portal and revokes once', async () => {
  const h = harness(profile('ORGANIZER'));
  await assert.rejects(authorizePortalSignIn({portal: 'BUYER', ...h}), (e) => {
    assert.ok(e instanceof AccountAccessError);
    assert.equal(e.reason, 'WRONG_PORTAL');
    assert.match(e.message, /Cổng Ban tổ chức/);
    return true;
  });
  assert.equal(h.calls.revoke, 1);
});

test('authorizePortalSignIn rejects USER at organizer portal and revokes once', async () => {
  const h = harness(profile('USER'));
  await assert.rejects(authorizePortalSignIn({portal: 'ORGANIZER', ...h}), (e) => {
    assert.equal(e.reason, 'WRONG_PORTAL');
    assert.match(e.message, /\/login/);
    return true;
  });
  assert.equal(h.calls.revoke, 1);
});

test('authorizePortalSignIn treats a throwing loadProfile as QUERY_ERROR and revokes', async () => {
  const h = harness(async () => {
    throw new Error('network');
  });
  await assert.rejects(authorizePortalSignIn({portal: 'BUYER', ...h}), (e) => e.reason === 'QUERY_ERROR');
  assert.equal(h.calls.revoke, 1);
});

test('authorizePortalSignIn keeps the original error when revokeSession throws', async () => {
  await assert.rejects(
    authorizePortalSignIn({
      portal: 'BUYER',
      loadProfile: async () => profile('ORGANIZER'),
      revokeSession: async () => {
        throw new Error('signOut failed');
      },
    }),
    (e) => e instanceof AccountAccessError && e.reason === 'WRONG_PORTAL',
  );
});

test('mock directory is explicit: unknown emails have no profile, registration is USER only', () => {
  const storage = fakeStorage();
  assert.deepEqual(readMockAccountKind(storage, 'someone@x.vn'), {data: null, error: null});
  assert.equal(evaluatePortalAccess(readMockAccountKind(storage, 'someone@x.vn'), 'ORGANIZER').allowed, false);

  registerMockAccount(storage, ' New@X.vn ');
  assert.equal(readMockAccountKind(storage, 'new@x.vn').data.LoaiTaiKhoan, 'USER');

  registerMockAccount(storage, 'organizer@demo.vn');
  assert.equal(readMockAccountKind(storage, 'organizer@demo.vn').data.LoaiTaiKhoan, 'ORGANIZER');
  registerMockAccount(storage, 'organizer@demo.vn');
  assert.equal(readMockAccountKind(storage, 'ORGANIZER@demo.vn').data.LoaiTaiKhoan, 'ORGANIZER');
});

test('registerMockAccount never downgrades an existing stored kind', () => {
  const storage = fakeStorage();
  storage.setItem('eventticketing:mock-account-profiles', JSON.stringify({'btc@x.vn': 'ORGANIZER'}));
  registerMockAccount(storage, 'btc@x.vn');
  assert.equal(readMockAccountKind(storage, 'btc@x.vn').data.LoaiTaiKhoan, 'ORGANIZER');
});

const base = {userId: 'usr-1', email: 'test@example.vn'};
const load = (portal, loadProfile, loadSession = async () => base) =>
  loadPortalSession({portal, loadSession, loadProfile});

test('loadPortalSession matrix: strict portal access, fails closed on every error', async () => {
  const boom = () => {
    throw new Error('profile throw');
  };
  const matrix = [
    [async () => profile('USER'), 'USER', null],
    [async () => profile('ORGANIZER'), null, 'ORGANIZER'],
    [async () => profile('ADMIN'), 'ADMIN', 'ADMIN'],
    [async () => profile('organizer'), null, 'ORGANIZER'],
    [async () => profile('SCANNER'), null, null],
    [async () => ({data: {}, error: null}), null, null],
    [async () => ({data: null, error: null}), null, null],
    [async () => ({data: null, error: new Error('q')}), null, null],
    [boom, null, null],
  ];
  const expect = (kind) => (kind ? {...base, accountKind: kind} : null);
  for (const [loadProfile, buyer, organizer] of matrix) {
    assert.deepEqual(await load('BUYER', loadProfile), expect(buyer));
    assert.deepEqual(await load('ORGANIZER', loadProfile), expect(organizer));
  }
  for (const portal of ['BUYER', 'ORGANIZER']) {
    assert.equal(await load(portal, async () => profile('ADMIN'), async () => null), null);
    assert.equal(
      await load(portal, async () => profile('ADMIN'), () => {
        throw new Error('session');
      }),
      null,
    );
  }
});

test('mock flow: registered or non-buyer emails never become ORGANIZER; seed does', async () => {
  const storage = fakeStorage();
  registerMockAccount(storage, 'partner@corporate.vn');
  const viaMock = (email) =>
    load('ORGANIZER', (b) => readMockAccountKind(storage, b.email), async () => ({userId: 'm', email}));
  assert.equal(await viaMock('partner@corporate.vn'), null);
  assert.equal((await viaMock('organizer@demo.vn')).accountKind, 'ORGANIZER');
});

test('mock seeded accounts: buyer@demo.vn is allowed at BUYER and denied at ORGANIZER', () => {
  const storage = fakeStorage();
  const buyerProfile = readMockAccountKind(storage, 'buyer@demo.vn');
  assert.deepEqual(buyerProfile, {data: {LoaiTaiKhoan: 'USER'}, error: null});

  const buyerAtBuyer = evaluatePortalAccess(buyerProfile, ACCOUNT_PORTALS.BUYER);
  assert.equal(buyerAtBuyer.allowed, true);
  assert.equal(buyerAtBuyer.accountKind, 'USER');

  const buyerAtOrg = evaluatePortalAccess(buyerProfile, ACCOUNT_PORTALS.ORGANIZER);
  assert.equal(buyerAtOrg.allowed, false);
  assert.equal(buyerAtOrg.reason, 'WRONG_PORTAL');
  assert.match(buyerAtOrg.message, /\/login/);
});

test('mock seeded accounts: organizer@demo.vn is allowed at ORGANIZER and denied at BUYER', () => {
  const storage = fakeStorage();
  const orgProfile = readMockAccountKind(storage, 'organizer@demo.vn');
  assert.deepEqual(orgProfile, {data: {LoaiTaiKhoan: 'ORGANIZER'}, error: null});

  const orgAtOrg = evaluatePortalAccess(orgProfile, ACCOUNT_PORTALS.ORGANIZER);
  assert.equal(orgAtOrg.allowed, true);
  assert.equal(orgAtOrg.accountKind, 'ORGANIZER');

  const orgAtBuyer = evaluatePortalAccess(orgProfile, ACCOUNT_PORTALS.BUYER);
  assert.equal(orgAtBuyer.allowed, false);
  assert.equal(orgAtBuyer.reason, 'WRONG_PORTAL');
  assert.match(orgAtBuyer.message, /\/organizer\/login/);
});

test('registration never raises an account to ORGANIZER regardless of email pattern or repeats', () => {
  const storage = fakeStorage();
  const testEmails = [
    'organizer@corporate.vn',
    'admin@system.vn',
    'notbuyer@company.com',
    'vip-organizer@demo.vn',
    '  new.user@domain.vn  ',
  ];

  for (const email of testEmails) {
    registerMockAccount(storage, email);
    const profileResult = readMockAccountKind(storage, email);
    assert.equal(profileResult.data?.LoaiTaiKhoan, 'USER', `Registered ${email} must default to USER`);

    const orgAccess = evaluatePortalAccess(profileResult, ACCOUNT_PORTALS.ORGANIZER);
    assert.equal(orgAccess.allowed, false, `Registered ${email} must be denied at ORGANIZER`);
    assert.equal(orgAccess.reason, 'WRONG_PORTAL');
    assert.match(orgAccess.message, /\/login/);

    const buyerAccess = evaluatePortalAccess(profileResult, ACCOUNT_PORTALS.BUYER);
    assert.equal(buyerAccess.allowed, true, `Registered ${email} must be allowed at BUYER`);
    assert.equal(buyerAccess.accountKind, 'USER');

    // Repeated registration must never upgrade or alter the kind to ORGANIZER
    registerMockAccount(storage, email);
    assert.equal(readMockAccountKind(storage, email).data?.LoaiTaiKhoan, 'USER');
  }

  // Registering seeded accounts does not alter their seeded roles
  registerMockAccount(storage, 'buyer@demo.vn');
  assert.equal(readMockAccountKind(storage, 'buyer@demo.vn').data?.LoaiTaiKhoan, 'USER');
  registerMockAccount(storage, 'organizer@demo.vn');
  assert.equal(readMockAccountKind(storage, 'organizer@demo.vn').data?.LoaiTaiKhoan, 'ORGANIZER');
});

test('wrong-portal messages explicitly name the right portal (/login vs /organizer/login)', () => {
  // ORGANIZER attempting BUYER portal receives message pointing to /organizer/login
  const orgAtBuyer = evaluatePortalAccess(profile('ORGANIZER'), ACCOUNT_PORTALS.BUYER);
  assert.equal(orgAtBuyer.allowed, false);
  assert.equal(orgAtBuyer.reason, 'WRONG_PORTAL');
  assert.match(orgAtBuyer.message, /\/organizer\/login/);
  assert.match(orgAtBuyer.message, /Cổng Ban tổ chức/);
  assert.doesNotMatch(orgAtBuyer.message, /trang người mua vé/);

  // USER attempting ORGANIZER portal receives message pointing to /login
  const userAtOrg = evaluatePortalAccess(profile('USER'), ACCOUNT_PORTALS.ORGANIZER);
  assert.equal(userAtOrg.allowed, false);
  assert.equal(userAtOrg.reason, 'WRONG_PORTAL');
  assert.match(userAtOrg.message, /\/login/);
  assert.match(userAtOrg.message, /người mua vé/);
  assert.doesNotMatch(userAtOrg.message, /\/organizer\/login/);
});

test('createAuthChangeHandler: stale resolve never revives a signed-out session', async () => {
  const emitted = [];
  let finish;
  const handler = createAuthChangeHandler({
    resolveSession: () => new Promise((r) => (finish = r)),
    emit: (s) => emitted.push(s),
  });
  const first = handler({raw: 1});
  const out = handler(null);
  finish({...base, accountKind: 'ORGANIZER'});
  await Promise.all([first, out]);
  assert.deepEqual(emitted, [null]);
});

test('createAuthChangeHandler: resolve throw emits null, inactive emits nothing, wrong portal emits null', async () => {
  let emitted = [];
  const emit = (s) => emitted.push(s);
  await createAuthChangeHandler({
    resolveSession: async () => {
      throw new Error('x');
    },
    emit,
  })({raw: 1});
  assert.deepEqual(emitted, [null]);

  emitted = [];
  await createAuthChangeHandler({
    resolveSession: async () => ({...base, accountKind: 'ORGANIZER'}),
    emit,
    isActive: () => false,
  })({raw: 1});
  assert.deepEqual(emitted, []);

  emitted = [];
  await createAuthChangeHandler({
    resolveSession: () => load('ORGANIZER', async () => profile('USER')),
    emit,
  })({raw: 1});
  assert.deepEqual(emitted, [null]);
});

test('authorizePortalSignIn rejects even when revokeSession returns {error} or throws; leftover session stays null', async () => {
  const cases = [
    ['ORGANIZER', 'USER', async () => ({error: new Error('signOut failed')}), /\/login/],
    ['BUYER', 'ORGANIZER', async () => {
      throw new Error('network');
    }, /\/organizer\/login/],
  ];
  for (const [portal, kind, revokeSession, message] of cases) {
    await assert.rejects(
      authorizePortalSignIn({portal, loadProfile: async () => profile(kind), revokeSession}),
      (e) => e instanceof AccountAccessError && e.reason === 'WRONG_PORTAL' && message.test(e.message),
    );
    assert.equal(await load(portal, async () => profile(kind)), null);
  }
});
