export const SUPER_CONCERT_KEY: 'SUPER_CONCERT_2026';
export const SUPER_CONCERT_SLUG: 'super-concert-2026';
export function isSuperConcertEvent(event?: {templateKey?: string; code?: string; slug?: string} | null): boolean;
export function resolveTemplateKey(row?: {TemplateKey?: unknown; Slug?: unknown} | null): 'SUPER_CONCERT_2026' | 'DEFAULT';
