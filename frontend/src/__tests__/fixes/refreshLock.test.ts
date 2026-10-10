import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { AUTH_LOGOUT_EVENT, REFRESH_LOCK_NAME } from '../../services/api';
import { getAccessToken, getRefreshToken, setTokens } from '../../lib/tokens';

type Responder = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

function adapter(responder: Responder, log: string[]): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const auth = config.headers.get('Authorization');
    log.push(`${config.url ?? ''} ${typeof auth === 'string' ? auth : '-'}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { status, data } = responder(config);
    const response: AxiosResponse = { data, status, statusText: '', headers: {}, config };
    if (status >= 200 && status < 300) return response;
    throw new AxiosError('fail', 'ERR_BAD_RESPONSE', config, null, response);
  };
}

const freshOnly: Responder = (config) =>
  config.headers.get('Authorization') === 'Bearer fresh-access'
    ? { status: 200, data: { ok: true } }
    : { status: 401, data: { detail: 'expired' } };

const originalApiAdapter = api.defaults.adapter;
const originalAxiosAdapter = axios.defaults.adapter;
let apiLog: string[];
let refreshLog: string[];

type LockCallback = () => Promise<unknown>;

/** Minimal Web Locks stand-in: runs callbacks one at a time, optionally hooking before each. */
function installLocks(beforeGrant?: () => void) {
  let chain: Promise<unknown> = Promise.resolve();
  const request = vi.fn((_name: string, cb: LockCallback): Promise<unknown> => {
    const run = chain.then(() => {
      beforeGrant?.();
      return cb();
    });
    chain = run.catch(() => undefined);
    return run;
  });
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
  return request;
}

describe('token refresh across tabs', () => {
  beforeEach(() => {
    apiLog = [];
    refreshLog = [];
  });

  afterEach(() => {
    api.defaults.adapter = originalApiAdapter;
    axios.defaults.adapter = originalAxiosAdapter;
    Reflect.deleteProperty(navigator, 'locks');
  });

  it('refreshes inside navigator.locks when available', async () => {
    const request = installLocks();
    setTokens('stale', 'refresh-1');
    api.defaults.adapter = adapter(freshOnly, apiLog);
    axios.defaults.adapter = adapter(
      () => ({ status: 200, data: { access_token: 'fresh-access', refresh_token: 'refresh-2' } }),
      refreshLog,
    );

    await expect(api.get('/x')).resolves.toMatchObject({ status: 200 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(REFRESH_LOCK_NAME);
    expect(refreshLog).toHaveLength(1);
    expect(getRefreshToken()).toBe('refresh-2');
  });

  it('skips /auth/refresh when another tab rotated the token while we waited for the lock', async () => {
    installLocks(() => {
      // The other tab finished its refresh just before we got the lock.
      setTokens('fresh-access', 'refresh-other-tab');
    });
    setTokens('stale', 'refresh-1');
    api.defaults.adapter = adapter(freshOnly, apiLog);
    axios.defaults.adapter = adapter(() => ({ status: 500, data: {} }), refreshLog);

    await expect(api.get('/x')).resolves.toMatchObject({ status: 200 });
    expect(refreshLog).toHaveLength(0);
    expect(apiLog).toEqual(['/x Bearer stale', '/x Bearer fresh-access']);
    expect(getRefreshToken()).toBe('refresh-other-tab');
  });

  it('retries directly when the stored access token already changed (no refresh)', async () => {
    setTokens('stale', 'refresh-1');
    api.defaults.adapter = adapter((config) => {
      // Another tab refreshes while this request is in flight.
      if (config.headers.get('Authorization') === 'Bearer stale') {
        setTokens('fresh-access', 'refresh-2');
      }
      return freshOnly(config);
    }, apiLog);
    axios.defaults.adapter = adapter(() => ({ status: 500, data: {} }), refreshLog);

    await expect(api.get('/y')).resolves.toMatchObject({ status: 200 });
    expect(refreshLog).toHaveLength(0);
  });

  it('does not clear tokens another tab wrote while our refresh was failing', async () => {
    setTokens('stale', 'refresh-1');
    api.defaults.adapter = adapter(freshOnly, apiLog);
    axios.defaults.adapter = adapter(() => {
      setTokens('other-access', 'other-refresh');
      return { status: 401, data: { detail: 'revoked' } };
    }, refreshLog);
    const onLogout = vi.fn();
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);
    try {
      await expect(api.get('/z')).rejects.toMatchObject({ response: { status: 401 } });
      expect(onLogout).not.toHaveBeenCalled();
      expect(getAccessToken()).toBe('other-access');
      expect(getRefreshToken()).toBe('other-refresh');
    } finally {
      window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
    }
  });

  it('keeps the session when the refresh endpoint fails with 5xx', async () => {
    setTokens('stale', 'refresh-1');
    api.defaults.adapter = adapter(freshOnly, apiLog);
    axios.defaults.adapter = adapter(() => ({ status: 503, data: {} }), refreshLog);
    const onLogout = vi.fn();
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);
    try {
      await expect(api.get('/z')).rejects.toMatchObject({ response: { status: 401 } });
      expect(onLogout).not.toHaveBeenCalled();
      expect(getRefreshToken()).toBe('refresh-1');
    } finally {
      window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
    }
  });
});
