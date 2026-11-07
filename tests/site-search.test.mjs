import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  collectCatalogArtistOptions,
  filterCatalogEvents,
} from '../src/domain/catalogFilters.js';

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

test('ArtistFilter.tsx markup and accessibility standards', async () => {
  const tsx = await readFile(
    new URL('../src/components/site/ArtistFilter.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    tsx,
    /import\s+['"]\.\/ArtistFilter\.css['"];/,
    'ArtistFilter.tsx must import ./ArtistFilter.css',
  );
  assert.match(
    tsx,
    /<label[^>]*className=["']et-artist-filter__label["'][^>]*htmlFor=\{selectId\}[^>]*>\s*Nghệ sĩ\s*<\/label>/,
    'ArtistFilter must render explicit label "Nghệ sĩ" bound to select via htmlFor',
  );
  assert.match(
    tsx,
    /<select[^>]*className=["']et-artist-filter__select["']/,
    'ArtistFilter must render a keyboard-accessible native <select> element',
  );
  assert.match(
    tsx,
    /<option value="">Tất cả nghệ sĩ<\/option>/,
    'ArtistFilter must have default option "Tất cả nghệ sĩ" with empty string value',
  );
  assert.match(
    tsx,
    /value=\{artist\.key\}/,
    'ArtistFilter options must use artist.key as value',
  );
  assert.match(
    tsx,
    /data-artist-id=\{String\(artist\.id\)\}/,
    'ArtistFilter options must set data-artist-id attribute',
  );
  assert.match(
    tsx,
    /new Set<string>\(\)/,
    'ArtistFilter must deduplicate artists by key using a Set',
  );
  assert.match(
    tsx,
    /<button[^>]*type="button"[^>]*className="et-artist-filter__clear"[\s\S]*?>\s*Bỏ chọn nghệ sĩ\s*<\/button>/,
    'ArtistFilter must provide a clear button labeled "Bỏ chọn nghệ sĩ" when an artist is selected',
  );
  assert.match(
    tsx,
    /aria-describedby=\{isEmpty \? hintId : undefined\}/,
    'ArtistFilter must link empty hint via aria-describedby',
  );
});

test('ArtistFilter.css uses exclusively --et-* tokens with no raw hex colors', async () => {
  const css = await readFile(
    new URL('../src/components/site/ArtistFilter.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /\.et-artist-filter\b/, 'ArtistFilter.css must define .et-artist-filter');
  assert.match(css, /\.et-artist-filter__select\b/, 'ArtistFilter.css must define .et-artist-filter__select');
  assert.match(css, /\.et-artist-filter__clear\b/, 'ArtistFilter.css must define .et-artist-filter__clear');

  const hexMatches = css.match(/#[0-9a-fA-F]{3,8}\b/g);
  assert.equal(
    hexMatches,
    null,
    `ArtistFilter.css must not contain any raw hex colors, found: ${hexMatches?.join(', ')}`,
  );

  assert.match(css, /var\(--et-tap-min\)/, 'ArtistFilter.css must reference --et-tap-min');
  assert.match(css, /var\(--et-focus\)/, 'ArtistFilter.css must reference --et-focus');
  assert.match(css, /var\(--et-border\)/, 'ArtistFilter.css must reference --et-border');
  assert.match(css, /var\(--et-surface\)/, 'ArtistFilter.css must reference --et-surface');
});

test('ArtistFilter.css enforces tap targets, font size, and visible focus outline', async () => {
  const css = await readFile(
    new URL('../src/components/site/ArtistFilter.css', import.meta.url),
    'utf8',
  );

  assert.match(
    css,
    /\.et-artist-filter__select\s*\{[\s\S]*?min-height:\s*var\(--et-tap-min\);/,
    '.et-artist-filter__select must enforce min-height: var(--et-tap-min)',
  );
  assert.match(
    css,
    /\.et-artist-filter__select\s*\{[\s\S]*?font-size:\s*1rem;/,
    '.et-artist-filter__select must set font-size: 1rem (>= 16px)',
  );
  assert.match(
    css,
    /\.et-artist-filter__clear\s*\{[\s\S]*?min-height:\s*var\(--et-tap-min\);/,
    '.et-artist-filter__clear must enforce min-height: var(--et-tap-min)',
  );
  assert.match(
    css,
    /\.et-artist-filter__clear\s*\{[\s\S]*?font-size:\s*1rem;/,
    '.et-artist-filter__clear must set font-size: 1rem',
  );
  assert.match(
    css,
    /outline:\s*3px\s+solid\s+var\(--et-focus\);\s*outline-offset:\s*2px;/,
    'ArtistFilter.css must define 3px solid var(--et-focus) with 2px offset for visible focus',
  );
});

test('ArtistFilter.css prevents horizontal overflow and defines responsive mobile layout', async () => {
  const css = await readFile(
    new URL('../src/components/site/ArtistFilter.css', import.meta.url),
    'utf8',
  );

  assert.match(
    css,
    /\.et-artist-filter\s*\{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;/,
    '.et-artist-filter must allow flex wrapping and clamp width to prevent overflow',
  );
  assert.match(
    css,
    /\.et-artist-filter__select\s*\{[\s\S]*?text-overflow:\s*ellipsis;/,
    '.et-artist-filter__select must use text-overflow: ellipsis for long artist names',
  );
  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*480px\s*\)[\s\S]*?\.et-artist-filter\s*\{[\s\S]*?flex-direction:\s*column;/,
    '@media (max-width: 480px) must stack .et-artist-filter as column',
  );
  assert.match(
    css,
    /@media\s*\(\s*max-width:\s*480px\s*\)[\s\S]*?\.et-artist-filter__clear\s*\{[\s\S]*?width:\s*100%;/,
    '@media (max-width: 480px) must expand clear button to full width',
  );
});

test('EventCatalog.tsx integrates ArtistFilter and handles three-way filtering and resets', async () => {
  const tsx = await readFile(
    new URL('../src/components/EventCatalog.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    tsx,
    /import\s+\{\s*ArtistFilter\s*\}\s+from\s+['"]\.\/site\/ArtistFilter['"];/,
    'EventCatalog.tsx must import ArtistFilter',
  );
  assert.match(
    tsx,
    /import\s+\{[^}]*collectCatalogArtistOptions[^}]*filterCatalogEvents[^}]*\}\s+from\s+['"]\.\.\/domain\/catalogFilters\.js['"];/,
    'EventCatalog.tsx must import collectCatalogArtistOptions and filterCatalogEvents',
  );
  assert.match(
    tsx,
    /const\s+\[selectedArtistKey,\s*setSelectedArtistKey\]\s*=\s*useState\(['"]['"]\);/,
    'EventCatalog.tsx must maintain selectedArtistKey state defaulting to empty string',
  );
  assert.match(
    tsx,
    /<ArtistFilter\s+artists=\{artistOptions\}\s+value=\{selectedArtistKey\}\s+onChange=\{setSelectedArtistKey\}\s*\/>/,
    'EventCatalog.tsx must render ArtistFilter with artists, value, and onChange props',
  );
  assert.match(
    tsx,
    /filterCatalogEvents\(events,\s*\{\s*artistKeys:\s*selectedArtistKey\s*\?\s*\[selectedArtistKey\]\s*:\s*\[\],\s*category,\s*query,?\s*\}\)/,
    'EventCatalog.tsx must filter events using filterCatalogEvents with artist, category, and query',
  );
  assert.match(
    tsx,
    /setQuery\(['"]['"]\);\s*setCategory\(['"]ALL['"]\);\s*setSelectedArtistKey\(['"]['"]\);/,
    'EventCatalog.tsx resetFilters must clear query, category, and selectedArtistKey',
  );
  assert.match(
    tsx,
    /role="status"\s+aria-live="polite"/,
    'marketplace-query-feedback must be an accessible status region with polite announcements',
  );
  assert.match(
    tsx,
    /nghệ sĩ:\s*<strong>\{selectedArtist\.name\}<\/strong>/,
    'marketplace-query-feedback must display the selected artist name',
  );
});

test('Catalog filter integration: combined artist, category, query filtering and zero-data safety', () => {
  const testArtists = {
    vu: {key: 'db:1', id: 1, name: 'Vũ'},
    den: {key: 'db:2', id: 2, name: 'Đen Vâu'},
    chillies: {key: 'mock:3', id: 3, name: 'Chillies'},
  };

  const catalogEvents = [
    {
      id: 1,
      name: 'Một Vạn Năm Concert',
      venueName: 'Sân vận động Quân khu 7',
      category: 'AM_NHAC',
      artists: [testArtists.vu],
    },
    {
      id: 2,
      name: 'Show của Đen',
      venueName: 'Cung Điền kinh Hà Nội',
      category: 'AM_NHAC',
      artists: [testArtists.den],
    },
    {
      id: 3,
      name: 'Đêm Nhạc Đôi Indie',
      venueName: 'Nhà hát Hòa Bình',
      category: 'AM_NHAC',
      artists: [testArtists.vu, testArtists.chillies],
    },
    {
      id: 4,
      name: 'Hội thảo Sáng tạo Âm nhạc',
      venueName: 'GEM Center',
      category: 'HOI_THAO',
      artists: [testArtists.vu],
    },
    {
      id: 5,
      name: 'Triển lãm Công nghệ 2026',
      venueName: 'SECC',
      category: 'TRIEN_LAM',
      artists: [],
    },
    {
      id: 6,
      name: 'Sự kiện chưa có nghệ sĩ',
      venueName: 'Sân khấu nhỏ',
      category: 'SAN_KHAU',
    },
  ];

  // 1. collectCatalogArtistOptions returns deduplicated, sorted list
  const artistOptions = collectCatalogArtistOptions(catalogEvents);
  assert.deepEqual(
    artistOptions.map((a) => a.key),
    ['mock:3', 'db:2', 'db:1'],
    'Options must be deduplicated and sorted in vi locale',
  );

  // 2. Default state (no artistKey): all events are returned, including events without artists
  const defaultFiltered = filterCatalogEvents(catalogEvents, {
    artistKeys: [],
    category: 'ALL',
    query: '',
  });
  assert.equal(
    defaultFiltered.length,
    6,
    'Default filter must keep all events visible even without artist data',
  );

  // 3. Artist filtering updates event list
  const vuEvents = filterCatalogEvents(catalogEvents, {
    artistKeys: [testArtists.vu.key],
    category: 'ALL',
    query: '',
  });
  assert.deepEqual(
    vuEvents.map((e) => e.name),
    ['Một Vạn Năm Concert', 'Đêm Nhạc Đôi Indie', 'Hội thảo Sáng tạo Âm nhạc'],
    'Filtering by Vu must match events featuring Vu',
  );

  // 4. Combined 3-way filtering: Artist + Category + Query
  const musicVuEvents = filterCatalogEvents(catalogEvents, {
    artistKeys: [testArtists.vu.key],
    category: 'AM_NHAC',
    query: 'Quân khu',
  });
  assert.deepEqual(
    musicVuEvents.map((e) => e.name),
    ['Một Vạn Năm Concert'],
    'Artist, category, and keyword filters must combine with AND logic',
  );

  // 5. Zero-match state when combination yields no results
  const zeroMatches = filterCatalogEvents(catalogEvents, {
    artistKeys: [testArtists.chillies.key],
    category: 'HOI_THAO',
    query: '',
  });
  assert.deepEqual(
    zeroMatches,
    [],
    'Zero-match combinations must return an empty list gracefully',
  );

  // 6. Resets: clearing all three filter conditions returns full catalog
  const afterReset = filterCatalogEvents(catalogEvents, {
    artistKeys: [],
    category: 'ALL',
    query: '',
  });
  assert.equal(afterReset.length, 6, 'Resetting conditions restores full catalog');
});
