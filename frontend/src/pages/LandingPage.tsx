import { Box, Container, Heading, Stack, Text } from '@chakra-ui/react';
import { FiArrowRight } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { MeshBackground } from '../components/layout/MeshBackground';
import { PageWrapper } from '../components/layout/PageWrapper';
import { AnimatedButton } from '../components/dashboard/AnimatedButton';
import { HowItWorks } from '../components/landing/HowItWorks';
import { LandingFooter } from '../components/landing/LandingFooter';
import { LandingNav } from '../components/landing/LandingNav';
import { SampleRoastCard } from '../components/landing/SampleRoastCard';
import { GradientButton } from '../components/ui/GradientButton';
import { TextReveal } from '../components/ui/TextReveal';
import { useAuth } from '../hooks/useAuth';

/** Public marketing page. */
export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return (
    <Box minH="100vh" display="flex" flexDirection="column">
      <MeshBackground />
      <LandingNav />
      <Box as="main" flex="1">
        <PageWrapper py={{ base: 12, md: 20 }}>
          <Stack spacing={{ base: 16, md: 24 }}>
            <Stack as="section" spacing={6} align="center" textAlign="center" aria-label="Hero">
              <TextReveal
                as="h1"
                text="Your code. Roasted. 🔥"
                fontSize={{ base: '4xl', sm: '5xl', md: '7xl' }}
                fontWeight="extrabold"
                lineHeight="1.1"
                letterSpacing="tight"
              />
              <Text fontSize={{ base: 'lg', md: 'xl' }} color="text.muted" maxW="2xl">
                Built for coding bootcamp learners. Submit your assignment and get a witty,
                brutally honest (but always constructive) code review with a score, concrete
                fixes, and a roast you can share.
              </Text>
              <Stack
                direction={{ base: 'column', sm: 'row' }}
                spacing={4}
                w={{ base: 'full', sm: 'auto' }}
              >
                <GradientButton
                  size="lg"
                  rightIcon={<FiArrowRight />}
                  onClick={() => navigate(isAuthenticated ? '/dashboard' : '/register')}
                >
                  Roast my code
                </GradientButton>
                {!isAuthenticated && (
                  <AnimatedButton
                    size="lg"
                    variant="outline"
                    onClick={() => navigate('/login')}
                  >
                    Sign in
                  </AnimatedButton>
                )}
              </Stack>
            </Stack>

            <HowItWorks />

            <Stack as="section" spacing={8} align="center" aria-labelledby="sample-roast">
              <Stack spacing={2} textAlign="center">
                <Heading id="sample-roast" as="h2" size="xl">
                  A taste of the heat
                </Heading>
                <Text color="text.muted">Here is what a Medium roast looks like.</Text>
              </Stack>
              <SampleRoastCard />
            </Stack>

            <Container maxW="2xl" textAlign="center">
              <Stack spacing={5} align="center">
                <Heading as="h2" size="lg">
                  Your next commit deserves better.
                </Heading>
                <GradientButton
                  size="lg"
                  onClick={() => navigate(isAuthenticated ? '/submissions/new' : '/register')}
                >
                  Start roasting, it&apos;s free
                </GradientButton>
              </Stack>
            </Container>
          </Stack>
        </PageWrapper>
      </Box>
      <LandingFooter />
    </Box>
  );
}
