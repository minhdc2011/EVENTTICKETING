/**
 * Public schedule domain helpers and seeded Super Concert schedule records.
 * Provides defensive normalization for Supabase LICH_TRINH rows and mock fallbacks.
 */

export const SUPER_CONCERT_SCHEDULE = [
  {
    id: 1,
    eventId: 1,
    startTime: '16:30',
    endTime: '17:45',
    title: 'Mở cổng check-in an ninh',
    description: 'Quét mã QR, soát vé và phát vòng tay dành cho khu VIP/Fanzone.',
    location: 'Cổng kiểm soát an ninh SVĐ Mỹ Đình',
    order: 1,
  },
  {
    id: 2,
    eventId: 1,
    startTime: '17:45',
    endTime: '18:30',
    title: 'Soundcheck VIP Exclusive',
    description: 'Giao lưu sớm cùng nghệ sĩ dành riêng cho chủ nhân vé VVIP Diamond Lounge.',
    location: 'Sân khấu chính',
    order: 2,
  },
  {
    id: 3,
    eventId: 1,
    startTime: '18:30',
    endTime: '19:30',
    title: 'Warm-up DJ Set',
    description: 'DJ Mie khởi động sân vận động với set nhạc EDM mở màn.',
    location: 'Sân khấu trung tâm',
    order: 3,
  },
  {
    id: 4,
    eventId: 1,
    startTime: '19:30',
    endTime: '21:15',
    title: 'Khai mạc Đại nhạc hội Ngoại Thương',
    description: 'Chuỗi tiết mục mở màn cùng Chillies, MONO và Suboi.',
    location: 'Sân khấu chính',
    order: 4,
  },
  {
    id: 5,
    eventId: 1,
    startTime: '21:15',
    endTime: '22:30',
    title: 'Sơn Tùng M-TP × Soobin',
    description: 'Chuỗi hit đỉnh cao kết hợp pháo hoa và màn trình diễn drone.',
    location: 'Sân khấu chính & Sàn Catwalk',
    order: 5,
  },
  {
    id: 6,
    eventId: 1,
    startTime: '22:30',
    endTime: '23:00',
    title: 'Bế mạc & hướng dẫn ra về an toàn',
    description: 'Điều phối khán giả theo từng khu vực và cổng ra tương ứng.',
    location: 'Toàn bộ sân vận động',
    order: 6,
  },
];

/**
 * Normalizes a time string (accepting valid 24-hour HH:mm/HH:mm:ss, including supported ISO/datetime shapes).
 * Returns 'HH:mm' for valid times; returns empty string '' for invalid or malformed input.
 */
export function formatScheduleTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const trimmed = timeStr.trim();
  if (!trimmed) return '';

  // 1. Standalone valid 24-hour time: HH:mm or HH:mm:ss (optional fraction/timezone)
  const standaloneMatch = trimmed.match(
    /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/
  );
  if (standaloneMatch) {
    const h = standaloneMatch[1].padStart(2, '0');
    const m = standaloneMatch[2];
    return `${h}:${m}`;
  }

  // 2. Supported ISO/datetime shapes: YYYY-MM-DD[T or space]HH:mm(:ss)...
  const dateTimeMatch = trimmed.match(
    /^\d{4}-\d{2}-\d{2}[T\s]([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/
  );
  if (dateTimeMatch) {
    const h = dateTimeMatch[1].padStart(2, '0');
    const m = dateTimeMatch[2];
    return `${h}:${m}`;
  }

  // Reject malformed times (e.g. '99:99', '25:61', 'not-a-time')
  return '';
}

/**
 * Parses timeline items directly from an event description text.
 * Matches lines like "- **16:30 - 18:30**: Title" or "16:30: Title".
 * Satisfies requirements where schedule does not need a dedicated database table.
 */
export function parseTimelineFromDescription(description, eventId = 0) {
  if (!description || typeof description !== 'string') return [];
  const lines = description.split(/\r?\n/);
  const items = [];
  let order = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(
      /^[-*•]?\s*(?:\*\*)?(\d{1,2}:\d{2})(?:\s*[-–—]\s*(\d{1,2}:\d{2}))?(?:\*\*)?\s*[:：-]\s*(.+)$/
    );
    if (match) {
      const startTime = formatScheduleTime(match[1]);
      const endTime = match[2] ? formatScheduleTime(match[2]) : undefined;
      const rest = match[3].trim();
      let title = rest;
      let itemDesc = undefined;

      const parts = rest.split(/[:：]\s+/);
      if (parts.length > 1) {
        title = parts[0].replace(/^\*\*|\*\*$/g, '').trim();
        itemDesc = parts.slice(1).join(': ').replace(/^\*\*|\*\*$/g, '').trim();
      }

      if (title && startTime) {
        items.push({
          id: order,
          eventId: Number(eventId) || 0,
          startTime,
          endTime,
          title,
          description: itemDesc,
          order: order++,
        });
      }
    }
  }

  return items;
}

