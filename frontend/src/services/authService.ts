import api, { API_BASE_URL } from './api';
import type {
  LoginPayload,
  RegisterPayload,
  TokenResponse,
  UpdateProfilePayload,
  User,
} from '../types';

/** Create an account. Returns the created user (does not log in). */
export async function register(payload: RegisterPayload): Promise<User> {
  const { data } = await api.post<User>('/auth/register', payload);
  return data;
}

/** Exchange email + password (JSON body) for tokens. */
export async function login(payload: LoginPayload): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/login', payload);
  return data;
}

/** Rotate tokens using a refresh token. */
export async function refresh(refreshToken: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken });
  return data;
}

/** Revoke a refresh token (idempotent). */
export async function logout(refreshToken: string): Promise<void> {
  await api.post('/auth/logout', { refresh_token: refreshToken });
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me');
  return data;
}

export async function updateMe(payload: UpdateProfilePayload): Promise<User> {
  const { data } = await api.put<User>('/auth/me', payload);
  return data;
}

/** Full URL that starts the Google OAuth flow (navigate the browser to it). */
export function googleLoginUrl(): string {
  return `${API_BASE_URL}/auth/google`;
}

const authService = { register, login, refresh, logout, getMe, updateMe, googleLoginUrl };
export default authService;
