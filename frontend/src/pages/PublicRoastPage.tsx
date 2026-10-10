import type { ReactNode } from 'react';
import {
  Badge,
  Box,
  Container,
  Flex,
  Heading,
  HStack,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { FiAlertTriangle, FiWind } from 'react-icons/fi';
import { MeshBackground } from '../components/layout/MeshBackground';
import { PageWrapper } from '../components/layout/PageWrapper';
import { EmptyState } from '../components/ui/EmptyState';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { RoastView } from '../components/roast/RoastView';
import { CodeViewer } from '../components/roast/CodeViewer';
import { MotionAction } from '../components/sharing/MotionAction';
import { usePageMeta } from '../components/sharing/usePageMeta';
import { usePublicRoast } from '../hooks/useShareLinks';
import { getErrorMessage, getErrorStatus } from '../lib/errors';
import { getIntensityOption, getLanguageLabel, type PublicRoast } from '../types';

const APP_NAME = 'Assignment Roaster';

function TopBar() {
  return (
    <Box as="header" w="full" borderBottomWidth="1px" borderColor="border.subtle" bg="bg.surface" backdropFilter="blur(12px)">
      <Container maxW="container.xl" px={{ base: 4, md: 6 }} py={3}>
        <Flex align="center" justify="space-between" gap={3}>
          <Link
            as={RouterLink}
            to="/"
            fontWeight="extrabold"
            fontSize={{ base: 'md', md: 'lg' }}
            _hover={{ textDecoration: 'none', opacity: 0.85 }}
          >
            🔥 {APP_NAME}
          </Link>
        </Flex>
      </Container>
    </Box>
  );
}

function CtaCard() {
  const navigate = useNavigate();
  return (
    <GlassCard textAlign="center">
      <Stack spacing={4} align="center">
        <Heading size="md">Get your own code roasted</Heading>
        <Text color="text.muted" maxW="lg">
          Paste or upload your assignment and get a witty, constructive code review with a score
          and concrete fixes in seconds.
        </Text>
        <GradientButton onClick={() => navigate('/register')}>Roast my code 🔥</GradientButton>
      </Stack>
    </GlassCard>
  );
}

function buildDescription(roast: PublicRoast): string {
  const score = roast.score !== null ? `Score ${roast.score}/100. ` : '';
  const summary = roast.summary ?? `A ${roast.intensity} roast of "${roast.submission_title}".`;
  const text = `${score}${summary}`;
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

function RoastContent({ roast }: { roast: PublicRoast }) {
  const intensity = getIntensityOption(roast.intensity);
  return (
    <Stack spacing={6}>
      <Stack spacing={3}>
        <Heading size="lg">{roast.submission_title}</Heading>
        <HStack spacing={2} flexWrap="wrap">
          <Badge colorScheme="purple" variant="subtle">
            {getLanguageLabel(roast.language)}
          </Badge>
          <Badge colorScheme="orange" variant="subtle">
            {intensity.emoji} {intensity.label}
          </Badge>
        </HStack>
        {roast.author_name && (
          <Text color="text.muted">Roasted for {roast.author_name}</Text>
        )}
      </Stack>

      <GlassCard hoverable={false}>
        <RoastView roast={roast} />
      </GlassCard>

      {roast.code_content !== null && (
        <GlassCard hoverable={false}>
          <Heading size="sm" mb={4}>
            The code in question
          </Heading>
          <CodeViewer code={roast.code_content} language={roast.language} />
        </GlassCard>
      )}

      <CtaCard />
    </Stack>
  );
}

/** Public, unauthenticated view of a shared roast at /r/:slug. */
export default function PublicRoastPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch, isFetching } = usePublicRoast(slug);

  const title = data ? `${data.headline ?? data.submission_title} — ${APP_NAME}` : undefined;
  usePageMeta({ title, description: data ? buildDescription(data) : undefined });

  const notFound = !slug || (isError && getErrorStatus(error) === 404);

  let body: ReactNode;
  if (notFound) {
    body = (
      <GlassCard hoverable={false}>
        <EmptyState
          icon={FiWind}
          title="This roast has cooled down"
          description="The link expired or was removed by its owner. Why not fire up a roast of your own?"
          action={
            <GradientButton onClick={() => navigate('/register')}>Get your own code roasted</GradientButton>
          }
        />
      </GlassCard>
    );
  } else if (isLoading) {
    body = <LoadingScreen label="Reheating the roast..." />;
  } else if (isError || !data) {
    body = (
      <GlassCard hoverable={false}>
        <EmptyState
          icon={FiAlertTriangle}
          title="Couldn't load this roast"
          description={getErrorMessage(error)}
          action={
            <MotionAction variant="outline" isLoading={isFetching} onClick={() => void refetch()}>
              Try again
            </MotionAction>
          }
        />
      </GlassCard>
    );
  } else {
    body = <RoastContent roast={data} />;
  }

  return (
    <Box minH="100vh">
      <MeshBackground />
      <TopBar />
      <PageWrapper maxW="container.lg">{body}</PageWrapper>
    </Box>
  );
}
