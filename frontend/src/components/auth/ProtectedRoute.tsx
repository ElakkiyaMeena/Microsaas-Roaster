import { useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Heading, Text, VStack } from '@chakra-ui/react';
import { useAuth } from '../../hooks/useAuth';
import { hasTokens } from '../../lib/tokens';
import { GradientButton } from '../ui/GradientButton';
import { LoadingScreen } from '../ui/LoadingScreen';

/** Shown when tokens exist but the session could not be restored (network error / 5xx). */
function SessionUnavailable() {
  const { refreshUser } = useAuth();
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  const retry = async (): Promise<void> => {
    setIsRetrying(true);
    try {
      await refreshUser();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <VStack role="alert" spacing={4} py={24} px={4} minH="100vh" justify="center" textAlign="center">
      <Heading size="lg">Can&apos;t reach the roaster</Heading>
      <Text color="text.muted" maxW="md">
        We couldn&apos;t restore your session. Check your connection and try again.
      </Text>
      <GradientButton onClick={() => void retry()} isLoading={isRetrying} loadingText="Retrying…">
        Retry
      </GradientButton>
    </VStack>
  );
}

export interface ProtectedRouteProps {
  children: ReactNode;
  /** Require `user.is_admin`; non-admins are redirected to /dashboard. */
  requireAdmin?: boolean;
}

/** Location state passed to /login so it can redirect back after sign-in. */
export interface LoginLocationState {
  from?: string;
}

/** Guards routes: unauthenticated users go to /login (with `state.from`). */
export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user && hasTokens()) {
    return <SessionUnavailable />;
  }

  if (!user) {
    const state: LoginLocationState = {
      from: `${location.pathname}${location.search}${location.hash}`,
    };
    return <Navigate to="/login" replace state={state} />;
  }

  if (requireAdmin && !user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
