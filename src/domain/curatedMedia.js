function resolveAssetUrl(path) {
  const baseUrl = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

const EVENT_MEDIA = {
  'super-concert-2026': {
    bannerUrl: '/media/events/super-concert-arena.jpg',
    posterUrl: '/media/events/super-concert-poster.jpg',
  },
  'autumn-arena-festival-2026': {
    bannerUrl: '/media/events/autumn-arena-festival.jpg',
    posterUrl: '/media/events/autumn-arena-festival-poster.jpg',
  },
  'musique-de-salon-de-nho-mot-thoi': {
    bannerUrl: '/media/events/musique-de-salon.jpg',
    posterUrl: '/media/events/musique-de-salon-poster.jpg',
  },
  'mo-mang-men-say-2': {
    bannerUrl: '/media/events/mo-mang-men-say.jpg',
    posterUrl: '/media/events/mo-mang-men-say-poster.jpg',
  },
};

const ARTIST_MEDIA = new Map([
  ['sơn tùng m-tp', '/media/artists/son-tung-mtp.png'],
  ['son tung m-tp', '/media/artists/son-tung-mtp.png'],
  ['soobin hoàng sơn', '/media/artists/soobin.jpg'],
  ['soobin hoang son', '/media/artists/soobin.jpg'],
  ['suboi', '/media/artists/suboi.jpg'],
  ['mono', '/media/artists/mono-mark.svg'],
  ['chillies', '/media/artists/chillies-logo.jpg'],
  ['dj mie', '/media/artists/dj-mie-stage.jpg'],
]);

function normalizeLookupKey(value) {
  return String(value ?? '').trim().toLocaleLowerCase('vi');
}

export function resolveCuratedEventMedia(event) {
  const slug = normalizeLookupKey(event?.slug ?? event);
  const media = EVENT_MEDIA[slug];
  if (!media) return null;
  return {
    bannerUrl: resolveAssetUrl(media.bannerUrl),
    posterUrl: resolveAssetUrl(media.posterUrl),
  };
}

export function resolveCuratedArtistImage(name) {
  const path = ARTIST_MEDIA.get(normalizeLookupKey(name));
  return path ? resolveAssetUrl(path) : undefined;
}

export function applyCuratedEventMedia(event) {
  const curated = resolveCuratedEventMedia(event);
  return curated ? {...event, ...curated} : event;
}
