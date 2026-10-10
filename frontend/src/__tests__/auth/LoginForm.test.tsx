import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { LoginForm } from '../../components/auth/LoginForm';
import LoginPage from '../../pages/LoginPage';
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

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders accessible email and password fields and a submit button', () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows validation errors and does not call the API when fields are invalid', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();

    expect(mocked.login).not.toHaveBeenCalled();
  });

  it('calls login with the entered credentials and reports success', async () => {
    mocked.login.mockResolvedValue({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      token_type: 'bearer',
    });
    mocked.getMe.mockResolvedValue(testUser);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<LoginForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/email/i), '  ada@example.com ');
    await user.type(screen.getByLabelText(/password/i), 'hunter22!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(testUser));
    expect(mocked.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'hunter22!' });
    expect(window.localStorage.getItem('ar_access_token')).toBe('access-1');
  });

  it('shows an inline error when credentials are rejected', async () => {
    mocked.login.mockRejectedValue(apiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS'));
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a friendly message for OAuth error query params', async () => {
    renderWithProviders(<LoginPage />, { initialEntries: ['/login?error=oauth_state'] });
    expect(
      await screen.findByText(/google sign-in session expired or could not be verified/i),
    ).toBeInTheDocument();
  });

  it('redirects to the original destination after signing in', async () => {
    mocked.login.mockResolvedValue({
      access_token: 'a',
      refresh_token: 'r',
      token_type: 'bearer',
    });
    mocked.getMe.mockResolvedValue(testUser);
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/submissions" element={<div>Submissions page</div>} />
      </Routes>,
      { initialEntries: [{ pathname: '/login', state: { from: '/submissions' } } as unknown as string] },
    );

    await user.type(await screen.findByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/password/i), 'hunter22!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Submissions page')).toBeInTheDocument();
  });
});
