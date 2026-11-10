/**
 * Fictional artists used ONLY to exercise the catalog artist carousel/grid in mock mode.
 * Portraits are generated illustrations (public/media/artists/test), never real people.
 */
function assetUrl(path) {
  const baseUrl = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '');
  return `${baseUrl}${path}`;
}

const TEST_ARTISTS = [
  {id: 9001, slug: 'minh-khoa', name: 'Minh Khoa', role: 'Ballad / Pop'},
  {id: 9002, slug: 'thao-van', name: 'Thảo Vân', role: 'Acoustic / Folk'},
  {id: 9003, slug: 'neon-harbor', name: 'Neon Harbor', role: 'Synth-pop / Band'},
  {id: 9004, slug: 'bao-cat', name: 'Bão Cát', role: 'Rock / Alternative'},
  {id: 9005, slug: 'lunar-echo', name: 'Lunar Echo', role: 'Indie / Dream-pop'},
  {id: 9006, slug: 'dj-kiwi', name: 'DJ Kiwi', role: 'House / Techno'},
  {id: 9007, slug: 'pho-co-band', name: 'Phố Cổ Band', role: 'Jazz / Blues'},
  {id: 9008, slug: 'ha-linh', name: 'Hà Linh', role: 'R&B / Soul'},
].map((artist, index) => ({
  id: artist.id,
  name: artist.name,
  stageName: artist.name,
  role: artist.role,
  primaryRole: artist.role,
  imageUrl: assetUrl(`/media/artists/test/${artist.slug}.svg`),
  order: 100 + index,
}));

const BY_EVENT_SLUG = {
  'autumn-arena-festival-2026': [0, 2, 4, 5],
  'mo-mang-men-say-2': [0, 1, 7],
  'musique-de-salon-de-nho-mot-thoi': [1, 6],
  'ticketgo-autumn-marathon-music-night': [3, 5, 7],
};

export function resolveMockCatalogExtraArtists(event) {
  const picks = BY_EVENT_SLUG[String(event?.slug ?? '')] ?? [];
  return picks.map((i) => TEST_ARTISTS[i]);
}
