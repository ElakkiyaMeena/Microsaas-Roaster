import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertIcon, Center, Stack } from '@chakra-ui/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MeshBackground } from '../components/layout/MeshBackground';
import { PageWrapper } from '../components/layout/PageWrapper';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { TextReveal } from '../components/ui/TextReveal';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../lib/errors';

interface FragmentTokens {
  accessToken: string;
  refreshToken: string;
}

function parseFragment(hash: string): FragmentTokens | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

/** Remove the token fragment from the address bar without adding a history entry. */
function clearFragment(): void {
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', `${pathname}${search}`);
}

/** Landing page for the Google OAuth redirect: stores tokens from the URL fragment. */
export default function OAuthCallbackPage() {
  const { setTokens, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // StrictMode runs effects twice in development; tokens must only be consumed/stored once.
  const hasParsed = useRef<boolean>(false);
  const hasStored = useRef<boolean>(false);
  const tokensRef = useRef<FragmentTokens | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1) Read the tokens and immediately scrub them from the address bar.
  useEffect(() => {
    if (hasParsed.current) return;
    hasParsed.current = true;

    tokensRef.current = parseFragment(window.location.hash || location.hash);
    clearFragment();

    if (!tokensRef.current) {
      setError('We could not complete Google sign-in: the response was missing tokens.');
    }
  }, [location.hash]);

  // 2) Store them once the initial session restore has settled (avoids a duplicate /auth/me).
  useEffect(() => {
    const tokens = tokensRef.current;
    if (isLoading || hasStored.current || !tokens) return;
    hasStored.current = true;

    setTokens(tokens.accessToken, tokens.refreshToken)
      .then(() => {
        navigate('/dashboard', { replace: true });
      })
      .catch((err: unknown) => {
        setError(getErrorMessage(err, 'We could not complete Google sign-in. Please try again.'));
      });
  }, [isLoading, navigate, setTokens]);

  return (
    <PageWrapper maxW="md">
      <MeshBackground />
      <Center minH={{ base: 'auto', md: '80vh' }}>
        {error ? (
          <GlassCard hoverable={false} p={{ base: 6, md: 8 }} w="full">
            <Stack spacing={5} textAlign="center">
              <TextReveal as="h1" text="Sign-in fizzled out 🧯" size="lg" />
              <Alert status="error" borderRadius="xl" textAlign="left">
                <AlertIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <GradientButton size="lg" w="full" onClick={() => navigate('/login', { replace: true })}>
                Back to sign in
              </GradientButton>
            </Stack>
          </GlassCard>
        ) : (
          <LoadingScreen label="Signing you in..." />
        )}
      </Center>
    </PageWrapper>
  );
}
