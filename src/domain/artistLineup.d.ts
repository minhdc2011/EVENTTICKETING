export type PublicArtistRecord = {
  id: number;
  name: string;
  stageName?: string;
  realName?: string;
  role: string;
  primaryRole?: string;
  eventRole?: string;
  bio?: string;
  imageUrl?: string;
  order: number;
};

export type PublicArtist = PublicArtistRecord;

export const SUPER_CONCERT_ARTISTS: PublicArtistRecord[];

export function normalizeArtistRow(row: unknown): PublicArtistRecord | null;

export function sortArtists(artists: PublicArtistRecord[]): PublicArtistRecord[];

export function isSuperConcertEvent(event?: {
  id?: number;
  code?: string;
  slug?: string;
  templateKey?: string;
} | null): boolean;

export function resolvePublicArtistsFallback(event?: {
  id?: number;
  code?: string;
  slug?: string;
  templateKey?: string;
} | null): PublicArtistRecord[];
