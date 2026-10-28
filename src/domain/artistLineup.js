/**
 * Public artist domain helpers and seeded Super Concert artist records.
 * Provides defensive normalization for Supabase relational rows and mock fallbacks.
 */

export const SUPER_CONCERT_ARTISTS = [
  {
    id: 1,
    name: 'Sơn Tùng M-TP',
    stageName: 'Sơn Tùng M-TP',
    realName: 'Nguyễn Thanh Tùng',
    role: 'Pop / R&B',
    primaryRole: 'Pop / R&B',
    eventRole: 'Headliner Stage',
    bio: 'Nghệ sĩ biểu diễn hàng đầu Việt Nam, biểu tượng Pop/R&B đương đại với hàng loạt bản hit quốc tế xô đổ mọi kỷ lục lượt nghe.',
    imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=600&q=80',
    order: 1,
  },
  {
    id: 2,
    name: 'Soobin Hoàng Sơn',
    stageName: 'Soobin Hoàng Sơn',
    realName: 'Nguyễn Hoàng Sơn',
    role: 'R&B / Ballad',
    primaryRole: 'R&B / Ballad',
    eventRole: 'Headliner Stage',
    bio: 'Hoàng tử R&B/Ballad của làng nhạc Việt, giọng ca thực lực với khả năng trình diễn sân khấu và sáng tác thượng thừa.',
    imageUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=600&q=80',
    order: 2,
  },
  {
    id: 3,
    name: 'Suboi',
    stageName: 'Suboi',
    realName: 'Hàng Lâm Trang Anh',
    role: 'Hip-hop / Rap',
    primaryRole: 'Hip-hop / Rap',
    eventRole: 'Opening Stage',
    bio: 'Nữ hoàng Hip-hop/Rap Việt Nam, biểu tượng nữ quyền âm nhạc với phong cách rap gai góc, flow lôi cuốn và tư duy quốc tế.',
    imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    order: 3,
  },
  {
    id: 4,
    name: 'MONO',
    stageName: 'MONO',
    realName: 'Nguyễn Việt Hoàng',
    role: 'Dance-pop',
    primaryRole: 'Dance-pop',
    eventRole: 'Opening Stage',
    bio: 'Ngôi sao Gen Z bùng nổ của dòng nhạc Dance-pop, phong cách biểu diễn trẻ trung, vũ đạo điêu luyện và năng lượng sân khấu bùng cháy.',
    imageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80',
    order: 4,
  },
  {
    id: 5,
    name: 'Chillies',
    stageName: 'Chillies',
    realName: 'Ban nhạc Chillies',
    role: 'Indie Pop / Rock',
    primaryRole: 'Indie Pop / Rock',
    eventRole: 'Opening Stage',
    bio: 'Ban nhạc Indie Pop/Rock được yêu thích nhất với những giai điệu mộc mạc, sâu lắng chạm đến trái tim của hàng triệu khán giả trẻ.',
    imageUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    order: 5,
  },
  {
    id: 6,
    name: 'DJ Mie',
    stageName: 'DJ Mie',
    realName: 'Trương Tiểu My',
    role: 'EDM / Remix',
    primaryRole: 'EDM / Remix',
    eventRole: 'Warm-up DJ Set',
    bio: 'Búp bê DJ quyến rũ hàng đầu Việt Nam, chuyên gia khuấy động các lễ hội âm nhạc với các bản phối EDM/Remix cực kỳ bùng nổ.',
    imageUrl: 'https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?auto=format&fit=crop&w=600&q=80',
    order: 6,
  },
];

/**
 * Normalizes a raw relational row from Supabase (SU_KIEN_NGHE_SI joined with NGHE_SI)
 * or mock structures defensively into a typed public artist record.
 * Handles nested NGHE_SI objects, 1-element arrays, nulls, and flat formats.
 */
export function normalizeArtistRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  // Handle nested NGHE_SI relation shape whether object, array, or null
  const rawArtist = Array.isArray(row.NGHE_SI)
    ? row.NGHE_SI[0]
    : row.NGHE_SI && typeof row.NGHE_SI === 'object'
    ? row.NGHE_SI
    : null;

  const artistObj = rawArtist || row;

  const id = Number(artistObj.NgheSiID ?? row.NgheSiID ?? row.id ?? 0);
  const stageName = artistObj.NgheDanh ? String(artistObj.NgheDanh).trim() : '';
  const realName = artistObj.HoTen ? String(artistObj.HoTen).trim() : '';
  const fallbackName = row.name ? String(row.name).trim() : '';
  const name = stageName || realName || fallbackName;

  if (!name && !id) {
    return null;
  }

  const primaryRole = artistObj.VaiTroChinh ? String(artistObj.VaiTroChinh).trim() : undefined;
  const eventRole = (row.VaiTroTrongSuKien ?? artistObj.VaiTroTrongSuKien)
    ? String(row.VaiTroTrongSuKien ?? artistObj.VaiTroTrongSuKien).trim()
    : undefined;
  const role = primaryRole || eventRole || 'Nghệ sĩ biểu diễn';

  const rawImage =
    artistObj.HinhAnhURL ?? row.HinhAnhURL ?? artistObj.imageUrl ?? row.imageUrl ?? undefined;
  const imageUrl = rawImage ? String(rawImage).trim() : undefined;

  const rawBio = artistObj.TieuSu ?? row.TieuSu ?? artistObj.bio ?? row.bio ?? undefined;
  const bio = rawBio ? String(rawBio).trim() : undefined;

  const order = Number(row.ThuTuHienThi ?? artistObj.ThuTuHienThi ?? row.order ?? 0);

  return {
    id,
    name: name || 'Nghệ sĩ',
    stageName: stageName || undefined,
    realName: realName || undefined,
    role,
    primaryRole,
    eventRole,
    bio,
    imageUrl,
    order,
  };
}

/**
 * Sorts artists by display order (ThuTuHienThi) ascending, falling back to ID.
 */
export function sortArtists(artists) {
  if (!Array.isArray(artists)) return [];
  return [...artists].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.id ?? 0) - (b.id ?? 0));
}

/**
 * Checks if an event is the Super Concert.
 */
export function isSuperConcertEvent(event) {
  if (!event) return false;
  return (
    event.templateKey === 'SUPER_CONCERT_2026' ||
    event.code === 'SUPER_CONCERT_2026' ||
    event.id === 1 ||
    event.slug === 'super-concert-2026'
  );
}

/**
 * Resolves public artists in mock fallback mode.
 * Allowed ONLY for Super Concert; generic events return an empty list.
 */
export function resolvePublicArtistsFallback(event) {
  return isSuperConcertEvent(event) ? [...SUPER_CONCERT_ARTISTS] : [];
}
