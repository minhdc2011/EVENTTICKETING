import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {buildPublicPath, resolvePublicRoute} from '../src/domain/publicRoute.js';

test('resolves buyer authentication routes distinctly from organizer and catalog', () => {
  // 1. Direct path resolution for buyer authentication
  assert.deepEqual(resolvePublicRoute('/login', 'fallback'), {kind: 'account', page: 'login'});
  assert.deepEqual(resolvePublicRoute('/register', 'fallback'), {kind: 'account', page: 'register'});
  assert.deepEqual(resolvePublicRoute('/account', 'fallback'), {kind: 'account', page: 'overview'});
  assert.deepEqual(resolvePublicRoute('/account/login', 'fallback'), {kind: 'account', page: 'login'});
  assert.deepEqual(resolvePublicRoute('/account/register', 'fallback'), {kind: 'account', page: 'register'});

  // 2. Query parameter route resolution (behind base paths such as GitHub Pages)
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '', '?route=/login'), {
    kind: 'account',
    page: 'login',
  });
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '', '?route=/register'), {
    kind: 'account',
    page: 'register',
  });
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '', '?route=/account'), {
    kind: 'account',
    page: 'overview',
  });

  // 3. Organizer authentication remains strictly separate and is NOT resolved as buyer account
  assert.deepEqual(resolvePublicRoute('/organizer/login', 'fallback'), {
    kind: 'organizer',
    page: 'login',
  });
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/', 'fallback', '', '?route=/organizer/login'), {
    kind: 'organizer',
    page: 'login',
  });
  assert.deepEqual(resolvePublicRoute('/organizer', 'fallback'), {
    kind: 'organizer',
    page: 'dashboard',
  });

  // 4. Public catalog and event details remain intact
  assert.deepEqual(resolvePublicRoute('/events', 'fallback'), {kind: 'catalog'});
  assert.deepEqual(resolvePublicRoute('/EVENTTICKETING/events', 'fallback'), {kind: 'catalog'});
  assert.deepEqual(resolvePublicRoute('/events/acoustic-live', 'fallback'), {
    kind: 'detail',
    eventSlug: 'acoustic-live',
  });
});

test('builds stable public paths for buyer authentication and organizer access', () => {
  assert.equal(buildPublicPath('/', 'login'), '/?route=/login');
  assert.equal(buildPublicPath('/', 'register'), '/?route=/register');
  assert.equal(buildPublicPath('/', 'account'), '/?route=/account');
  assert.equal(buildPublicPath('/EVENTTICKETING/', 'login'), '/EVENTTICKETING/?route=/login');
  assert.equal(buildPublicPath('/EVENTTICKETING/', 'register'), '/EVENTTICKETING/?route=/register');
  assert.equal(buildPublicPath('/EVENTTICKETING/', 'organizer'), '/EVENTTICKETING/?route=/organizer');
  assert.equal(buildPublicPath('/EVENTTICKETING/', 'organizer/login'), '/EVENTTICKETING/?route=/organizer/login');
});

test('global header is sticky, blue, and wins the cascade over the .et-site surface', async () => {
  const css = await readFile(new URL('../src/components/site/site.css', import.meta.url), 'utf8');
  const tokens = await readFile(new URL('../src/components/site/tokens.css', import.meta.url), 'utf8');

  // The header element carries both .et-site (grey surface) and .et-header (blue bar):
  // the blue rule must be more specific than the .et-site token rule, whatever the load order.
  const rule = css.match(/\.et-site\.et-header\s*\{([^}]*)\}/);
  assert.ok(rule, 'header surface rule must be .et-site.et-header (specificity above .et-site)');
  assert.match(rule[1], /position:\s*sticky/);
  assert.match(rule[1], /top:\s*0/);
  assert.match(rule[1], /z-index:\s*50/);
  assert.match(rule[1], /background:\s*var\(--et-blue\)/);
  assert.match(rule[1], /color:\s*var\(--et-on-blue\)/);
  assert.match(tokens, /--et-blue:\s*#0353c2/i);

  // Category buttons in the catalog stay at least 44px tall on small screens
  const index = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /\.marketplace-categories button\s*\{[^}]*min-height:\s*(?:[0-3]\d|4[0-3])px/);
});

function stripImports(src) {
  return src.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
}

