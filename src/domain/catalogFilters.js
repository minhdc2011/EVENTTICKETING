import {normalizeArtistRow, sortArtists} from './artistLineup.js';
import {getCategoryTheme} from './categoryThemes.js';

/**
 * Catalog artist data and combined filtering (artist + category + keyword).
 * Artist keys are namespaced by source so mock, API and DB ids never collide.
 */

/**
 * Builds a stable key: `${source}:${id}` for real ids, otherwise `${source}:name:${lowercased name}`.
 */
export function catalogArtistKey(source, id, name) {
  const numericId = Number(id);
  if (Number.isFinite(numericId) && numericId > 0) {
    return `${source}:${numericId}`;
  }
  return `${source}:name:${String(name ?? '').trim().toLowerCase()}`;
}

/**
 * Normalizes artist rows (array, single object, null...) into deduped CatalogArtist[].
 * Reuses normalizeArtistRow/sortArtists. Rows without a real name and id are dropped.
 */
export function normalizeCatalogArtists(rows, source) {
  const list = Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? [rows] : [];
  const normalized = list.map((row) => normalizeArtistRow(row)).filter(Boolean);
  const seen = new Set();
  const result = [];
  for (const artist of sortArtists(normalized)) {
    const hasRealName = Boolean(artist.stageName || artist.realName || (artist.name && artist.name !== 'Nghệ sĩ'));
    if (!hasRealName && !(artist.id > 0)) continue;
    const key = catalogArtistKey(source, artist.id, artist.name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      key,
      id: artist.id,
      name: artist.name,
      ...(artist.imageUrl ? {imageUrl: artist.imageUrl} : {}),
      ...(artist.role && artist.role !== 'Nghệ sĩ biểu diễn' ? {role: artist.role} : {}),
    });
  }
  return result;
}

/**
 * Groups SU_KIEN_NGHE_SI link rows by SuKienID into Map<number, CatalogArtist[]>.
 */
export function groupCatalogArtistsByEvent(linkRows, source = 'db') {
  const buckets = new Map();
  if (Array.isArray(linkRows)) {
    for (const row of linkRows) {
      const eventId = Number(row?.SuKienID);
      if (!Number.isFinite(eventId) || eventId <= 0) continue;
      if (!buckets.has(eventId)) buckets.set(eventId, []);
      buckets.get(eventId).push(row);
    }
  }
  const grouped = new Map();
  for (const [eventId, rows] of buckets) {
    grouped.set(eventId, normalizeCatalogArtists(rows, source));
  }
  return grouped;
}

/**
 * Unique artist options across events (by key), sorted by name in 'vi' locale.
 */
export function collectCatalogArtistOptions(events) {
  const byName = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const countedInEvent = new Set();
    for (const artist of event?.artists ?? []) {
      if (!artist?.key) continue;
      const nameKey = String(artist.name ?? '').trim().toLocaleLowerCase('vi');
      if (!nameKey) continue;
      if (!byName.has(nameKey)) {
        byName.set(nameKey, {...artist, aliasKeys: [artist.key], eventCount: 0});
      } else {
        const option = byName.get(nameKey);
        if (!option.aliasKeys.includes(artist.key)) option.aliasKeys.push(artist.key);
        if (!option.imageUrl && artist.imageUrl) option.imageUrl = artist.imageUrl;
        if (!option.role && artist.role) option.role = artist.role;
      }
      if (!countedInEvent.has(nameKey)) {
        const option = byName.get(nameKey);
        option.eventCount += 1;
        countedInEvent.add(nameKey);
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/**
 * Returns a new array with the key selected, or removed if already selected.
 */
export function toggleCatalogArtist(selectedKeys, key) {
  const current = Array.isArray(selectedKeys) ? selectedKeys : [];
  return current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
}

/**
 * Filters events with AND across artist, category and query.
 * Artist: event matches if it has ANY selected key; empty selection = no constraint.
 */
export function filterCatalogEvents(events, {artistKeys = [], category = 'ALL', query = ''} = {}) {
  const wanted = new Set(artistKeys);
  const needle = String(query ?? '').trim().toLowerCase();
  return (Array.isArray(events) ? events : []).filter((event) => {
    const artists = Array.isArray(event.artists) ? event.artists : [];
    if (wanted.size > 0 && !artists.some((a) => wanted.has(a.key))) return false;
    if (category !== 'ALL' && getCategoryTheme(event.category).key !== category) return false;
    if (needle) {
      const haystack = [event.name, event.venueName, ...artists.map((a) => a.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}
