export const EVENT_CATEGORY_KEYS: readonly string[];
export const CATEGORY_SHORT_LABELS: Readonly<Record<string, string>>;
export const CATEGORY_ORGANIZER_LABELS: Readonly<Record<string, string>>;
export const CATEGORY_ALIASES: Readonly<Record<string, string>>;
export function resolveCategoryKey(raw: unknown): string | null;
