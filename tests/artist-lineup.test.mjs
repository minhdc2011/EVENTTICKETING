import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  SUPER_CONCERT_ARTISTS,
  isSuperConcertEvent,
  normalizeArtistRow,
  resolvePublicArtistsFallback,
  sortArtists,
} from '../src/domain/artistLineup.js';

test('Super Concert seeded artist lineup contains all 6 artists in correct ThuTuHienThi order', () => {
  assert.equal(SUPER_CONCERT_ARTISTS.length, 6, 'Super Concert has exactly 6 seeded artists');

  const expectedArtists = [
    {id: 1, name: 'Sơn Tùng M-TP', role: 'Pop / R&B', order: 1},
    {id: 2, name: 'Soobin Hoàng Sơn', role: 'R&B / Ballad', order: 2},
    {id: 3, name: 'Suboi', role: 'Hip-hop / Rap', order: 3},
    {id: 4, name: 'MONO', role: 'Dance-pop', order: 4},
    {id: 5, name: 'Chillies', role: 'Indie Pop / Rock', order: 5},
    {id: 6, name: 'DJ Mie', role: 'EDM / Remix', order: 6},
  ];

  expectedArtists.forEach((expected, index) => {
    const actual = SUPER_CONCERT_ARTISTS[index];
    assert.equal(actual.id, expected.id, `Artist ${index + 1} ID matches`);
    assert.equal(actual.name, expected.name, `Artist ${index + 1} stage name matches`);
    assert.equal(actual.role, expected.role, `Artist ${index + 1} role matches`);
    assert.equal(actual.order, expected.order, `Artist ${index + 1} display order matches`);
    assert.ok(actual.imageUrl && actual.imageUrl.startsWith('https://'), `Artist ${index + 1} has valid image URL`);
  });

  // Verify list is strictly ordered by display order (ThuTuHienThi) 1..6
  for (let i = 0; i < SUPER_CONCERT_ARTISTS.length - 1; i++) {
    assert.ok(
      SUPER_CONCERT_ARTISTS[i].order < SUPER_CONCERT_ARTISTS[i + 1].order,
      `Order ${SUPER_CONCERT_ARTISTS[i].order} must be strictly less than ${SUPER_CONCERT_ARTISTS[i + 1].order}`
    );
  }
});

test('normalizeArtistRow defensively handles nested Supabase relational shapes and nulls', () => {
  // Case A: Supabase nested relation as an object
  const objectRow = {
    ID: 10,
    SuKienID: 1,
    NgheSiID: 1,
    VaiTroTrongSuKien: 'Headliner Stage',
    ThuTuHienThi: 1,
    NGHE_SI: {
      NgheSiID: 1,
      HoTen: 'Nguyễn Thanh Tùng',
      NgheDanh: 'Sơn Tùng M-TP',
      VaiTroChinh: 'Pop / R&B',
      TieuSu: 'Tiểu sử ca sĩ...',
      HinhAnhURL: 'https://example.com/artist1.jpg',
    },
  };
  const normalizedObj = normalizeArtistRow(objectRow);
  assert.ok(normalizedObj);
  assert.equal(normalizedObj.id, 1);
  assert.equal(normalizedObj.name, 'Sơn Tùng M-TP');
  assert.equal(normalizedObj.stageName, 'Sơn Tùng M-TP');
  assert.equal(normalizedObj.realName, 'Nguyễn Thanh Tùng');
  assert.equal(normalizedObj.role, 'Pop / R&B');
  assert.equal(normalizedObj.primaryRole, 'Pop / R&B');
  assert.equal(normalizedObj.eventRole, 'Headliner Stage');
  assert.equal(normalizedObj.imageUrl, 'https://example.com/artist1.jpg');
  assert.equal(normalizedObj.order, 1);

  // Case B: Supabase nested relation as a single-element array
  const arrayRow = {
    ID: 11,
    SuKienID: 1,
    NgheSiID: 2,
    VaiTroTrongSuKien: 'Headliner Stage',
    ThuTuHienThi: 2,
    NGHE_SI: [
      {
        NgheSiID: 2,
        HoTen: 'Nguyễn Hoàng Sơn',
        NgheDanh: 'Soobin Hoàng Sơn',
        VaiTroChinh: 'R&B / Ballad',
        HinhAnhURL: 'https://example.com/artist2.jpg',
      },
    ],
  };
  const normalizedArr = normalizeArtistRow(arrayRow);
  assert.ok(normalizedArr);
  assert.equal(normalizedArr.name, 'Soobin Hoàng Sơn');
  assert.equal(normalizedArr.order, 2);

  // Case C: Missing stage name falls back to real name (HoTen)
  const noStageNameRow = {
    ID: 12,
    SuKienID: 1,
    NgheSiID: 7,
    ThuTuHienThi: 7,
    NGHE_SI: {
      NgheSiID: 7,
      HoTen: 'Ca sĩ Khách Mời',
      NgheDanh: '',
      VaiTroChinh: 'Vocal',
    },
  };
  const normalizedNoStage = normalizeArtistRow(noStageNameRow);
  assert.equal(normalizedNoStage?.name, 'Ca sĩ Khách Mời');

  // Case D: Missing VaiTroChinh falls back to VaiTroTrongSuKien
  const fallbackRoleRow = {
    ID: 13,
    SuKienID: 1,
    NgheSiID: 8,
    VaiTroTrongSuKien: 'Special Guest Appearance',
    ThuTuHienThi: 8,
    NGHE_SI: {
      NgheSiID: 8,
      NgheDanh: 'Guest Artist',
      VaiTroChinh: null,
    },
  };
  const normalizedRole = normalizeArtistRow(fallbackRoleRow);
  assert.equal(normalizedRole?.role, 'Special Guest Appearance');

  // Case E: Null nested relation handles flat properties gracefully
  const flatRow = {
    id: 9,
    name: 'Indie Band',
    role: 'Rock',
    order: 3,
  };
  const normalizedFlat = normalizeArtistRow(flatRow);
  assert.equal(normalizedFlat?.name, 'Indie Band');
  assert.equal(normalizedFlat?.order, 3);

  // Case F: Completely empty or invalid row returns null
  assert.equal(normalizeArtistRow(null), null);
  assert.equal(normalizeArtistRow(undefined), null);
  assert.equal(normalizeArtistRow({}), null);
});

