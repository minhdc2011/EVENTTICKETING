import {isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import {
  SUPER_CONCERT_SCHEDULE,
  isSuperConcertEvent,
  normalizeScheduleRow,
  resolvePublicScheduleFallback,
  sortScheduleItems,
  type PublicScheduleItem,
  type PublicScheduleRecord,
} from '../domain/publicSchedule.js';
import type {PublicEventRecord} from './eventService';

export type {PublicScheduleItem, PublicScheduleRecord};
export {
  SUPER_CONCERT_SCHEDULE,
  isSuperConcertEvent,
  normalizeScheduleRow,
  resolvePublicScheduleFallback,
  sortScheduleItems,
};

/**
 * Loads the public schedule for an event ordered by ThuTu with stable tie-breakers.
 *
 * In mock mode or when Supabase is not configured:
 * - Super Concert returns the seeded 6 timeline activities.
 * - Generic events return an empty list.
 *
 * In configured Supabase mode:
 * - Queries LICH_TRINH table for the target SuKienID.
 * - Normalizes rows defensively and discards malformed entries.
 * - Falls back to seeded records strictly for Super Concert if database is unavailable or returns no rows.
 */
export async function loadPublicSchedule(
  event?: Partial<PublicEventRecord> | null,
): Promise<PublicScheduleItem[]> {
  const isConcert = isSuperConcertEvent(event);
  const eventId = event?.id ?? (isConcert ? runtimeConfig.eventDatabaseId : null);

  if (runtimeConfig.useMockData || !isSupabaseConfigured()) {
    if (isConcert) {
      return resolvePublicScheduleFallback(event);
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
        if (found && Array.isArray(found.schedule) && found.schedule.length > 0) {
          const items = found.schedule
            .map((s: any) =>
              normalizeScheduleRow({
                LichTrinhID: s.scheduleId ?? s.id,
                SuKienID: eventId || found.id,
                GioBatDau: s.startTime,
                GioKetThuc: s.endTime,
                TenHoatDong: s.title,
                MoTaHoatDong: s.description,
                DiaDiemHoatDong: s.location,
                ThuTu: s.order,
              }),
            )
            .filter((s: any): s is PublicScheduleItem => s !== null);
          return sortScheduleItems(items);
        }
      } catch {
        // ignore
      }
    }
    return resolvePublicScheduleFallback(event);
  }

  if (!eventId) {
    return resolvePublicScheduleFallback(event);
  }

  try {
    const {requireSupabaseClient} = await import('./supabaseClient');
    const supabase = requireSupabaseClient() as any;

    const {data, error} = await supabase
      .from('LICH_TRINH')
      .select(`
        LichTrinhID,
        SuKienID,
        GioBatDau,
        GioKetThuc,
        TenHoatDong,
        MoTaHoatDong,
        DiaDiemHoatDong,
        ThuTu
      `)
      .eq('SuKienID', eventId)
      .order('ThuTu', {ascending: true});

    if (error) {
      console.warn('Không thể tải lịch trình từ Supabase:', error);
      return resolvePublicScheduleFallback(event);
    }

    if (!data || data.length === 0) {
      return resolvePublicScheduleFallback(event);
    }

    const items = (data as unknown[])
      .map(normalizeScheduleRow)
      .filter((s): s is PublicScheduleItem => s !== null);

    const sorted = sortScheduleItems(items);
    return sorted.length > 0 ? sorted : resolvePublicScheduleFallback(event);
  } catch (err) {
    console.warn('Lỗi kết nối khi tải lịch trình sự kiện:', err);
    return resolvePublicScheduleFallback(event);
  }
}

export {loadPublicSchedule as loadEventSchedule};
