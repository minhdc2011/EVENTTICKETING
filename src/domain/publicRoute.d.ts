export type PublicRoute =
  | {kind: 'catalog'}
  | {kind: 'organizer'; page: string}
  | {kind: 'account'; page: string}
  | {kind: 'detail'; eventSlug: string; showSlug?: string};

export function deduplicateSlug(slug: string): string;
export function resolvePublicRoute(pathname: string, fallbackEventSlug: string, hash?: string, search?: string): PublicRoute;
export function buildPublicPath(pathname: string, target: string): string;
export function navigatePublicRoute(target: string): void;

