import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as authService from '../services/authService';
import { AUTH_LOGOUT_EVENT } from '../services/api';
import {
  clearTokens,
  getRefreshToken,
  hasTokens,
  setTokens as storeTokens,
} from '../lib/tokens';
import { getErrorStatus } from '../lib/errors';
import type { RegisterPayload, User } from '../types';
import { AuthContext, type AuthContextValue } from './authContextValue';

interface AuthProviderProps {
  children: ReactNode;
}

/** Provides authentication state. Must be rendered inside QueryClientProvider. */
export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadUser = useCallback(async (): Promise<User> => {
    const me = await authService.getMe();
    setUser(me);
    return me;
  }, []);

  // Restore session on mount.
  useEffect(() => {
    let cancelled = false;
    if (!hasTokens()) {
      setIsLoading(false);
      return;
    }
    authService
      .getMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Only a 401 means the session is really gone. On network errors / 5xx keep the tokens
        // so the session can be restored later via refreshUser() (or a page reload).
        if (getErrorStatus(err) === 401) {
          clearTokens();
        }
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Forced logout from the api client (refresh failed).
  useEffect(() => {
    const handleLogout = (): void => {
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, handleLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handleLogout);
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const tokens = await authService.login({ email, password });
      storeTokens(tokens.access_token, tokens.refresh_token);
      try {
        return await loadUser();
      } catch (err) {
        clearTokens();
        throw err;
      }
    },
    [loadUser],
  );

  const register = useCallback(
    async (payload: RegisterPayload): Promise<User> => {
      await authService.register(payload);
      return login(payload.email, payload.password);
    },
    [login],
  );

  const logout = useCallback(async (): Promise<void> => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await authService.logout(refreshToken);
      } catch {
        // best effort: the token will expire on its own
      }
    }
    clearTokens();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    if (!hasTokens()) {
      setUser(null);
      return null;
    }
    try {
      return await loadUser();
    } catch (err) {
      if (getErrorStatus(err) === 401) {
        clearTokens();
        setUser(null);
      }
      return null;
    }
  }, [loadUser]);

  const setTokens = useCallback(
    async (accessToken: string, refreshToken: string): Promise<User> => {
      storeTokens(accessToken, refreshToken);
      setIsLoading(true);
      try {
        return await loadUser();
      } catch (err) {
        clearTokens();
        setUser(null);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [loadUser],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      refreshUser,
      setTokens,
      setUser,
    }),
    [user, isLoading, login, register, logout, refreshUser, setTokens],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