test('static check: portal and navigation files enforce role boundaries and safe session handling', async () => {
  const portalSrc = await readFile(new URL('../src/components/OrganizerPortal.tsx', import.meta.url), 'utf8');
  const authViewSrc = await readFile(
    new URL('../src/components/organizer-ui/OrganizerAuthView.tsx', import.meta.url),
    'utf8',
  );
  const buyerAuthSrc = await readFile(new URL('../src/components/BuyerAuth.tsx', import.meta.url), 'utf8');
  const headerSrc = await readFile(new URL('../src/components/site/GlobalHeader.tsx', import.meta.url), 'utf8');

  // 1. In OrganizerPortal the role check and AccessDenied branch must come before page === 'login'
  const portalBody = stripImports(portalSrc);
  const portalFnIdx = portalBody.indexOf('export function OrganizerPortal');
  assert.ok(portalFnIdx !== -1, "OrganizerPortal must contain 'export function OrganizerPortal'");
  const portalAfterFn = portalBody.slice(portalFnIdx);

  const allowedIdx = portalAfterFn.indexOf('const allowed =');
  const accessDeniedIdx = portalAfterFn.indexOf('<OrganizerAccessDeniedView');
  const loginPageIdx = portalAfterFn.indexOf("page === 'login'");

  assert.ok(allowedIdx !== -1, "OrganizerPortal must define 'const allowed ='");
  assert.ok(accessDeniedIdx !== -1, "OrganizerPortal must render '<OrganizerAccessDeniedView'");
  assert.ok(loginPageIdx !== -1, "OrganizerPortal must handle page === 'login'");
  assert.ok(
    allowedIdx < accessDeniedIdx && accessDeniedIdx < loginPageIdx,
    `Expected allowed (${allowedIdx}) < accessDenied (${accessDeniedIdx}) < loginPage (${loginPageIdx}) in OrganizerPortal`,
  );

  const sessionNotAllowedMatch = portalAfterFn.match(/if \(session && !allowed\)/);
  assert.ok(sessionNotAllowedMatch, "OrganizerPortal must match /if \\(session && !allowed\\)/");
  assert.ok(
    sessionNotAllowedMatch.index < loginPageIdx,
    "/if (session && !allowed)/ must appear before page === 'login' in OrganizerPortal",
  );

  // 2. OrganizerAuthView must gate 'PHIÊN LÀM VIỆC HỢP LỆ' and 'Mở Studio làm việc' behind canAccessPortal
  const authViewBody = stripImports(authViewSrc);
  const authPortalIdx = authViewBody.indexOf("canAccessPortal(session.accountKind, 'ORGANIZER')");
  const validSessionIdx = authViewBody.indexOf('PHIÊN LÀM VIỆC HỢP LỆ');
  const openStudioIdx = authViewBody.indexOf('Mở Studio làm việc');

  assert.ok(authPortalIdx !== -1, "OrganizerAuthView must call canAccessPortal(session.accountKind, 'ORGANIZER')");
  assert.ok(validSessionIdx !== -1, "OrganizerAuthView must contain 'PHIÊN LÀM VIỆC HỢP LỆ'");
  assert.ok(openStudioIdx !== -1, "OrganizerAuthView must contain 'Mở Studio làm việc'");
  assert.ok(
    authPortalIdx < validSessionIdx,
    `canAccessPortal (${authPortalIdx}) must come before PHIÊN LÀM VIỆC HỢP LỆ (${validSessionIdx}) in OrganizerAuthView`,
  );
  assert.ok(
    authPortalIdx < openStudioIdx,
    `canAccessPortal (${authPortalIdx}) must come before Mở Studio làm việc (${openStudioIdx}) in OrganizerAuthView`,
  );

  // 3. GlobalHeader must call canAccessPortal for BUYER before target="account" and contain no account link in ORGANIZER branch
  const headerBody = stripImports(headerSrc);
  const headerPortalIdx = headerBody.indexOf("canAccessPortal(session.accountKind, 'BUYER')");
  const accountLinkIdx = headerBody.indexOf('target="account"');

  assert.ok(headerPortalIdx !== -1, "GlobalHeader must call canAccessPortal(session.accountKind, 'BUYER')");
  assert.ok(accountLinkIdx !== -1, 'GlobalHeader must include RouteLink target="account"');
  assert.ok(
    headerPortalIdx < accountLinkIdx,
    `canAccessPortal (${headerPortalIdx}) must appear before target="account" (${accountLinkIdx}) in GlobalHeader`,
  );
  assert.ok(
    !/ORGANIZER[\s\S]{0,200}target="account"/.test(headerBody),
    'GlobalHeader body must not link to account inside an ORGANIZER branch',
  );

  // 4. BuyerAuth must not contain legacy claims, bare session reads, or direct setSession from sign-in/up results
  const buyerAuthBody = stripImports(buyerAuthSrc);
  assert.ok(!buyerAuthSrc.includes('được phép mua vé'), 'BuyerAuth must not contain "được phép mua vé"');
  assert.ok(!buyerAuthSrc.includes('Mở Studio BTC'), 'BuyerAuth must not contain "Mở Studio BTC"');
  assert.ok(!/getBuyerSession\(\)\s*\.then\(\s*set/.test(buyerAuthSrc), 'BuyerAuth must not call getBuyerSession().then(set...)');
  assert.ok(buyerAuthSrc.includes('subscribeBuyerAuth'), 'BuyerAuth must use subscribeBuyerAuth');
  assert.ok(buyerAuthSrc.includes('canAccessPortal'), 'BuyerAuth must verify portal access via canAccessPortal');

  assert.ok(!buyerAuthBody.includes('setSession(nextSession)'), 'BuyerAuth must not setSession(nextSession)');
  assert.ok(!buyerAuthBody.includes('setSession(result.session)'), 'BuyerAuth must not setSession(result.session)');
  assert.ok(
    !/setSession\(\s*(nextSession|result\.session)\s*\)/.test(buyerAuthBody),
    'BuyerAuth must not set session directly from sign-in/up result',
  );

  const forbiddenBuyerPhrase = 'được sử dụng tài khoản người mua';
  assert.ok(!buyerAuthSrc.includes(forbiddenBuyerPhrase), `BuyerAuth must not contain "${forbiddenBuyerPhrase}"`);
  assert.ok(!headerSrc.includes(forbiddenBuyerPhrase), `GlobalHeader must not contain "${forbiddenBuyerPhrase}"`);
  assert.ok(!authViewSrc.includes(forbiddenBuyerPhrase), `OrganizerAuthView must not contain "${forbiddenBuyerPhrase}"`);
  assert.ok(!portalSrc.includes(forbiddenBuyerPhrase), `OrganizerPortal must not contain "${forbiddenBuyerPhrase}"`);
});
