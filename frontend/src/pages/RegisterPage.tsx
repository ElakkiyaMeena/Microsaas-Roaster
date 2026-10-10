import { Center, Divider, Heading, HStack, Link, Stack, Text } from '@chakra-ui/react';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';
import { MeshBackground } from '../components/layout/MeshBackground';
import { PageWrapper } from '../components/layout/PageWrapper';
import { GlassCard } from '../components/ui/GlassCard';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { TextReveal } from '../components/ui/TextReveal';
import { RegisterForm } from '../components/auth/RegisterForm';
import { GoogleLoginButton } from '../components/auth/GoogleLoginButton';
import { useAuth } from '../hooks/useAuth';

export default function RegisterPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  const handleSuccess = (): void => {
    navigate('/dashboard', { replace: true });
  };

  return (
    <PageWrapper maxW="md">
      <MeshBackground />
      <Center minH={{ base: 'auto', md: '80vh' }}>
        <Stack spacing={6} w="full">
          <Stack spacing={2} textAlign="center">
            <TextReveal
              as="h1"
              text="Bring your code. We bring the heat. 🔥"
              size="xl"
              bgGradient="linear(to-r, brand.500, accent.500)"
              bgClip="text"
            />
            <Text color="text.muted">
              Honest, funny, constructive code reviews for your bootcamp assignments.
            </Text>
          </Stack>

          <GlassCard hoverable={false} p={{ base: 6, md: 8 }}>
            <Stack spacing={6}>
              <Heading as="h2" size="md">
                Create your account
              </Heading>

              <RegisterForm onSuccess={handleSuccess} />

              <HStack spacing={3}>
                <Divider />
                <Text fontSize="sm" color="text.muted" whiteSpace="nowrap">
                  or
                </Text>
                <Divider />
              </HStack>

              <GoogleLoginButton label="Sign up with Google" />

              <Text fontSize="sm" textAlign="center" color="text.muted">
                Already have an account?{' '}
                <Link as={RouterLink} to="/login" color="brand.500" fontWeight="semibold">
                  Sign in
                </Link>
              </Text>
            </Stack>
          </GlassCard>
        </Stack>
      </Center>
    </PageWrapper>
  );
}
