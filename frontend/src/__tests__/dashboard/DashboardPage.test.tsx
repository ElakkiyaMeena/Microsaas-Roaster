import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../services/api';
import DashboardPage from '../../pages/DashboardPage';
import { setTokens } from '../../lib/tokens';
import { renderWithProviders } from '../test-utils';
import type { Paginated, RoastQuota, SubmissionListItem, User } from '../../types';

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
  full_name: 'Ada Lovelace',
  is_active: true,
  is_verified: true,
  is_admin: false,
  oauth_provider: null,
  avatar_url: null,
  default_intensity: 'medium',
  created_at: '2026-01-01T00:00:00Z',
};

const quota: RoastQuota = { limit: 10, used_today: 3, remaining: 7 };

function submission(overrides: Partial<SubmissionListItem>): SubmissionListItem {
  return {
    id: 1,
    title: 'Untitled',
    language: 'python',
    source_type: 'paste',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: null,
    roast_count: 0,
    latest_score: null,
    ...overrides,
  };
}

function mockApi(list: Paginated<SubmissionListItem>): void {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/auth/me') return Promise.resolve({ data: user });
    if (url === '/roasts/quota') return Promise.resolve({ data: quota });
    if (url === '/submissions') return Promise.resolve({ data: list });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    setTokens('access', 'refresh');
  });

  it('renders quota, totals and recent submissions', async () => {
    mockApi({
      items: [
        submission({ id: 11, title: 'Todo API', roast_count: 2, latest_score: 72 }),
        submission({ id: 12, title: 'FizzBuzz', language: 'javascript', roast_count: 1, latest_score: 40 }),
      ],
      total: 9,
      page: 1,
      per_page: 5,
    });

    renderWithProviders(<DashboardPage />, { initialEntries: ['/dashboard'] });

    expect(await screen.findByText('7 / 10')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Open Todo API' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open FizzBuzz' })).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('72/100')).toBeInTheDocument();
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /Hey Ada/ })).toBeInTheDocument();

    expect(mockedGet).toHaveBeenCalledWith('/submissions', { params: { page: 1, per_page: 5 } });
    expect(mockedGet).toHaveBeenCalledWith('/roasts/quota');
  });

  it('shows the empty state when there are no submissions', async () => {
    mockApi({ items: [], total: 0, page: 1, per_page: 5 });

    renderWithProviders(<DashboardPage />, { initialEntries: ['/dashboard'] });

    expect(await screen.findByText('Nothing on the grill yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Roast my first assignment/ })).toBeInTheDocument();
  });

  it('shows an error with retry when submissions fail to load', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: user });
      if (url === '/roasts/quota') return Promise.resolve({ data: quota });
      return Promise.reject(new Error('Boom'));
    });

    renderWithProviders(<DashboardPage />, { initialEntries: ['/dashboard'] });

    expect(await screen.findByText('Boom')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument());
  });
});
