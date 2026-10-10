import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../services/api';
import LandingPage from '../../pages/LandingPage';
import { setTokens } from '../../lib/tokens';
import { renderWithProviders } from '../test-utils';
import type { User } from '../../types';

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

function renderLanding() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<div>Register screen</div>} />
      <Route path="/login" element={<div>Login screen</div>} />
      <Route path="/dashboard" element={<div>Dashboard screen</div>} />
    </Routes>,
  );
}

describe('LandingPage', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('renders the hero, steps and sample roast', async () => {
    renderLanding();
    expect(
      await screen.findByRole('heading', { name: 'Your code. Roasted. 🔥' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assignment Roaster' })).toBeInTheDocument();
    expect(screen.getByText('Paste or upload')).toBeInTheDocument();
    expect(screen.getByText('Pick your heat')).toBeInTheDocument();
    expect(screen.getByLabelText('Sample roast preview')).toBeInTheDocument();
  });

  it('"Roast my code" sends anonymous visitors to /register', async () => {
    renderLanding();
    await userEvent.click(await screen.findByRole('button', { name: /Roast my code/ }));
    expect(await screen.findByText('Register screen')).toBeInTheDocument();
  });

  it('"Sign in" goes to /login', async () => {
    renderLanding();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Login screen')).toBeInTheDocument();
  });

  it('"Roast my code" sends logged-in users to /dashboard', async () => {
    setTokens('access', 'refresh');
    mockedGet.mockResolvedValue({ data: user });
    renderLanding();
    // Wait until the session is restored (nav switches to "Dashboard").
    await screen.findByRole('button', { name: 'Dashboard' });
    await userEvent.click(screen.getByRole('button', { name: /Roast my code/ }));
    expect(await screen.findByText('Dashboard screen')).toBeInTheDocument();
  });
});
