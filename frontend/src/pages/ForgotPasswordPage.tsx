import { Center, Icon, Stack, Text } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiMail } from 'react-icons/fi';
import { MeshBackground } from '../components/layout/MeshBackground';
import { PageWrapper } from '../components/layout/PageWrapper';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { TextReveal } from '../components/ui/TextReveal';
import { GoogleLoginButton } from '../components/auth/GoogleLoginButton';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  return (
    <PageWrapper maxW="md">
      <MeshBackground />
      <Center minH={{ base: 'auto', md: '80vh' }}>
        <GlassCard hoverable={false} p={{ base: 6, md: 8 }} w="full">
          <Stack spacing={5} textAlign="center" align="center">
            <Icon as={FiMail} boxSize={10} color="brand.500" aria-hidden="true" />
            <TextReveal as="h1" text="Forgot your password?" size="lg" />
            <Text color="text.muted">
              Password reset by email is coming soon — contact support or sign in with Google.
            </Text>
            <Stack spacing={3} w="full">
              <GoogleLoginButton />
              <GradientButton
                size="lg"
                w="full"
                leftIcon={<FiArrowLeft />}
                onClick={() => navigate('/login')}
              >
                Back to sign in
              </GradientButton>
            </Stack>
          </Stack>
        </GlassCard>
      </Center>
    </PageWrapper>
  );
}
