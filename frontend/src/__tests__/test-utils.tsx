import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import theme from '../theme';
import { ROUTER_FUTURE_FLAGS } from '../lib/queryClient';

export interface ProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial router entries (default ['/']). */
  initialEntries?: string[];
  /** Wrap in AuthProvider (default true). */
  withAuth?: boolean;
  queryClient?: QueryClient;
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

/** Render with Chakra, React Query, (optional) AuthProvider and a MemoryRouter. */
export function renderWithProviders(
  ui: ReactElement,
  {
    initialEntries = ['/'],
    withAuth = true,
    queryClient = createTestQueryClient(),
    ...options
  }: ProvidersOptions = {},
): RenderResult {
  function Wrapper({ children }: { children: ReactNode }) {
    const content = <MemoryRouter initialEntries={initialEntries} future={ROUTER_FUTURE_FLAGS}>{children}</MemoryRouter>;
    return (
      <ChakraProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          {withAuth ? <AuthProvider>{content}</AuthProvider> : content}
        </QueryClientProvider>
      </ChakraProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
