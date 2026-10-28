import {isSupabaseConfigured, runtimeConfig} from '../config/runtime';
import {
  SUPER_CONCERT_SCHEDULE,
  isSuperConcertEvent,
  normalizeScheduleRow,
  parseTimelineFromDescription,
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
  parseTimelineFromDescription,
  resolvePublicScheduleFallback,
  sortScheduleItems,
};

/**
 * Loads the public schedule for an event.
 *
 * Primary Strategy (Consolidated Schema):
 * - If event has timeline formatted inside its description (Description / MoTaChiTiet),
 *   parses and returns structured timeline items directly without querying a separate table.
 * - In mock mode or fallback: returns Super Concert timeline or empty array.
 * - Graceful transition: attempts LICH_TRINH query if present on Supabase, but falls back cleanly.
 */
export async function loadPublicSchedule(
  event?: Partial<PublicEventRecord> | null,
): Promise<PublicScheduleItem[]> {
  const isConcert = isSuperConcertEvent(event);
  const eventId = event?.id ?? (isConcert ? runtimeConfig.eventDatabaseId : null);

  // 1. Primary Strategy: Check if description contains timeline items
  if (event?.description) {
    const parsedFromDesc = parseTimelineFromDescription(event.description, eventId ?? 0);
    if (parsedFromDesc.length > 0) {
      return sortScheduleItems(parsedFromDesc);
    }
  }

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
      // Table may not exist after cleanup migration, fallback cleanly
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
    return resolvePublicScheduleFallback(event);
  }
}

export {loadPublicSchedule as loadEventSchedule};
