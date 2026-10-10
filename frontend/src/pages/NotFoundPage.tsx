import { Button, HStack, Heading, Text, VStack } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiHome } from 'react-icons/fi';
import { PageWrapper } from '../components/layout/PageWrapper';
import { MeshBackground } from '../components/layout/MeshBackground';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { useAuth } from '../hooks/useAuth';

/** 404 page for unknown routes. */
export default function NotFoundPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const homePath = isAuthenticated ? '/dashboard' : '/';

  return (
    <PageWrapper maxW="lg" minH="80vh" display="flex" alignItems="center">
      <MeshBackground />
      <GlassCard w="full" textAlign="center" p={{ base: 8, md: 12 }} hoverable={false}>
        <VStack spacing={4}>
          <Text fontSize="6xl" lineHeight={1} aria-hidden="true">
            🔥
          </Text>
          <Heading
            size="2xl"
            bgGradient="linear(to-r, brand.500, accent.500)"
            bgClip="text"
          >
            404
          </Heading>
          <Heading size="md">This page got roasted into oblivion.</Heading>
          <Text color="text.muted">
            The page you are looking for does not exist or has been moved.
          </Text>
          <HStack spacing={3} pt={2} flexWrap="wrap" justify="center">
            <Button variant="ghost" leftIcon={<FiArrowLeft />} onClick={() => navigate(-1)}>
              Go back
            </Button>
            <GradientButton onClick={() => navigate(homePath)} leftIcon={<FiHome />}>
              {isAuthenticated ? 'Back to dashboard' : 'Back home'}
            </GradientButton>
          </HStack>
        </VStack>
      </GlassCard>
    </PageWrapper>
  );
}
