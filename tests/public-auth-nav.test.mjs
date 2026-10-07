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

test('marketplace header CSS defines sticky positioning, proper z-index, and backdrop blur', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

  // Verify sticky positioning at the top with z-index >= 50
  assert.match(
    css,
    /\.marketplace-nav\s*\{[^}]*position:\s*sticky/i,
    'marketplace-nav must have position: sticky',
  );
  assert.match(
    css,
    /\.marketplace-nav\s*\{[^}]*top:\s*0/i,
    'marketplace-nav must be pinned at top: 0',
  );
  assert.match(
    css,
    /\.marketplace-nav\s*\{[^}]*z-index:\s*50/i,
    'marketplace-nav must have z-index: 50',
  );
  assert.match(
    css,
    /\.marketplace-nav\s*\{[^}]*backdrop-filter:\s*blur\(18px\)/i,
    'marketplace-nav must have backdrop-filter: blur',
  );

  // Verify buyer authentication and distinct organizer link styles
  assert.match(css, /\.marketplace-organizer-link/);
  assert.match(css, /\.marketplace-register/);
  assert.match(css, /\.marketplace-login/);
  assert.match(css, /\.buyer-auth-card/);
  assert.match(css, /\.buyer-auth-tabs/);
});
