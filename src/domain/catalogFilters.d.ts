export type CatalogArtistSource = 'db' | 'mock' | 'api';

export type CatalogArtist = {
  key: string;
  id: number;
  name: string;
  imageUrl?: string;
  role?: string;
  eventCount?: number;
  aliasKeys?: string[];
};

export type CatalogFilterState = {
  artistKeys?: string[];
  category?: string;
  query?: string;
};

export function catalogArtistKey(source: CatalogArtistSource, id: number | null | undefined, name?: string): string;
export function normalizeCatalogArtists(rows: unknown, source: CatalogArtistSource): CatalogArtist[];
export function groupCatalogArtistsByEvent(
  linkRows: unknown,
  source?: CatalogArtistSource,
): Map<number, CatalogArtist[]>;
export function collectCatalogArtistOptions(events: ReadonlyArray<{artists?: CatalogArtist[]}>): CatalogArtist[];
export function toggleCatalogArtist(selectedKeys: readonly string[], key: string): string[];
export function filterCatalogEvents<
  T extends {name: string; venueName?: string; category: string; artists?: CatalogArtist[]},
>(events: readonly T[], filters?: CatalogFilterState): T[];