test('sortArtists orders artists ascending by ThuTuHienThi', () => {
  const unsorted = [
    {id: 6, name: 'DJ Mie', order: 6},
    {id: 1, name: 'Sơn Tùng M-TP', order: 1},
    {id: 3, name: 'Suboi', order: 3},
    {id: 2, name: 'Soobin Hoàng Sơn', order: 2},
  ];

  const sorted = sortArtists(unsorted);
  assert.deepEqual(
    sorted.map((a) => a.order),
    [1, 2, 3, 6]
  );
  assert.equal(sorted[0].name, 'Sơn Tùng M-TP');
  assert.equal(sorted[3].name, 'DJ Mie');
});

test('resolvePublicArtistsFallback enforces Super Concert fallback and generic event isolation', () => {
  // Super Concert event record retrieves all seeded artists
  const superConcertEvent = {
    id: 1,
    code: 'SUPER_CONCERT_2026',
    slug: 'super-concert-2026',
    templateKey: 'SUPER_CONCERT_2026',
  };

  const concertArtists = resolvePublicArtistsFallback(superConcertEvent);
  assert.equal(concertArtists.length, 6, 'Super Concert returns seeded 6 artists');
  assert.equal(concertArtists[0].name, 'Sơn Tùng M-TP');
  assert.equal(concertArtists[5].name, 'DJ Mie');

  // Generic event with no artists returns empty array
  const genericWorkshopEvent = {
    id: 2,
    code: 'CREATIVE_TECH_SUMMIT',
    slug: 'creative-tech-summit-2026',
    templateKey: 'DEFAULT',
  };

  const genericArtists = resolvePublicArtistsFallback(genericWorkshopEvent);
  assert.deepEqual(genericArtists, [], 'Generic event returns empty artist list');

  // Arbitrary non-concert event returns empty array
  const emptyEventArtists = resolvePublicArtistsFallback({id: 999, templateKey: 'DEFAULT'});
  assert.deepEqual(emptyEventArtists, [], 'Arbitrary non-concert event returns empty artist list');
});

