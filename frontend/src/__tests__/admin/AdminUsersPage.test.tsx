import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../services/api';
import AdminUsersPage from '../../pages/admin/AdminUsersPage';
import { setTokens } from '../../lib/tokens';
import { renderWithProviders } from '../test-utils';
import type { AdminUserItem, Paginated, User } from '../../types';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  API_ORIGIN: '',
  API_BASE_URL: '/api/v1',
  AUTH_LOGOUT_EVENT: 'auth:logout',
}));

const mockedGet = vi.mocked(api.get);
const mockedPut = vi.mocked(api.put);

const admin: User = {
  id: 1,
  email: 'admin@example.com',
  full_name: 'Admin',
  is_active: true,
  is_verified: true,
  is_admin: true,
  oauth_provider: null,
  avatar_url: null,
  default_intensity: 'medium',
  created_at: '2026-01-01T00:00:00Z',
};

const bob: AdminUserItem = {
  ...admin,
  id: 2,
  email: 'bob@example.com',
  full_name: 'Bob',
  is_admin: false,
  submission_count: 4,
  roast_count: 6,
};

const list: Paginated<AdminUserItem> = {
  items: [{ ...admin, submission_count: 1, roast_count: 1 }, bob],
  total: 2,
  page: 1,
  per_page: 20,
};

describe('AdminUsersPage', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPut.mockReset();
    setTokens('access', 'refresh');
    mockedGet.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: admin });
      if (url === '/admin/users') return Promise.resolve({ data: list });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('toggling active and admin calls updateUser', async () => {
    mockedPut.mockResolvedValue({ data: { ...bob, is_active: false } });
    renderWithProviders(<AdminUsersPage />, { initialEntries: ['/admin/users'] });

    expect(await screen.findByText('bob@example.com')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Active: Bob'));
    await waitFor(() =>
      expect(mockedPut).toHaveBeenCalledWith('/admin/users/2', { is_active: false }),
    );

    await waitFor(() => expect(screen.getByLabelText('Admin: Bob')).not.toBeDisabled());
    await userEvent.click(screen.getByLabelText('Admin: Bob'));
    await waitFor(() =>
      expect(mockedPut).toHaveBeenCalledWith('/admin/users/2', { is_admin: true }),
    );
  });

  it('prevents the admin from toggling themselves', async () => {
    renderWithProviders(<AdminUsersPage />, { initialEntries: ['/admin/users'] });

    await screen.findByText('bob@example.com');
    await waitFor(() => expect(screen.getByLabelText('Active: Admin')).toBeDisabled());
    expect(screen.getByLabelText('Admin: Admin')).toBeDisabled();
    expect(screen.getByLabelText('Active: Bob')).not.toBeDisabled();
  });

  it('shows an error toast when the update fails', async () => {
    mockedPut.mockRejectedValue(new Error('Nope'));
    renderWithProviders(<AdminUsersPage />, { initialEntries: ['/admin/users'] });

    await screen.findByText('bob@example.com');
    await userEvent.click(screen.getByLabelText('Active: Bob'));
    expect(await screen.findByText('Update failed')).toBeInTheDocument();
  });

  it('sends the debounced search term', async () => {
    renderWithProviders(<AdminUsersPage />, { initialEntries: ['/admin/users'] });
    await screen.findByText('bob@example.com');

    await userEvent.type(screen.getByLabelText('Search users'), 'bob');
    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith('/admin/users', {
        params: { page: 1, per_page: 20, search: 'bob' },
      }),
    );
  });
});
