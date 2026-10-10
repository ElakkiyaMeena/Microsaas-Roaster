import {
  Alert,
  AlertDescription,
  AlertIcon,
  Flex,
  Heading,
  HStack,
  Icon,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@chakra-ui/react';
import { FiActivity, FiArrowRight, FiAward, FiFileText, FiInbox, FiPlus } from 'react-icons/fi';
import { FaGithub } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { AnimatedList } from '../components/ui/AnimatedList';
import { EmptyState } from '../components/ui/EmptyState';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { AnimatedButton } from '../components/dashboard/AnimatedButton';
import { StatCard } from '../components/dashboard/StatCard';
import { RecentSubmissionItem } from '../components/dashboard/RecentSubmissionItem';
import { useAuth } from '../hooks/useAuth';
import { useQuota, useRecentSubmissions } from '../hooks/useDashboard';
import { getErrorMessage } from '../lib/errors';

function firstName(fullName: string | null | undefined, email: string | undefined): string {
  const name = fullName?.trim();
  if (name) return name.split(/\s+/)[0];
  return email ? email.split('@')[0] : 'there';
}

/** Authenticated home: greeting, stats, and recent submissions. */
export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const quota = useQuota();
  const recent = useRecentSubmissions();

  const items = recent.data?.items ?? [];
  const latestScored = items.find((s) => s.latest_score !== null);
  const goNew = (): void => navigate('/submissions/new');

  return (
    <PageWrapper>
      <Flex
        direction={{ base: 'column', md: 'row' }}
        justify="space-between"
        align={{ base: 'flex-start', md: 'center' }}
        gap={4}
        mb={8}
      >
        <Stack spacing={1}>
          <Heading size="lg">Hey {firstName(user?.full_name, user?.email)} 👋</Heading>
          <Text color="text.muted">Ready to put some code on the grill?</Text>
        </Stack>
        <GradientButton leftIcon={<FiPlus />} size="lg" onClick={goNew}>
          Roast new assignment
        </GradientButton>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} mb={10}>
        <StatCard
          label="Roasts remaining today"
          icon={FiActivity}
          isLoading={quota.isLoading}
          value={
            quota.isError
              ? '—'
              : quota.data
                ? `${quota.data.remaining} / ${quota.data.limit}`
                : '—'
          }
          helpText={
            quota.isError ? getErrorMessage(quota.error, 'Could not load quota') : 'Resets at 00:00 UTC'
          }
        />
        <StatCard
          label="Total submissions"
          icon={FiFileText}
          isLoading={recent.isLoading}
          value={recent.isError ? '—' : (recent.data?.total ?? 0)}
        />
        <StatCard
          label="Latest score"
          icon={FiAward}
          isLoading={recent.isLoading}
          value={latestScored?.latest_score ?? '—'}
          helpText={latestScored ? latestScored.title : 'No roasts yet'}
        />
      </SimpleGrid>

      <GlassCard mb={10} aria-label="Roast a GitHub repo or commit">
        <Flex
          direction={{ base: 'column', sm: 'row' }}
          align={{ base: 'flex-start', sm: 'center' }}
          justify="space-between"
          gap={4}
        >
          <HStack spacing={4} align="flex-start">
            <Icon as={FaGithub} boxSize={10} color="brand.400" aria-hidden="true" />
            <Stack spacing={1}>
              <Heading as="h2" size="md">
                Roast a GitHub repo or commit
              </Heading>
              <Text color="text.muted">
                Paste a public repository or commit link and get the code roasted in Tanglish.
              </Text>
            </Stack>
          </HStack>
          <GradientButton
            leftIcon={<FaGithub />}
            rightIcon={<FiArrowRight />}
            onClick={() => navigate('/github-roast')}
            flexShrink={0}
          >
            GitHub Roast 🔥
          </GradientButton>
        </Flex>
      </GlassCard>

      <GlassCard hoverable={false}>
        <HStack justify="space-between" mb={4}>
          <Heading size="md">Recent submissions</Heading>
          <AnimatedButton variant="ghost" size="sm" onClick={() => navigate('/submissions')}>
            View all
          </AnimatedButton>
        </HStack>

        {recent.isLoading ? (
          <Stack spacing={3} aria-label="Loading submissions">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={16} borderRadius="xl" />
            ))}
          </Stack>
        ) : recent.isError ? (
          <Alert status="error" borderRadius="xl">
            <AlertIcon />
            <AlertDescription flex="1">
              {getErrorMessage(recent.error, 'Could not load your submissions.')}
            </AlertDescription>
            <AnimatedButton size="sm" onClick={() => void recent.refetch()}>
              Retry
            </AnimatedButton>
          </Alert>
        ) : items.length === 0 ? (
          <EmptyState
            icon={FiInbox}
            title="Nothing on the grill yet"
            description="Paste or upload your first assignment and get a witty, constructive review in seconds."
            action={
              <GradientButton leftIcon={<FiPlus />} onClick={goNew}>
                Roast my first assignment
              </GradientButton>
            }
          />
        ) : (
          <AnimatedList>
            {items.map((submission) => (
              <RecentSubmissionItem key={submission.id} submission={submission} />
            ))}
          </AnimatedList>
        )}
      </GlassCard>
    </PageWrapper>
  );
}
