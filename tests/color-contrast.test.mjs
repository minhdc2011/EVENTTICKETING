import assert from 'node:assert/strict';
import test from 'node:test';
import {accessibleBadgeColors, contrastRatio, parseHex, readableInk} from '../src/domain/colorContrast.js';
import {CATEGORY_THEMES} from '../src/domain/categoryThemes.js';

test('contrast ratio matches the WCAG reference values', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff') * 100) / 100, 21);
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
  assert.equal(parseHex('#fff')?.join(','), '255,255,255');
  assert.equal(parseHex('nope'), null);
  assert.equal(contrastRatio('x', '#fff'), null);
});

test('readableInk prefers the higher-contrast ink', () => {
  assert.equal(readableInk('#d8ff3e'), '#070908');
  assert.equal(readableInk('#1e3a8a'), '#ffffff');
});

test('accessibleBadgeColors reaches 4.5:1 for every category accent (indigo previously gave 4.47)', () => {
  for (const theme of Object.values(CATEGORY_THEMES)) {
    const {background, color} = accessibleBadgeColors(theme.primary);
    assert.ok(contrastRatio(background, color) >= 4.5, `${theme.label} ${theme.primary} -> ${background}/${color}`);
  }
  // accents that already pass are left untouched
  assert.deepEqual(accessibleBadgeColors('#d8ff3e'), {background: '#d8ff3e', color: '#070908'});
  // the failing accent is adjusted, not shipped as-is
  assert.notEqual(accessibleBadgeColors('#6366f1').background, '#6366f1');
});
