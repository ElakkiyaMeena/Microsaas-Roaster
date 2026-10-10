import axios, { AxiosError, isAxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { TokenResponse } from '../types';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '../lib/tokens';

export const API_ORIGIN: string = import.meta.env.VITE_API_URL ?? '';
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;

/** Event dispatched on window when the session can no longer be refreshed. */
export const AUTH_LOGOUT_EVENT = 'auth:logout';

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const AUTH_EXCLUDED_PATHS = ['/auth/login', '/auth/refresh', '/auth/register'];

function isAuthExcluded(url: string | undefined): boolean {
  if (!url) return false;
  return AUTH_EXCLUDED_PATHS.some((path) => url.includes(path));
}

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

/** Web Locks name serialising token refresh across tabs of the same origin. */
export const REFRESH_LOCK_NAME = 'ar-refresh';

/** Refresh could not produce a new access token; carries the refresh token that was tried. */
class RefreshFailedError extends Error {
  readonly refreshToken: string | null;
  /** True when the server rejected the token (4xx) or there was none: the session is over. */
  readonly sessionInvalid: boolean;

  constructor(refreshToken: string | null, sessionInvalid: boolean) {
    super(refreshToken ? 'Token refresh failed' : 'No refresh token');
    this.name = 'RefreshFailedError';
    this.refreshToken = refreshToken;
    this.sessionInvalid = sessionInvalid;
  }
}

function getLockManager(): LockManager | undefined {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return undefined;
  const locks: LockManager | undefined = navigator.locks;
  return locks && typeof locks.request === 'function' ? locks : undefined;
}

/**
 * Runs while holding the cross-tab lock (when available). If another tab already rotated the
 * refresh token since our 401, reuse its fresh access token instead of spending the (now
 * revoked) old refresh token.
 */
async function performRefresh(staleRefreshToken: string | null): Promise<string> {
  const current = getRefreshToken();
  if (current && current !== staleRefreshToken) {
    const access = getAccessToken();
    if (access) return access;
  }
  if (!current) throw new RefreshFailedError(null, true);
  try {
    const { data } = await axios.post<TokenResponse>(`${API_BASE_URL}/auth/refresh`, {
      refresh_token: current,
    });
    setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch (err) {
    const status = isAxiosError(err) ? err.response?.status : undefined;
    // Network errors / 5xx are transient: keep the session so a later request can retry.
    throw new RefreshFailedError(current, status !== undefined && status >= 400 && status < 500);
  }
}

let refreshPromise: Promise<string> | null = null;

/**
 * Single-flight refresh: concurrent 401s in this tab share one refresh; across tabs the refresh
 * runs under `navigator.locks` so only one tab rotates the token at a time.
 */
function refreshAccessToken(staleRefreshToken: string | null): Promise<string> {
  if (!refreshPromise) {
    const run = (): Promise<string> => performRefresh(staleRefreshToken);
    const locks = getLockManager();
    const pending: Promise<string> = locks
      ? (locks.request(REFRESH_LOCK_NAME, run) as Promise<string>)
      : run();
    refreshPromise = pending.finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Clear the session, but only if storage still holds the refresh token that failed: another tab
 * may have just written a fresh session, which must not be wiped.
 */
function forceLogout(failedRefreshToken: string | null): void {
  if (getRefreshToken() !== failedRefreshToken) return;
  clearTokens();
  window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
}

function bearerOf(config: InternalAxiosRequestConfig): string | null {
  const header = config.headers.get('Authorization');
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableRequestConfig | undefined;
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retry ||
      isAuthExcluded(original.url)
    ) {
      return Promise.reject(error);
    }
    original._retry = true;

    // The token was already replaced (this or another tab refreshed meanwhile): just retry.
    const currentAccess = getAccessToken();
    if (currentAccess && currentAccess !== bearerOf(original)) {
      original.headers.set('Authorization', `Bearer ${currentAccess}`);
      return api(original);
    }

    let newToken: string;
    try {
      newToken = await refreshAccessToken(getRefreshToken());
    } catch (refreshError) {
      if (refreshError instanceof RefreshFailedError && refreshError.sessionInvalid) {
        forceLogout(refreshError.refreshToken);
      }
      return Promise.reject(error);
    }
    original.headers.set('Authorization', `Bearer ${newToken}`);
    return api(original);
  },
);

export default api;
