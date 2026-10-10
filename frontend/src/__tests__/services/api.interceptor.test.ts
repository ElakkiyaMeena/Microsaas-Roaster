import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { API_BASE_URL, AUTH_LOGOUT_EVENT } from '../../services/api';
import { getAccessToken, getRefreshToken, setTokens } from '../../lib/tokens';

/** A request as seen by the fake transport. */
interface SeenRequest {
  url: string;
  method: string;
  authorization: string | null;
  data: unknown;
}

type Responder = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

/** Build an adapter that settles like axios' real adapters (reject on non-2xx). */
function fakeAdapter(responder: Responder, seen: SeenRequest[]): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const auth = config.headers.get('Authorization');
    seen.push({
      url: config.url ?? '',
      method: (config.method ?? 'get').toUpperCase(),
      authorization: typeof auth === 'string' ? auth : null,
      data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
    });
    // Let concurrent requests interleave like real network calls.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { status, data } = responder(config);
    const response: AxiosResponse = {
      data,
      status,
      statusText: String(status),
      headers: {},
      config,
    };
    if (status >= 200 && status < 300) return response;
    throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, response);
  };
}

const originalApiAdapter = api.defaults.adapter;
const originalAxiosAdapter = axios.defaults.adapter;

let apiSeen: SeenRequest[];
let refreshSeen: SeenRequest[];

function installApi(responder: Responder): void {
  api.defaults.adapter = fakeAdapter(responder, apiSeen);
}

function installRefresh(responder: Responder): void {
  axios.defaults.adapter = fakeAdapter(responder, refreshSeen);
}

/** 401 unless the request carries `Bearer fresh-access`. */
const protectedResource: Responder = (config) => {
  const auth = config.headers.get('Authorization');
  return auth === 'Bearer fresh-access'
    ? { status: 200, data: { ok: true, url: config.url } }
    : { status: 401, data: { detail: 'expired', code: 'INVALID_TOKEN' } };
};

describe('api client interceptors', () => {
  beforeEach(() => {
    apiSeen = [];
    refreshSeen = [];
  });

  afterEach(() => {
    api.defaults.adapter = originalApiAdapter;
    axios.defaults.adapter = originalAxiosAdapter;
  });

  it('uses the versioned base URL', () => {
    expect(API_BASE_URL.endsWith('/api/v1')).toBe(true);
    expect(api.defaults.baseURL).toBe(API_BASE_URL);
  });

  it('attaches the bearer token when present and omits it otherwise', async () => {
    installApi(() => ({ status: 200, data: {} }));
    await api.get('/public/roasts/abc');
    expect(apiSeen[0].authorization).toBeNull();

    setTokens('access-1', 'refresh-1');
    await api.get('/auth/me');
    expect(apiSeen[1].authorization).toBe('Bearer access-1');
  });

  it('refreshes once on 401 and retries the original request with the new token', async () => {
    setTokens('stale-access', 'refresh-1');
    installApi(protectedResource);
    installRefresh(() => ({
      status: 200,
      data: { access_token: 'fresh-access', refresh_token: 'refresh-2', token_type: 'bearer' },
    }));

    const res = await api.get<{ ok: boolean }>('/submissions');

    expect(res.data.ok).toBe(true);
    expect(refreshSeen).toHaveLength(1);
    expect(refreshSeen[0].url).toBe(`${API_BASE_URL}/auth/refresh`);
    expect(refreshSeen[0].method).toBe('POST');
    expect(refreshSeen[0].data).toEqual({ refresh_token: 'refresh-1' });
    expect(apiSeen.map((r) => r.authorization)).toEqual(['Bearer stale-access', 'Bearer fresh-access']);
    expect(getAccessToken()).toBe('fresh-access');
    expect(getRefreshToken()).toBe('refresh-2');
  });

  it('shares a single refresh between concurrent 401s (single-flight)', async () => {
    setTokens('stale-access', 'refresh-1');
    installApi(protectedResource);
    let refreshCalls = 0;
    installRefresh(() => {
      refreshCalls += 1;
      return {
        status: 200,
        data: { access_token: 'fresh-access', refresh_token: `refresh-${refreshCalls + 1}`, token_type: 'bearer' },
      };
    });

    const results = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
    expect(refreshSeen).toHaveLength(1);
    const retried = apiSeen.filter((r) => r.authorization === 'Bearer fresh-access').map((r) => r.url);
    expect(retried.sort()).toEqual(['/a', '/b', '/c']);

    // A later 401 starts a new refresh (the promise is reset after settling).
    setTokens('stale-again', 'refresh-x');
    await api.get('/d');
    expect(refreshSeen).toHaveLength(2);
  });

  it('logs out (clears tokens + dispatches auth:logout) when refresh fails', async () => {
    setTokens('stale-access', 'refresh-1');
    installApi(protectedResource);
    installRefresh(() => ({ status: 401, data: { detail: 'revoked' } }));
    const onLogout = vi.fn();
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);

    try {
      await expect(api.get('/submissions')).rejects.toMatchObject({ response: { status: 401 } });
      expect(onLogout).toHaveBeenCalledTimes(1);
      expect(getAccessToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
      expect(apiSeen).toHaveLength(1); // no retry after a failed refresh
    } finally {
      window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
    }
  });

  it('logs out without calling the server when there is no refresh token', async () => {
    window.localStorage.setItem('ar_access_token', 'only-access');
    installApi(protectedResource);
    installRefresh(() => ({ status: 500, data: {} }));
    const onLogout = vi.fn();
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);

    try {
      await expect(api.get('/auth/me')).rejects.toBeInstanceOf(AxiosError);
      expect(refreshSeen).toHaveLength(0);
      expect(onLogout).toHaveBeenCalledTimes(1);
      expect(getAccessToken()).toBeNull();
    } finally {
      window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
    }
  });

  it.each(['/auth/login', '/auth/refresh', '/auth/register'])(
    'does not try to refresh for %s',
    async (path) => {
      setTokens('a', 'r');
      installApi(() => ({ status: 401, data: { detail: 'Invalid credentials' } }));
      installRefresh(() => ({ status: 200, data: {} }));

      await expect(api.post(path, {})).rejects.toMatchObject({ response: { status: 401 } });
      expect(refreshSeen).toHaveLength(0);
      expect(getRefreshToken()).toBe('r');
    },
  );

  it('does not loop: a retried request that 401s again is rejected', async () => {
    setTokens('stale', 'refresh-1');
    installApi(() => ({ status: 401, data: { detail: 'still no' } }));
    installRefresh(() => ({
      status: 200,
      data: { access_token: 'new', refresh_token: 'refresh-2', token_type: 'bearer' },
    }));

    await expect(api.get('/submissions')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshSeen).toHaveLength(1);
    expect(apiSeen).toHaveLength(2);
  });

  it('passes non-401 errors straight through', async () => {
    setTokens('a', 'r');
    installApi(() => ({ status: 429, data: { detail: 'slow down', code: 'ROAST_LIMIT_REACHED' } }));
    installRefresh(() => ({ status: 200, data: {} }));

    await expect(api.post('/submissions/1/roasts', {})).rejects.toMatchObject({
      response: { status: 429, data: { code: 'ROAST_LIMIT_REACHED' } },
    });
    expect(refreshSeen).toHaveLength(0);
    expect(getAccessToken()).toBe('a');
  });
});
