const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const runtimeConfig = {
  apiBaseUrl: trimTrailingSlash(import.meta.env.VITE_API_BASE_URL?.trim() ?? ''),
  websocketUrl: trimTrailingSlash(import.meta.env.VITE_WS_URL?.trim() ?? ''),
  eventId: import.meta.env.VITE_EVENT_ID?.trim() || 'SUPER_CONCERT_2026',
  useMockData: import.meta.env.VITE_USE_MOCK_DATA !== 'false',
} as const;

export const isApiConfigured = () => runtimeConfig.apiBaseUrl.length > 0;
export const isWebSocketConfigured = () => runtimeConfig.websocketUrl.length > 0;
