// Fetch-based API client. Mirrors the shape of the previous axios client
// (api.get/post/put/patch/delete returning { data }, apiErrorMessage) so
// page code reads the same way, just without the axios dependency.

let accessToken = null;
let onUnauthorized = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

const API_BASE_URL = window.APP_CONFIG.apiBaseUrl;

export class ApiError extends Error {
  constructor(status, data) {
    super((data && (data.error || data.message)) || 'Request failed');
    this.status = status;
    this.data = data;
  }
}

let refreshPromise = null;

async function refreshAccessToken() {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    setAccessToken(data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

async function parseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request(method, path, body, isRetry = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !isRetry && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    if (newToken) return request(method, path, body, true);
    onUnauthorized && onUnauthorized();
  }

  const data = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, data);
  return { data, status: res.status };
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  /** For endpoints returning a file (e.g. CSV export) rather than JSON. */
  async getBlob(path) {
    const headers = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', headers });
    if (!res.ok) throw new ApiError(res.status, await parseBody(res));
    return res.blob();
  },
};

export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err instanceof ApiError) return (err.data && (err.data.error || err.data.message)) || fallback;
  return fallback;
}
