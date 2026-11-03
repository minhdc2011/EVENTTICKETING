import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * Parses a 3-digit or 6-digit hex color string into [r, g, b] integer array (0-255).
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function parseHexColor(hex) {
  const cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b];
  }
  throw new Error(`Unsupported hex color format: ${hex}`);
}

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB [r, g, b] triplet (0-255).
 * @param {[number, number, number]} rgb
 * @returns {number}
 */
function getRelativeLuminance([r8, g8, b8]) {
  const [r, g, b] = [r8, g8, b8].map((val) => {
    const s = val / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Computes WCAG 2.1 contrast ratio between two hex colors.
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number}
 */
function getContrastRatio(hexA, hexB) {
  const lumA = getRelativeLuminance(parseHexColor(hexA));
  const lumB = getRelativeLuminance(parseHexColor(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

test('src/components/site/tokens.css defines tokens exclusively inside .et-site with no :root', async () => {
  const css = await readFile(
    new URL('../src/components/site/tokens.css', import.meta.url),
    'utf8',
  );

  // 1. Must not define :root selector
  assert.doesNotMatch(
    css,
    /:root\b/,
    'tokens.css must not contain a :root selector to avoid polluting other runtimes',
  );

  // 2. Must define .et-site selector
  assert.match(
    css,
    /\.et-site\s*\{/,
    'tokens.css must define .et-site selector',
  );

  // 3. Extract .et-site body and ensure all --et-* variables in the file live inside it
  const match = css.match(/\.et-site\s*\{([^}]+)\}/);
  assert.ok(match, '.et-site block must be present');
  const etSiteBlock = match[1];

  const allEtVarsInFile = [...css.matchAll(/(--et-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  assert.ok(allEtVarsInFile.length > 0, 'Must define --et-* tokens');

  for (const varName of allEtVarsInFile) {
    assert.ok(
      etSiteBlock.includes(varName),
      `Variable ${varName} must be declared strictly within .et-site block`,
    );
  }

  // 4. Base styles on .et-site: background, color, font-family
  assert.match(
    etSiteBlock,
    /background:\s*var\(--et-bg\);/,
    '.et-site must set background: var(--et-bg)',
  );
  assert.match(
    etSiteBlock,
    /color:\s*var\(--et-ink\);/,
    '.et-site must set color: var(--et-ink)',
  );
  assert.match(
    etSiteBlock,
    /font-family:\s*var\(--et-font\);/,
    '.et-site must set font-family: var(--et-font)',
  );
});

test('src/components/site/tokens.css defines all required tokens with proper scales', async () => {
  const css = await readFile(
    new URL('../src/components/site/tokens.css', import.meta.url),
    'utf8',
  );
  const match = css.match(/\.et-site\s*\{([^}]+)\}/);
  assert.ok(match, '.et-site block must be present');
  const etSiteBlock = match[1];

  const tokens = {};
  const tokenRegex = /(--et-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = tokenRegex.exec(etSiteBlock)) !== null) {
    tokens[m[1]] = m[2].trim();
  }

  // Required color tokens
  const requiredColors = [
    '--et-blue',
    '--et-blue-hover',
    '--et-on-blue',
    '--et-ink',
    '--et-ink-muted',
    '--et-bg',
    '--et-surface',
    '--et-border',
    '--et-accent',
    '--et-focus',
    '--et-danger',
  ];
  for (const color of requiredColors) {
    assert.ok(tokens[color], `Missing required color token: ${color}`);
    assert.match(tokens[color], /^#[0-9a-fA-F]{3,6}$/, `${color} must be a valid hex color`);
  }

  // Font token reusing var(--font-sans)
  assert.equal(
    tokens['--et-font'],
    'var(--font-sans)',
    '--et-font must reuse var(--font-sans)',
  );

  // Border radii
  assert.equal(tokens['--et-radius-sm'], '4px', '--et-radius-sm must be 4px');
  assert.equal(tokens['--et-radius-md'], '8px', '--et-radius-md must be 8px');

  // Spacing scale: --et-space-1 through --et-space-8
  for (let i = 1; i <= 8; i++) {
    const spaceKey = `--et-space-${i}`;
    assert.ok(tokens[spaceKey], `Missing spacing token: ${spaceKey}`);
  }

  // Shadow & accessibility touch target
  assert.ok(tokens['--et-shadow-card'], 'Missing --et-shadow-card token');
  assert.ok(tokens['--et-tap-min'], 'Missing --et-tap-min token');
  const tapMinPx = parseInt(tokens['--et-tap-min'], 10);
  assert.ok(
    !isNaN(tapMinPx) && tapMinPx >= 44,
    `--et-tap-min must be at least 44px, got ${tokens['--et-tap-min']}`,
  );
});

test('color tokens satisfy WCAG AA contrast ratio >= 4.5:1 across required pairs', async () => {
  const css = await readFile(
    new URL('../src/components/site/tokens.css', import.meta.url),
    'utf8',
  );
  const match = css.match(/\.et-site\s*\{([^}]+)\}/);
  assert.ok(match, '.et-site block must be present');
  const etSiteBlock = match[1];

  const tokens = {};
  const tokenRegex = /(--et-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = tokenRegex.exec(etSiteBlock)) !== null) {
    tokens[m[1]] = m[2].trim();
  }

  const contrastPairs = [
    { fg: '--et-on-blue', bg: '--et-blue', desc: 'on-blue text on primary blue background' },
    { fg: '--et-ink', bg: '--et-surface', desc: 'primary ink text on white surface' },
    { fg: '--et-ink', bg: '--et-bg', desc: 'primary ink text on light background' },
    { fg: '--et-ink-muted', bg: '--et-surface', desc: 'muted ink text on white surface' },
    { fg: '--et-blue', bg: '--et-surface', desc: 'blue link text on white surface' },
  ];

  for (const { fg, bg, desc } of contrastPairs) {
    const fgColor = tokens[fg];
    const bgColor = tokens[bg];
    assert.ok(fgColor, `Token ${fg} must be defined`);
    assert.ok(bgColor, `Token ${bg} must be defined`);

    const ratio = getContrastRatio(fgColor, bgColor);
    assert.ok(
      ratio >= 4.5,
      `WCAG AA contrast failure for ${desc} (${fg}: ${fgColor} vs ${bg}: ${bgColor}): expected >= 4.5:1, got ${ratio.toFixed(2)}:1`,
    );
  }
});

test('src/main.tsx imports src/components/site/tokens.css immediately after index.css', async () => {
  const mainTsx = await readFile(
    new URL('../src/main.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    mainTsx,
    /import\s+['"]\.\/index\.css['"];\s*\r?\nimport\s+['"]\.\/components\/site\/tokens\.css['"];/,
    'main.tsx must import tokens.css immediately after index.css',
  );
});
