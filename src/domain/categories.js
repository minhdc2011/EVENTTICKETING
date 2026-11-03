/**
 * Single source of truth for event categories.
 * The database and the save RPC accept exactly these 7 values (supabase/migrations/*: CHECK on SU_KIEN.TheLoai).
 * Older rows or integrations may carry the legacy aliases below; they resolve to a canonical key everywhere.
 */
export const EVENT_CATEGORY_KEYS = Object.freeze([
  'AM_NHAC',
  'SAN_KHAU',
  'THE_THAO',
  'HOI_THAO',
  'WORKSHOP',
  'THAM_QUAN',
  'KHAC',
]);

/** Short labels for public pages (hero badge, catalog chips). */
export const CATEGORY_SHORT_LABELS = Object.freeze({
  AM_NHAC: 'Âm nhạc',
  SAN_KHAU: 'Sân khấu',
  THE_THAO: 'Thể thao',
  HOI_THAO: 'Hội thảo',
  WORKSHOP: 'Workshop',
  THAM_QUAN: 'Tham quan',
  KHAC: 'Sự kiện khác',
});

/** Descriptive labels for the organizer studio form. */
export const CATEGORY_ORGANIZER_LABELS = Object.freeze({
  AM_NHAC: 'Âm nhạc / Ca nhạc',
  SAN_KHAU: 'Sân khấu / Kịch nói',
  THE_THAO: 'Thể thao / Giải đấu',
  HOI_THAO: 'Hội thảo / Tọa đàm',
  WORKSHOP: 'Workshop / Đào tạo',
  THAM_QUAN: 'Tham quan / Triển lãm / Trải nghiệm',
  KHAC: 'Khác',
});

/** Legacy keys that are not valid database values, mapped to their canonical category. */
export const CATEGORY_ALIASES = Object.freeze({
  TRIEN_LAM: 'THAM_QUAN',
  CONG_NGHE: 'HOI_THAO',
  GIAI_TRI: 'AM_NHAC',
  CONG_DONG: 'KHAC',
});

/**
 * Canonical category key for any raw value, or null when it is unknown.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function resolveCategoryKey(raw) {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toUpperCase();
  if (!key) return null;
  if (EVENT_CATEGORY_KEYS.includes(key)) return key;
  return CATEGORY_ALIASES[key] ?? null;
}
