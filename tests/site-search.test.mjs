import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('SearchBlock.tsx imports ./site.css without altering props, markup, or aria-labels', async () => {
  const tsx = await readFile(
    new URL('../src/components/site/SearchBlock.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    tsx,
    /import\s+['"]\.\/site\.css['"];/,
    'SearchBlock.tsx must import ./site.css',
  );
  assert.match(tsx, /className="et-search"/, 'Markup must preserve et-search class');
  assert.match(tsx, /className="et-search__field"/, 'Markup must preserve et-search__field class');
  assert.match(tsx, /className="et-search__submit"/, 'Markup must preserve et-search__submit class');
  assert.match(
    tsx,
    /aria-label="Tìm kiếm sự kiện, địa điểm"/,
    'Input aria-label must remain intact',
  );
});

test('site.css defines SearchBlock selectors (.et-search, .et-search__field, .et-search__submit)', async () => {
  const css = await readFile(
    new URL('../src/components/site/site.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /\.et-search\b/, 'site.css must contain .et-search');
  assert.match(css, /\.et-search__field\b/, 'site.css must contain .et-search__field');
  assert.match(css, /\.et-search__submit\b/, 'site.css must contain .et-search__submit');
});

test('site.css enforces min-height var(--et-tap-min) on field and submit, and min-width on submit', async () => {
  const css = await readFile(
    new URL('../src/components/site/site.css', import.meta.url),
    'utf8',
  );

  assert.match(
    css,
    /\.et-search__field\s*\{[\s\S]*?min-height:\s*var\(--et-tap-min\);/,
    '.et-search__field must enforce min-height: var(--et-tap-min)',
  );
  assert.match(
    css,
    /\.et-search__submit\s*\{[\s\S]*?min-height:\s*var\(--et-tap-min\);/,
    '.et-search__submit must enforce min-height: var(--et-tap-min)',
  );
  assert.match(
    css,
    /\.et-search__submit\s*\{[\s\S]*?min-width:\s*var\(--et-tap-min\);/,
    '.et-search__submit must enforce min-width: var(--et-tap-min)',
  );
});

test('site.css defines input font-size >= 1rem and min-height var(--et-tap-min)', async () => {
  const css = await readFile(
    new URL('../src/components/site/site.css', import.meta.url),
    'utf8',
  );

  assert.match(
    css,
    /\.et-search__field\s+input\s*\{[\s\S]*?font-size:\s*1rem;/,
    '.et-search__field input must set font-size: 1rem (>= 16px to prevent iOS auto-zoom)',
  );
  assert.match(
    css,
    /\.et-search__field\s+input\s*\{[\s\S]*?min-height:\s*var\(--et-tap-min\);/,
    '.et-search__field input must set min-height: var(--et-tap-min)',
  );
});

test('site.css implements visible focus via :focus-within and :focus-visible using var(--et-focus)', async () => {
  const css = await readFile(
    new URL('../src/components/site/site.css', import.meta.url),
    'utf8',
  );

  assert.match(
    css,
    /\.et-search__field:focus-within\s*\{[\s\S]*?outline:\s*3px\s+solid\s+var\(--et-focus\);/,
    '.et-search__field:focus-within must have outline: 3px solid var(--et-focus)',
  );
  assert.match(
    css,
    /\.et-search__submit:focus-visible\s*\{[\s\S]*?outline:\s*3px\s+solid\s+var\(--et-focus\);/,
    '.et-search__submit:focus-visible must have outline: 3px solid var(--et-focus)',
  );

  // Ensure outline: none is NOT set on input without :focus-within
  const searchBlockIndex = css.indexOf('/* SearchBlock');
  assert.ok(searchBlockIndex !== -1, 'site.css must have SearchBlock section');
  const searchSection = css.slice(searchBlockIndex);

  const outlines = [...searchSection.matchAll(/outline:\s*none/g)];
  for (const match of outlines) {
    const precedingSlice = searchSection.slice(Math.max(0, match.index - 100), match.index);
    assert.match(
      precedingSlice,
      /:focus-within/,
      'outline: none on input is only allowed when parent field has :focus-within',
    );
  }
});

test('site.css SearchBlock uses only --et-* tokens with no raw hex colors', async () => {
  const css = await readFile(
    new URL('../src/components/site/site.css', import.meta.url),
    'utf8',
  );

  const searchBlockIndex = css.indexOf('/* SearchBlock');
  assert.ok(searchBlockIndex !== -1, 'site.css must contain SearchBlock comment');
  const searchSection = css.slice(searchBlockIndex);

  const hexMatches = searchSection.match(/#[0-9a-fA-F]{3,8}\b/g);
  assert.equal(
    hexMatches,
    null,
    `SearchBlock section must not contain any hex colors, found: ${hexMatches?.join(', ')}`,
  );
});

test('site.css implements @media (max-width: 480px) stacking search column and expanding submit to 100%', async () => {
  const css = await readFile(
    new URL('../src/components/site/site.css', import.meta.url),
    'utf8',
  );

  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*480px\s*\)[\s\S]*?\.et-search\s*\{[\s\S]*?flex-direction:\s*column;/,
    '@media (max-width: 480px) must stack .et-search as flex-direction: column',
  );
  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*480px\s*\)[\s\S]*?\.et-search__submit\s*\{[\s\S]*?width:\s*100%;/,
    '@media (max-width: 480px) must expand .et-search__submit to width: 100%',
  );
});
