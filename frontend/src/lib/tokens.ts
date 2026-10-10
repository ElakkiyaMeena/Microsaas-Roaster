/** localStorage-backed token storage. All accessors are safe when storage is unavailable. */

const ACCESS_KEY = 'ar_access_token';
const REFRESH_KEY = 'ar_refresh_token';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode / blocked); tokens live only for this request cycle
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getAccessToken(): string | null {
  return read(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return read(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  write(ACCESS_KEY, accessToken);
  write(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  remove(ACCESS_KEY);
  remove(REFRESH_KEY);
}

export function hasTokens(): boolean {
  return getAccessToken() !== null || getRefreshToken() !== null;
}