test('isSuperConcertEvent accurately detects concert variants and rejects generic events', () => {
  assert.equal(isSuperConcertEvent({templateKey: 'SUPER_CONCERT_2026'}), true);
  assert.equal(isSuperConcertEvent({code: 'SUPER_CONCERT_2026'}), true);
  assert.equal(isSuperConcertEvent({id: 1}), true);
  assert.equal(isSuperConcertEvent({slug: 'super-concert-2026'}), true);

  assert.equal(isSuperConcertEvent({templateKey: 'DEFAULT'}), false);
  assert.equal(isSuperConcertEvent({id: 2}), false);
  assert.equal(isSuperConcertEvent(null), false);
  assert.equal(isSuperConcertEvent(undefined), false);
});

test('artistService.ts implements typed query, ThuTuHienThi ordering, and Supabase integration', async () => {
  const serviceTs = await readFile(
    new URL('../src/services/artistService.ts', import.meta.url),
    'utf8'
  );
  const eventServiceTs = await readFile(
    new URL('../src/services/eventService.ts', import.meta.url),
    'utf8'
  );

  // 1. Queries SU_KIEN_NGHE_SI table
  assert.match(
    serviceTs,
    /\.from\(['"]SU_KIEN_NGHE_SI['"]\)/i,
    'artistService queries SU_KIEN_NGHE_SI'
  );

  // 2. Orders by ThuTuHienThi ascending
  assert.match(
    serviceTs,
    /\.order\(['"]ThuTuHienThi['"],\s*\{\s*ascending:\s*true\s*\}\)/i,
    'artistService orders by ThuTuHienThi ascending'
  );

  // 3. Joins NGHE_SI relation
  assert.match(
    serviceTs,
    /NGHE_SI\s*\(/i,
    'artistService selects nested NGHE_SI relation'
  );

  // 4. Fallback is restricted to Super Concert
  assert.match(
    serviceTs,
    /isSuperConcertEvent\(event\)/i,
    'artistService checks isSuperConcertEvent for fallback'
  );

  // 5. eventService re-exports public artist utilities
  assert.match(
    eventServiceTs,
    /export\s*\{[^}]*loadPublicArtists/i,
    'eventService re-exports loadPublicArtists'
  );
});

test('architectural removal of raw HTML artist fragment from production code', async () => {
  const concertSectionsTsx = await readFile(
    new URL('../src/components/ConcertSections.tsx', import.meta.url),
    'utf8'
  );
  const artistLineupSectionTsx = await readFile(
    new URL('../src/components/event-template/ArtistLineupSection.tsx', import.meta.url),
    'utf8'
  );
  const genericPageTsx = await readFile(
    new URL('../src/components/GenericEventPage.tsx', import.meta.url),
    'utf8'
  );

  // 1. ConcertSections no longer imports artist-lineup.html?raw
  assert.doesNotMatch(
    concertSectionsTsx,
    /artist-lineup\.html\?raw/i,
    'ConcertSections does not import artist-lineup.html?raw'
  );

  // 2. ConcertSections does not render raw HTML for ArtistLineup
  assert.doesNotMatch(
    concertSectionsTsx,
    /<StaticMarkup\s+html=\{artistLineupHtml\}/i,
    'ConcertSections does not render raw HTML for ArtistLineup'
  );

  // 3. ArtistLineupSection is pure React and contains no dangerouslySetInnerHTML
  assert.doesNotMatch(
    artistLineupSectionTsx,
    /dangerouslySetInnerHTML/i,
    'ArtistLineupSection contains no dangerouslySetInnerHTML'
  );

  // 4. Stable anchor hook #artist-lineup is preserved
  assert.match(
    artistLineupSectionTsx,
    /id="artist-lineup"/i,
    'ArtistLineupSection preserves id="artist-lineup" for navigation and runtime'
  );

  // 5. Semantic heading and image alt text are preserved
  assert.match(
    artistLineupSectionTsx,
    /<h2[\s\S]*?>[\s\S]*?DÀN NGHỆ SĨ KHÁCH MỜI[\s\S]*?<\/h2>/i,
    'ArtistLineupSection preserves semantic h2 heading'
  );
  assert.match(
    artistLineupSectionTsx,
    /alt=\{artist\.name\}/i,
    'ArtistLineupSection renders accessible image alt text'
  );

  // 6. GenericEventPage wires data-driven lineup slot with event passed
  assert.match(
    genericPageTsx,
    /lineup:\s*<ArtistLineup\s+event=\{event\}\s*\/>/i,
    'GenericEventPage supplies lineup slot with event data'
  );
});
