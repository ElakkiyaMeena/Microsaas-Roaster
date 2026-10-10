import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from '../../components/auth/RegisterForm';
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

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await user.type(screen.getByLabelText(/^email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'Sup3r-secret!');
    await user.type(screen.getByLabelText(/confirm password/i), 'Sup3r-secret?');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(mocked.register).not.toHaveBeenCalled();
  });

  it('enforces the minimum password length', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await user.type(screen.getByLabelText(/^email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'short');
    await user.type(screen.getByLabelText(/confirm password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(mocked.register).not.toHaveBeenCalled();
  });

  it('registers, logs in and reports success', async () => {
    mocked.register.mockResolvedValue(testUser);
    mocked.login.mockResolvedValue({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' });
    mocked.getMe.mockResolvedValue(testUser);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/^email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'Sup3r-secret!');
    await user.type(screen.getByLabelText(/confirm password/i), 'Sup3r-secret!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(testUser));
    expect(mocked.register).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'Sup3r-secret!',
      full_name: 'Ada Lovelace',
    });
  });

  it('shows a helpful message when the email is already registered', async () => {
    mocked.register.mockRejectedValue(apiError(409, 'Email already registered', 'EMAIL_EXISTS'));
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await user.type(screen.getByLabelText(/^email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'Sup3r-secret!');
    await user.type(screen.getByLabelText(/confirm password/i), 'Sup3r-secret!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(/an account with this email already exists/i),
    ).toBeInTheDocument();
  });
});
