import {runtimeConfig} from '../config/runtime';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function buildApiUrl(path: string) {
  return `${runtimeConfig.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const hasBody = response.status !== 204 && response.status !== 205;
  const payload = !hasBody
    ? undefined
    : contentType.includes('application/json')
      ? await response.json()
      : await response.text();

  if (!response.ok) {
    throw new ApiError(
      `API trả về HTTP ${response.status}`,
      response.status,
      payload,
    );
  }

  return payload as T;
}
