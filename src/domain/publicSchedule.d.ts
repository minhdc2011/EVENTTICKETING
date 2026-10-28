export type PublicScheduleItem = {
  id: number;
  eventId: number;
  startTime: string;
  endTime?: string;
  title: string;
  description?: string;
  location?: string;
  order: number;
};

export type PublicScheduleRecord = PublicScheduleItem;

export const SUPER_CONCERT_SCHEDULE: PublicScheduleItem[];

export function formatScheduleTime(timeStr: string | null | undefined): string;

export function normalizeScheduleRow(row: unknown): PublicScheduleItem | null;

export function sortScheduleItems(items: PublicScheduleItem[]): PublicScheduleItem[];

export function isSuperConcertEvent(event?: {
  id?: number;
  code?: string;
  slug?: string;
  templateKey?: string;
} | null): boolean;

export function resolvePublicScheduleFallback(event?: {
  id?: number;
  code?: string;
  slug?: string;
  templateKey?: string;
} | null): PublicScheduleItem[];
