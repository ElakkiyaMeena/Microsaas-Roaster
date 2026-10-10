import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusManager } from '@tanstack/react-query';
import api from '../../services/api';
import { getRefreshToken, setTokens } from '../../lib/tokens';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import SubmissionDetailPage from '../../pages/SubmissionDetailPage';
import { hasActivePendingRoast, isRoastTimedOut, parseServerDate, PENDING_TIMEOUT_MS } from '../../lib/roastStatus';
import { renderWithProviders } from '../test-utils';
import type { Roast, SubmissionDetail, User } from '../../types';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  API_ORIGIN: '',
  API_BASE_URL: '/api/v1',
  AUTH_LOGOUT_EVENT: 'auth:logout',
}));

const mockedGet = vi.mocked(api.get);

const user: User = {
  id: 1,
  email: 'ada@example.com',
  full_name: 'Ada',
  is_active: true,
  is_verified: true,
  is_admin: false,
  oauth_provider: null,
  avatar_url: null,
  default_intensity: 'medium',
  created_at: '2026-01-01T00:00:00Z',
};

function httpError(status: number): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fail', 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data: { detail: 'nope' },
  });
}

function roast(overrides: Partial<Roast>): Roast {
  return {
    id: 1,
    submission_id: 7,
    intensity: 'medium',
    status: 'pending',
    score: null,
    headline: null,
    summary: null,
    issues: [],
    strengths: [],
    model: null,
    error_message: null,
    created_at: new Date().toISOString(),
    completed_at: null,
    share_link: null,
    ...overrides,
  };
}

function detail(roasts: Roast[]): SubmissionDetail {
  return {
    id: 7,
    title: 'Todo API',
    assignment_brief: null,
    language: 'python',
    source_type: 'paste',
    code_content: 'print(1)',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: null,
    files: [],
    roasts,
  };
}

describe('session restore (AuthContext + ProtectedRoute)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    setTokens('access', 'refresh');
  });

  const protectedTree = (
    <Routes>
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <p>secret dashboard</p>
          </ProtectedRoute>
        }
      />
      <Route path="/login" element={<p>login page</p>} />
    </Routes>
  );

  it('keeps tokens on a 5xx and lets the user retry', async () => {
    mockedGet.mockRejectedValueOnce(httpError(503)).mockResolvedValue({ data: user });

    renderWithProviders(protectedTree, { initialEntries: ['/dashboard'] });

    expect(await screen.findByText(/Can.t reach the roaster/)).toBeInTheDocument();
    expect(getRefreshToken()).toBe('refresh');

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('secret dashboard')).toBeInTheDocument();
  });

  it('clears tokens and redirects to /login on a 401', async () => {
    mockedGet.mockRejectedValue(httpError(401));

    renderWithProviders(protectedTree, { initialEntries: ['/dashboard'] });

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(getRefreshToken()).toBeNull();
  });
});

describe('roast pending timeout helpers', () => {
  it('treats naive timestamps as UTC', () => {
    expect(parseServerDate('2026-10-10T12:00:00')).toBe(Date.parse('2026-10-10T12:00:00Z'));
    expect(parseServerDate('2026-10-10T12:00:00+02:00')).toBe(Date.parse('2026-10-10T10:00:00Z'));
  });

  it('flags pending roasts older than 3 minutes', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    const old = roast({ created_at: new Date(now - PENDING_TIMEOUT_MS - 1000).toISOString() });
    const young = roast({ created_at: new Date(now - 10_000).toISOString() });
    expect(isRoastTimedOut(old, now)).toBe(true);
    expect(isRoastTimedOut(young, now)).toBe(false);
    expect(isRoastTimedOut({ ...old, status: 'failed' }, now)).toBe(false);
    expect(hasActivePendingRoast(detail([old]), now)).toBe(false);
    expect(hasActivePendingRoast(detail([young]), now)).toBe(true);
  });
});

describe('SubmissionDetailPage pending roasts', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    setTokens('access', 'refresh');
    // jsdom reports the document as hidden; interval refetches only run while focused.
    focusManager.setFocused(true);
  });

  afterEach(() => {
    focusManager.setFocused(undefined);
  });

  function mockSubmission(getDetail: () => SubmissionDetail): void {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: user });
      if (url === '/roasts/quota') return Promise.resolve({ data: { limit: 10, used_today: 1, remaining: 9 } });
      if (url === '/submissions/7') return Promise.resolve({ data: getDetail() });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  }

  const page = (
    <Routes>
      <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
    </Routes>
  );

  it('shows a stale pending roast as timed out with a retry button', async () => {
    const stale = new Date(Date.now() - PENDING_TIMEOUT_MS - 60_000).toISOString();
    mockSubmission(() => detail([roast({ created_at: stale })]));

    renderWithProviders(page, { initialEntries: ['/submissions/7'] });

    expect(await screen.findByText('This roast timed out')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry \(/ })).toBeInTheDocument();
  });

  it('polls a fresh pending roast until it completes', async () => {
    let calls = 0;
    mockSubmission(() => {
      calls += 1;
      return calls === 1
        ? detail([roast({})])
        : detail([
            roast({
              status: 'completed',
              score: 81,
              headline: 'Nicely seasoned',
              summary: 'Good stuff',
              completed_at: new Date().toISOString(),
            }),
          ]);
    });

    renderWithProviders(page, { initialEntries: ['/submissions/7'] });

    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(1));
    expect(screen.queryByText('This roast timed out')).not.toBeInTheDocument();
    await waitFor(() => expect(calls).toBe(2), { timeout: 8000 });
    expect(await screen.findByRole('img', { name: 'Score 81 out of 100' })).toBeInTheDocument();
    expect(calls).toBe(2);
  }, 15_000);
});
