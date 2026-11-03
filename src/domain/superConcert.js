/**
 * Single definition of "this event is the Super Concert".
 * Identity comes from stable product keys (templateKey, code, slug), never from a bare numeric database id.
 */
export const SUPER_CONCERT_KEY = 'SUPER_CONCERT_2026';
export const SUPER_CONCERT_SLUG = 'super-concert-2026';

/** @param {{templateKey?: string, code?: string, slug?: string} | null | undefined} event */
export function isSuperConcertEvent(event) {
  if (!event || typeof event !== 'object') return false;
  return (
    event.templateKey === SUPER_CONCERT_KEY ||
    event.code === SUPER_CONCERT_KEY ||
    event.slug === SUPER_CONCERT_SLUG
  );
}

/**
 * Template key for a raw SU_KIEN row: the explicit TemplateKey column, or the concert's stable slug
 * (older deployments seeded the concert without TemplateKey).
 * @param {{TemplateKey?: unknown, Slug?: unknown} | null | undefined} row
 * @returns {'SUPER_CONCERT_2026' | 'DEFAULT'}
 */
export function resolveTemplateKey(row) {
  if (!row) return 'DEFAULT';
  if (row.TemplateKey === SUPER_CONCERT_KEY) return SUPER_CONCERT_KEY;
  const slug = String(row.Slug ?? '').trim().toLowerCase();
  return slug === SUPER_CONCERT_SLUG || slug.replaceAll('-', '_').toUpperCase() === SUPER_CONCERT_KEY
    ? SUPER_CONCERT_KEY
    : 'DEFAULT';
}
