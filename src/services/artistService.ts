import {isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import {
  SUPER_CONCERT_ARTISTS,
  isSuperConcertEvent,
  normalizeArtistRow,
  resolvePublicArtistsFallback,
  sortArtists,
  type PublicArtist,
  type PublicArtistRecord,
} from '../domain/artistLineup.js';
import type {PublicEventRecord} from './eventService';

export type {PublicArtist, PublicArtistRecord};
export {
  SUPER_CONCERT_ARTISTS,
  isSuperConcertEvent,
  normalizeArtistRow,
  resolvePublicArtistsFallback,
  sortArtists,
};

/**
 * Loads the public artist lineup for an event ordered by ThuTuHienThi.
 *
 * In mock mode or when Supabase is not configured:
 * - Super Concert returns the seeded 6 headliners/performers.
 * - Generic events return an empty list.
 *
 * In configured Supabase mode:
 * - Queries SU_KIEN_NGHE_SI joined with NGHE_SI for the target SuKienID.
 * - Handles nested Supabase relational shapes defensively.
 * - Falls back to seeded records strictly for Super Concert if database is unavailable.
 */
export async function loadPublicArtists(
  event?: Partial<PublicEventRecord> | null,
): Promise<PublicArtistRecord[]> {
  const isConcert = isSuperConcertEvent(event);
  const eventId = event?.id ?? (isConcert ? runtimeConfig.eventDatabaseId : null);

  if (runtimeConfig.useMockData || !isSupabaseConfigured()) {
    if (isConcert) {
      return resolvePublicArtistsFallback(event);
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = JSON.parse(
          localStorage.getItem('eventticketing:mock-organizer-events') || '[]',
        );
        const found = stored.find(
          (e: any) =>
            (eventId && e.id === eventId) ||
            (event?.slug && (e.slug === event.slug || String(e.slug).replace(/\/$/, '') === event.slug)),
        );
        if (found && Array.isArray(found.artists) && found.artists.length > 0) {
          const items = found.artists
            .map((a: any) =>
              normalizeArtistRow({
                NgheSiID: a.artistId ?? a.id,
                NgheDanh: a.name,
                HoTen: a.realName || a.name,
                VaiTroChinh: a.role,
                VaiTroTrongSuKien: a.role,
                TieuSu: a.bio,
                HinhAnhURL: a.imageUrl,
                ThuTuHienThi: a.order,
              }),
            )
            .filter((a: any): a is PublicArtistRecord => a !== null);
          return sortArtists(items);
        }
      } catch {
        // ignore
      }
    }
    return resolvePublicArtistsFallback(event);
  }

  if (!eventId) {
    return resolvePublicArtistsFallback(event);
  }

  try {
    const {requireSupabaseClient} = await import('./supabaseClient');
    const supabase = requireSupabaseClient() as any;

    const {data, error} = await supabase
      .from('SU_KIEN_NGHE_SI')
      .select(`
        ID,
        SuKienID,
        NgheSiID,
        VaiTroTrongSuKien,
        ThuTuHienThi,
        NGHE_SI (
          NgheSiID,
          HoTen,
          NgheDanh,
          VaiTroChinh,
          TieuSu,
          HinhAnhURL
        )
      `)
      .eq('SuKienID', eventId)
      .order('ThuTuHienThi', {ascending: true});

    if (error) {
      console.warn('Không thể tải nghệ sĩ từ Supabase:', error);
      return resolvePublicArtistsFallback(event);
    }

    if (!data || data.length === 0) {
      return resolvePublicArtistsFallback(event);
    }

    const artists = (data as unknown[])
      .map(normalizeArtistRow)
      .filter((a): a is PublicArtistRecord => a !== null);

    const sorted = sortArtists(artists);
    return sorted.length > 0 ? sorted : resolvePublicArtistsFallback(event);
  } catch (err) {
    console.warn('Lỗi kết nối khi tải danh sách nghệ sĩ:', err);
    return resolvePublicArtistsFallback(event);
  }
}

export {loadPublicArtists as loadEventArtists};
