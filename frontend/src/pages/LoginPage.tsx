import {
  Alert,
  AlertDescription,
  AlertIcon,
  Center,
  Divider,
  Heading,
  HStack,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Link as RouterLink, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MeshBackground } from '../components/layout/MeshBackground';
import { PageWrapper } from '../components/layout/PageWrapper';
import { GlassCard } from '../components/ui/GlassCard';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { TextReveal } from '../components/ui/TextReveal';
import { LoginForm } from '../components/auth/LoginForm';
import { GoogleLoginButton } from '../components/auth/GoogleLoginButton';
import type { LoginLocationState } from '../components/auth/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_state:
    'Your Google sign-in session expired or could not be verified. Please try again.',
  oauth_failed: 'Google sign-in failed. Please try again, or sign in with email and password.',
  inactive: 'This account has been deactivated. Contact support if you think this is a mistake.',
};

const DEFAULT_REDIRECT = '/dashboard';

/** Only allow same-origin, in-app redirect targets (no protocol-relative or auth pages). */
function resolveRedirect(state: unknown): string {
  const from = (state as LoginLocationState | null)?.from;
  if (
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.includes('\\') &&
    !from.startsWith('/login') &&
    !from.startsWith('/register')
  ) {
    return from;
  }
  return DEFAULT_REDIRECT;
}

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirectTo = resolveRedirect(location.state);
  const errorParam = searchParams.get('error');
  const oauthError = errorParam
    ? (OAUTH_ERROR_MESSAGES[errorParam] ?? 'Sign-in failed. Please try again.')
    : null;

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  const handleSuccess = (): void => {
    navigate(redirectTo, { replace: true });
  };

  return (
    <PageWrapper maxW="md">
      <MeshBackground />
      <Center minH={{ base: 'auto', md: '80vh' }}>
        <Stack spacing={6} w="full">
          <Stack spacing={2} textAlign="center">
            <TextReveal
              as="h1"
              text="Ready to get roasted? 🔥"
              size="xl"
              bgGradient="linear(to-r, brand.500, accent.500)"
              bgClip="text"
            />
            <Text color="text.muted">Sign in to submit code and face the music.</Text>
          </Stack>

          <GlassCard hoverable={false} p={{ base: 6, md: 8 }}>
            <Stack spacing={6}>
              <Heading as="h2" size="md">
                Log in
              </Heading>

              {oauthError && (
                <Alert status="error" borderRadius="xl">
                  <AlertIcon />
                  <AlertDescription>{oauthError}</AlertDescription>
                </Alert>
              )}

              <LoginForm onSuccess={handleSuccess} />

              <HStack justify="flex-end">
                <Link as={RouterLink} to="/forgot-password" fontSize="sm" color="brand.500">
                  Forgot password?
                </Link>
              </HStack>

              <HStack spacing={3}>
                <Divider />
                <Text fontSize="sm" color="text.muted" whiteSpace="nowrap">
                  or
                </Text>
                <Divider />
              </HStack>

              <GoogleLoginButton />

              <Text fontSize="sm" textAlign="center" color="text.muted">
                New here?{' '}
                <Link as={RouterLink} to="/register" color="brand.500" fontWeight="semibold">
                  Create an account
                </Link>
              </Text>
            </Stack>
          </GlassCard>
        </Stack>
      </Center>
    </PageWrapper>
  );
}
