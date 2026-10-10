import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import OAuthCallbackPage from '../../pages/OAuthCallbackPage';
import * as authService from '../../services/authService';
import { renderWithProviders } from '../test-utils';
import { apiError, testUser } from './fixtures';

vi.mock('../../services/authService', () => {
  const fns = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    googleLoginUrl: vi.fn(() => 'http://api.test/api/v1/auth/google'),
  };
  return { ...fns, default: fns };
});

const mocked = vi.mocked(authService);

function renderCallback(): void {
  renderWithProviders(
    <Routes>
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route path="/dashboard" element={<div>Dashboard page</div>} />
      <Route path="/login" element={<div>Login page</div>} />
    </Routes>,
    { initialEntries: ['/auth/callback'] },
  );
}

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('stores tokens from the URL fragment, clears the hash and goes to the dashboard', async () => {
    window.history.replaceState(null, '', '/auth/callback#access_token=acc-123&refresh_token=ref-456');
    mocked.getMe.mockResolvedValue(testUser);

    renderCallback();

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(window.localStorage.getItem('ar_access_token')).toBe('acc-123');
    expect(window.localStorage.getItem('ar_refresh_token')).toBe('ref-456');
    expect(window.location.hash).toBe('');
    expect(mocked.getMe).toHaveBeenCalledTimes(1);
  });

  it('shows an error with a way back to login when tokens are missing', async () => {
    window.history.replaceState(null, '', '/auth/callback');

    renderCallback();

    expect(await screen.findByText(/missing tokens/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to sign in/i })).toBeInTheDocument();
    expect(window.localStorage.getItem('ar_access_token')).toBeNull();
    expect(mocked.getMe).not.toHaveBeenCalled();
  });

  it('shows an error and clears tokens when the user cannot be loaded', async () => {
    window.history.replaceState(null, '', '/auth/callback#access_token=bad&refresh_token=bad');
    mocked.getMe.mockRejectedValue(apiError(403, 'User account is inactive', 'USER_INACTIVE'));

    renderCallback();

    expect(await screen.findByText('User account is inactive')).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem('ar_access_token')).toBeNull());
  });
});
