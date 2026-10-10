import {
  Alert,
  AlertDescription,
  AlertIcon,
  Heading,
  SimpleGrid,
  Skeleton,
  Stack,
  Stat,
  StatLabel,
  StatNumber,
  Text,
} from '@chakra-ui/react';
import { FiActivity, FiAlertTriangle, FiFileText, FiLink, FiUsers } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { AdminNav } from '../../components/admin/AdminNav';
import { RoastsBarChart } from '../../components/admin/RoastsBarChart';
import { AnimatedButton } from '../../components/dashboard/AnimatedButton';
import { StatCard } from '../../components/dashboard/StatCard';
import { useAdminStats } from '../../hooks/useAdmin';
import { getErrorMessage } from '../../lib/errors';

const numberFormat = new Intl.NumberFormat();

/** Admin overview: platform totals, roasts per day and token usage. */
export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading, isError, error, refetch } = useAdminStats();

  const fmt = (value: number | undefined): string =>
    value === undefined ? '—' : numberFormat.format(value);

  return (
    <PageWrapper>
      <Heading size="lg" mb={4}>
        Admin
      </Heading>
      <AdminNav />

      {isError && (
        <Alert status="error" borderRadius="xl" mb={6}>
          <AlertIcon />
          <AlertDescription flex="1">
            {getErrorMessage(error, 'Could not load platform stats.')}
          </AlertDescription>
          <AnimatedButton size="sm" onClick={() => void refetch()}>
            Retry
          </AnimatedButton>
        </Alert>
      )}

      <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={6} mb={8}>
        <StatCard
          label="Users"
          icon={FiUsers}
          isLoading={isLoading}
          value={fmt(stats?.total_users)}
          helpText={stats ? `${fmt(stats.active_users)} active` : undefined}
        />
        <StatCard
          label="Submissions"
          icon={FiFileText}
          isLoading={isLoading}
          value={fmt(stats?.total_submissions)}
        />
        <StatCard
          label="Roasts"
          icon={FiActivity}
          isLoading={isLoading}
          value={fmt(stats?.total_roasts)}
          helpText={stats ? `${fmt(stats.failed_roasts)} failed` : undefined}
        />
        <StatCard
          label="Active share links"
          icon={FiLink}
          isLoading={isLoading}
          value={fmt(stats?.active_share_links)}
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={6}>
        <GlassCard hoverable={false} gridColumn={{ lg: 'span 2' }}>
          <Heading as="h2" size="md" mb={4}>
            Roasts in the last 7 days
          </Heading>
          {isLoading ? (
            <Skeleton h="200px" borderRadius="xl" />
          ) : (
            <RoastsBarChart data={stats?.roasts_last_7_days ?? []} />
          )}
        </GlassCard>

        <GlassCard hoverable={false}>
          <Stack spacing={5}>
            <Heading as="h2" size="md">
              OpenAI token usage
            </Heading>
            <Skeleton isLoaded={!isLoading} borderRadius="md">
              <Stack spacing={4}>
                <Stat>
                  <StatLabel color="text.muted">Prompt tokens</StatLabel>
                  <StatNumber>{fmt(stats?.total_prompt_tokens)}</StatNumber>
                </Stat>
                <Stat>
                  <StatLabel color="text.muted">Completion tokens</StatLabel>
                  <StatNumber>{fmt(stats?.total_completion_tokens)}</StatNumber>
                </Stat>
                <Stat>
                  <StatLabel color="text.muted">Total</StatLabel>
                  <StatNumber>
                    {stats
                      ? fmt(stats.total_prompt_tokens + stats.total_completion_tokens)
                      : '—'}
                  </StatNumber>
                </Stat>
              </Stack>
            </Skeleton>
            {stats && stats.failed_roasts > 0 && (
              <Text fontSize="sm" color="orange.400" display="flex" alignItems="center" gap={2}>
                <FiAlertTriangle aria-hidden="true" /> {fmt(stats.failed_roasts)} roasts failed
              </Text>
            )}
            <Stack direction={{ base: 'column', sm: 'row', lg: 'column' }} spacing={2}>
              <AnimatedButton
                variant="outline"
                leftIcon={<FiUsers />}
                onClick={() => navigate('/admin/users')}
              >
                Manage users
              </AnimatedButton>
              <AnimatedButton
                variant="outline"
                leftIcon={<FiLink />}
                onClick={() => navigate('/admin/share-links')}
              >
                Moderate share links
              </AnimatedButton>
            </Stack>
          </Stack>
        </GlassCard>
      </SimpleGrid>
    </PageWrapper>
  );
}
