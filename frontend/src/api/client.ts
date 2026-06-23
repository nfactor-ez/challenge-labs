import { ApiError } from './types';

const BASE_URL = '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('cl_token');
}

export function setToken(token: string): void {
  localStorage.setItem('cl_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('cl_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (authenticated) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export const client = {
  get: <T>(path: string, auth = true) =>
    request<T>(path, { method: 'GET' }, auth),

  post: <T>(path: string, body: unknown, auth = true) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, auth),

  put: <T>(path: string, body: unknown, auth = true) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, auth),

  patch: <T>(path: string, body: unknown, auth = true) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }, auth),

  delete: <T>(path: string, auth = true) =>
    request<T>(path, { method: 'DELETE' }, auth),
};