/**
 * Defensive normalization for raw LICH_TRINH rows from Supabase, REST responses, or mock objects.
 * Rejects malformed rows (missing title or startTime).
 * Keeps database-derived fields primary without fabricating missing optional attributes.
 */
export function normalizeScheduleRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const id = Number(row.LichTrinhID ?? row.lich_trinh_id ?? row.id ?? 0);
  const eventId = Number(row.SuKienID ?? row.su_kien_id ?? row.eventId ?? 0);

  const rawTitle = row.TenHoatDong ?? row.ten_hoat_dong ?? row.title ?? row.activityName ?? '';
  const title = String(rawTitle).trim();

  const rawStartTime = row.GioBatDau ?? row.gio_bat_dau ?? row.startTime ?? '';
  const startTime = formatScheduleTime(String(rawStartTime));

  // A valid schedule item must have an activity title and a start time
  if (!title || !startTime) {
    return null;
  }

  const rawEndTime = row.GioKetThuc ?? row.gio_ket_thuc ?? row.endTime ?? '';
  const endTime = rawEndTime ? formatScheduleTime(String(rawEndTime)) : undefined;

  const rawDescription = row.MoTaHoatDong ?? row.mo_ta_hoat_dong ?? row.description ?? '';
  const description = rawDescription ? String(rawDescription).trim() : undefined;

  const rawLocation = row.DiaDiemHoatDong ?? row.dia_diem_hoat_dong ?? row.location ?? '';
  const location = rawLocation ? String(rawLocation).trim() : undefined;

  const rawOrder = row.ThuTu ?? row.thu_tu ?? row.order;
  const order =
    rawOrder !== undefined && rawOrder !== null && !isNaN(Number(rawOrder))
      ? Number(rawOrder)
      : 0;

  return {
    id,
    eventId,
    startTime,
    endTime: endTime || undefined,
    title,
    description: description || undefined,
    location: location || undefined,
    order,
  };
}

/**
 * Sorts schedule items deterministically by display order (ThuTu) ascending,
 * using startTime and ID as stable tie-breakers.
 */
export function sortScheduleItems(items) {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    const timeDiff = (a.startTime ?? '').localeCompare(b.startTime ?? '');
    if (timeDiff !== 0) return timeDiff;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

/**
 * Checks if an event is the Super Concert based strictly on stable product identity
 * (templateKey, code, slug). Does not rely on bare numeric database IDs.
 */
export function isSuperConcertEvent(event) {
  if (!event || typeof event !== 'object') return false;
  return (
    event.templateKey === 'SUPER_CONCERT_2026' ||
    event.code === 'SUPER_CONCERT_2026' ||
    event.slug === 'super-concert-2026'
  );
}

/**
 * Resolves public schedule items in mock fallback mode.
 * Allowed ONLY for Super Concert; generic events return an empty list.
 */
export function resolvePublicScheduleFallback(event) {
  return isSuperConcertEvent(event) ? [...SUPER_CONCERT_SCHEDULE] : [];
}
