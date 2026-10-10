import { AxiosError, AxiosHeaders } from 'axios';
import type { User } from '../../types';

export const testUser: User = {
  id: 1,
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  is_active: true,
  is_verified: true,
  is_admin: false,
  oauth_provider: null,
  avatar_url: null,
  default_intensity: 'medium',
  created_at: '2026-01-15T10:00:00Z',
};

/** Build an AxiosError carrying an API error body, as the backend would return it. */
export function apiError(status: number, detail: string, code?: string): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError(detail, String(status), { headers }, null, {
    status,
    statusText: String(status),
    headers: {},
    config: { headers },
    data: { detail, code },
  });
}
