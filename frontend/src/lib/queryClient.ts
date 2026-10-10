import { QueryClient } from '@tanstack/react-query';
import { getErrorStatus } from './errors';

/** Retry a failed query once, but never on 4xx (auth, not found, validation won't fix themselves). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status !== undefined && status >= 400 && status <= 499) return false;
  return failureCount < 1;
}

/** App-wide React Query defaults. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** React Router v7 opt-in flags (silences v6 deprecation warnings). */
export const ROUTER_FUTURE_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;
