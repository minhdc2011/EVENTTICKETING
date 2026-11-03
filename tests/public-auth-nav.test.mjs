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
