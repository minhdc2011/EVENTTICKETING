import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CATEGORY_KEYS,
  CATEGORY_THEMES,
  getCategoryTheme,
} from '../src/domain/categoryThemes.js';

test('category themes define explicit color identities for all core categories', () => {
  const expectedKeys = ['AM_NHAC', 'SAN_KHAU', 'THE_THAO', 'HOI_THAO', 'WORKSHOP', 'THAM_QUAN', 'KHAC'];
  assert.deepEqual([...CATEGORY_KEYS], expectedKeys);

  for (const key of expectedKeys) {
    const theme = CATEGORY_THEMES[key];
    assert.ok(theme, `Theme for ${key} must exist`);
    assert.equal(theme.key, key);
    assert.ok(typeof theme.label === 'string' && theme.label.length > 0, `${key} must have label`);
    assert.ok(typeof theme.tagline === 'string' && theme.tagline.length > 0, `${key} must have tagline`);
    assert.match(theme.primary, /^#[0-9a-f]{6}$/i, `${key} primary must be hex color`);
    assert.match(theme.primaryLight, /^#[0-9a-f]{6}$/i, `${key} primaryLight must be hex color`);
    assert.match(theme.badgeBg, /^rgba\(/, `${key} badgeBg must be rgba`);
    assert.match(theme.gradient, /linear-gradient/, `${key} gradient must be linear-gradient`);
  }

  // AM_NHAC adopts electric fluorescent-lime / black stage identity from Super Concert 2026
  assert.equal(CATEGORY_THEMES.AM_NHAC.primary, '#d8ff3e');
  assert.equal(CATEGORY_THEMES.AM_NHAC.primaryLight, '#e8ff6b');

  // SAN_KHAU adopts crimson / rose family
  assert.equal(CATEGORY_THEMES.SAN_KHAU.primary, '#f43f5e');

  // THE_THAO adopts electric stadium sky blue
  assert.equal(CATEGORY_THEMES.THE_THAO.primary, '#0ea5e9');

  // HOI_THAO adopts executive indigo
  assert.equal(CATEGORY_THEMES.HOI_THAO.primary, '#6366f1');

  // WORKSHOP adopts emerald mint
  assert.equal(CATEGORY_THEMES.WORKSHOP.primary, '#10b981');

  // THAM_QUAN adopts warm terracotta
  assert.equal(CATEGORY_THEMES.THAM_QUAN.primary, '#f97316');

  // KHAC adopts amethyst violet
  assert.equal(CATEGORY_THEMES.KHAC.primary, '#a855f7');
});

test('getCategoryTheme resolves known, aliased, and fallback categories safely', () => {
  assert.equal(getCategoryTheme('AM_NHAC').key, 'AM_NHAC');
  assert.equal(getCategoryTheme('san_khau').key, 'SAN_KHAU');
  assert.equal(getCategoryTheme('THE_THAO').key, 'THE_THAO');
  assert.equal(getCategoryTheme('hoi_thao').key, 'HOI_THAO');
  assert.equal(getCategoryTheme('WORKSHOP').key, 'WORKSHOP');
  assert.equal(getCategoryTheme('THAM_QUAN').key, 'THAM_QUAN');
  assert.equal(getCategoryTheme('KHAC').key, 'KHAC');

  // Aliases
  assert.equal(getCategoryTheme('TRIEN_LAM').key, 'THAM_QUAN');
  assert.equal(getCategoryTheme('CONG_NGHE').key, 'HOI_THAO');
  assert.equal(getCategoryTheme('GIAI_TRI').key, 'AM_NHAC');
  assert.equal(getCategoryTheme('CONG_DONG').key, 'KHAC');

  // Fallbacks
  assert.equal(getCategoryTheme(null).key, 'KHAC');
  assert.equal(getCategoryTheme(undefined).key, 'KHAC');
  assert.equal(getCategoryTheme('').key, 'KHAC');
  assert.equal(getCategoryTheme('UNKNOWN_CAT').key, 'KHAC');
});
