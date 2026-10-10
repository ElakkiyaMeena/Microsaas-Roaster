import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Flex,
  Heading,
  HStack,
  Skeleton,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { FiChevronLeft, FiChevronRight, FiCode, FiPlus } from 'react-icons/fi';
import { PageWrapper } from '../components/layout/PageWrapper';
import { AnimatedList } from '../components/ui/AnimatedList';
import { EmptyState } from '../components/ui/EmptyState';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { ActionButton } from '../components/submissions/ActionButton';
import { ConfirmDeleteDialog } from '../components/submissions/ConfirmDeleteDialog';
import { SubmissionCard } from '../components/submissions/SubmissionCard';
import { useDeleteSubmission, useSubmissions } from '../hooks/useSubmissions';
import { getErrorMessage } from '../lib/errors';
import type { SubmissionListItem } from '../types';

const PER_PAGE = 10;

function parsePage(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Paginated list of the current user's submissions. */
export default function SubmissionsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const { data, isLoading, isError, error, refetch, isFetching } = useSubmissions(page, PER_PAGE);
  const deleteSubmission = useDeleteSubmission();
  const [pendingDelete, setPendingDelete] = useState<SubmissionListItem | null>(null);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  const goToPage = (next: number): void => {
    setSearchParams(next <= 1 ? {} : { page: String(next) });
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    try {
      await deleteSubmission.mutateAsync(pendingDelete.id);
      toast({ status: 'success', title: 'Submission deleted' });
      setPendingDelete(null);
      if (data && data.items.length === 1 && page > 1) goToPage(page - 1);
    } catch (err) {
      toast({
        status: 'error',
        title: 'Could not delete submission',
        description: getErrorMessage(err),
      });
    }
  };

  const newButton = (
    <GradientButton leftIcon={<FiPlus />} onClick={() => navigate('/submissions/new')}>
      New roast
    </GradientButton>
  );

  return (
    <PageWrapper maxW="container.lg">
      <Flex justify="space-between" align={{ base: 'flex-start', sm: 'center' }} gap={4} mb={6} direction={{ base: 'column', sm: 'row' }}>
        <Stack spacing={1}>
          <Heading size="lg">Your submissions</Heading>
          <Text color="text.muted">
            {data ? `${data.total} submission${data.total === 1 ? '' : 's'}` : 'Everything you have put on the grill.'}
          </Text>
        </Stack>
        {newButton}
      </Flex>

      {isLoading && (
        <Stack spacing={3} aria-busy="true" aria-label="Loading submissions">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h="96px" borderRadius="2xl" />
          ))}
        </Stack>
      )}

      {isError && (
        <Alert status="error" borderRadius="xl">
          <AlertIcon />
          <AlertDescription flex="1">{getErrorMessage(error, 'Could not load submissions.')}</AlertDescription>
          <ActionButton size="sm" onClick={() => void refetch()}>
            Retry
          </ActionButton>
        </Alert>
      )}

      {data && data.items.length === 0 && page === 1 && (
        <GlassCard hoverable={false}>
          <EmptyState
            icon={FiCode}
            title="Nothing on the grill yet"
            description="Paste or upload an assignment and get a witty, constructive code review in seconds."
            action={
              <GradientButton onClick={() => navigate('/submissions/new')}>
                Roast your first assignment 🔥
              </GradientButton>
            }
          />
        </GlassCard>
      )}

      {data && data.items.length === 0 && page > 1 && (
        <EmptyState
          title="No submissions on this page"
          action={<ActionButton onClick={() => goToPage(1)}>Back to first page</ActionButton>}
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <AnimatedList key={page} spacing={4} opacity={isFetching ? 0.7 : 1}>
            {data.items.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                onDelete={setPendingDelete}
              />
            ))}
          </AnimatedList>

          {totalPages > 1 && (
            <HStack justify="center" spacing={4} mt={8} as="nav" aria-label="Pagination">
              <ActionButton
                leftIcon={<FiChevronLeft />}
                variant="outline"
                onClick={() => goToPage(page - 1)}
                isDisabled={page <= 1}
              >
                Previous
              </ActionButton>
              <Text fontSize="sm" color="text.muted" aria-live="polite">
                Page {page} of {totalPages}
              </Text>
              <ActionButton
                rightIcon={<FiChevronRight />}
                variant="outline"
                onClick={() => goToPage(page + 1)}
                isDisabled={page >= totalPages}
              >
                Next
              </ActionButton>
            </HStack>
          )}
        </>
      )}

      <ConfirmDeleteDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        isLoading={deleteSubmission.isPending}
        title={pendingDelete ? `Delete “${pendingDelete.title}”?` : 'Delete submission?'}
      />
    </PageWrapper>
  );
}
