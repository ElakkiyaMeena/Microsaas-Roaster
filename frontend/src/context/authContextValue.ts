import { createContext } from 'react';
import type { RegisterPayload, User } from '../types';

export interface AuthContextValue {
  user: User | null;
  /** True while the initial session is being restored or a user load is in flight. */
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  /** Registers, then logs in automatically. */
  register: (payload: RegisterPayload) => Promise<User>;
  /** Best-effort server logout, clears tokens and the react-query cache. */
  logout: () => Promise<void>;
  /** Re-fetch /auth/me (e.g. after a profile update). Returns null if not authenticated. */
  refreshUser: () => Promise<User | null>;
  /** Store tokens (e.g. from the OAuth callback) and load the user. */
  setTokens: (accessToken: string, refreshToken: string) => Promise<User>;
  /** Replace the cached user locally (e.g. with the response of PUT /auth/me). */
  setUser: (user: User | null) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
