import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Collapse,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Icon,
  Link,
  List,
  ListItem,
  Stack,
  Text,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import {
  FiChevronDown,
  FiChevronUp,
  FiEdit2,
  FiFileText,
  FiRefreshCw,
  FiTrash2,
} from 'react-icons/fi';
import { FaGithub } from 'react-icons/fa';
import { PageWrapper } from '../components/layout/PageWrapper';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { EmptyState } from '../components/ui/EmptyState';
import { CodeViewer } from '../components/roast/CodeViewer';
import { IntensityPicker } from '../components/roast/IntensityPicker';
import { RoastHistory } from '../components/roast/RoastHistory';
import { RoastLoading } from '../components/roast/RoastLoading';
import { RoastView } from '../components/roast/RoastView';
import { formatDateTime } from '../components/roast/scoreColor';
import { ShareButton } from '../components/sharing/ShareButton';
import { ActionButton } from '../components/submissions/ActionButton';
import { ConfirmDeleteDialog } from '../components/submissions/ConfirmDeleteDialog';
import { SubmissionNotFound } from '../components/submissions/SubmissionNotFound';
import { formatBytes } from '../components/submissions/uploadValidation';
import { getSourceTypeLabel } from '../components/submissions/sourceType';
import { useAuth } from '../hooks/useAuth';
import { useCreateRoast, useRoastQuota } from '../hooks/useRoasts';
import { useDeleteSubmission, useSubmission } from '../hooks/useSubmissions';
import { getErrorCode, getErrorMessage, getErrorStatus } from '../lib/errors';
import { shortGithubLabel } from '../lib/github';
import { hasActivePendingRoast, isRoastTimedOut, PENDING_POLL_INTERVAL_MS } from '../lib/roastStatus';
import type { Roast, RoastIntensity } from '../types';
import { getIntensityOption, getLanguageLabel } from '../types';

function parseId(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

interface RoastPanelProps {
  roast: Roast;
  onRetry: () => void;
  isRetrying: boolean;
  /** Current time (ms), used to detect pending roasts that timed out. */
  now: number;
}

function RoastPanel({ roast, onRetry, isRetrying, now }: RoastPanelProps) {
  const timedOut = isRoastTimedOut(roast, now);
  if (roast.status === 'failed' || timedOut) {
    return (
      <Alert
        status="error"
        variant="subtle"
        borderRadius="xl"
        flexDirection="column"
        alignItems="flex-start"
        gap={3}
        py={5}
      >
        <HStack>
          <AlertIcon />
          <AlertTitle>{timedOut ? 'This roast timed out' : 'The roast fell off the grill'}</AlertTitle>
        </HStack>
        <AlertDescription>
          {timedOut
            ? 'The grill never finished this one. Give it another go.'
            : (roast.error_message ?? 'Something went wrong while roasting. Please try again.')}
        </AlertDescription>
        <ActionButton
          leftIcon={<FiRefreshCw />}
          colorScheme="red"
          variant="outline"
          size="sm"
          onClick={onRetry}
          isLoading={isRetrying}
        >
          Retry ({getIntensityOption(roast.intensity).label})
        </ActionButton>
      </Alert>
    );
  }
  if (roast.status === 'pending') {
    return <RoastLoading />;
  }
  return <RoastView roast={roast} />;
}

/** Submission detail: code, files, latest roast, re-roast, history, edit/delete. */
export default function SubmissionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseId(params.id);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { data: submission, isLoading, isError, error, refetch } = useSubmission(id);
  const quota = useRoastQuota();
  const createRoast = useCreateRoast();
  const deleteSubmission = useDeleteSubmission();
  const brief = useDisclosure({ defaultIsOpen: false });
  const deleteDialog = useDisclosure();

  const [selectedRoastId, setSelectedRoastId] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<RoastIntensity>(user?.default_intensity ?? 'medium');
  const [roastError, setRoastError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const pollingPending = hasActivePendingRoast(submission, now);

  // Tick a clock while a pending roast is in flight so it flips to "timed out" on time.
  useEffect(() => {
    if (!pollingPending) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), PENDING_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pollingPending]);

  if (id === undefined) {
    return (
      <PageWrapper maxW="container.md">
        <SubmissionNotFound />
      </PageWrapper>
    );
  }

  if (isLoading) {
    return <LoadingScreen label="Fetching your submission…" />;
  }

  if (isError || !submission) {
    if (getErrorStatus(error) === 404) {
      return (
        <PageWrapper maxW="container.md">
          <SubmissionNotFound />
        </PageWrapper>
      );
    }
    return (
      <PageWrapper maxW="container.md">
        <Alert status="error" borderRadius="xl">
          <AlertIcon />
          <AlertDescription flex="1">
            {getErrorMessage(error, 'Could not load this submission.')}
          </AlertDescription>
          <ActionButton size="sm" onClick={() => void refetch()}>
            Retry
          </ActionButton>
        </Alert>
      </PageWrapper>
    );
  }

  const roasts = submission.roasts;
  const selectedRoast: Roast | undefined =
    roasts.find((r) => r.id === selectedRoastId) ?? roasts[0];
  const isRoasting = createRoast.isPending;
  const isGithubCommit = submission.source_type === 'github_commit';
  const isGithubRepo = submission.source_type === 'github_repo';
  const isGithub = isGithubCommit || isGithubRepo;
  const outOfRoasts = quota.data !== undefined && quota.data.remaining <= 0;

  const runRoast = async (roastIntensity: RoastIntensity): Promise<void> => {
    setRoastError(null);
    try {
      const roast = await createRoast.mutateAsync({
        submissionId: submission.id,
        intensity: roastIntensity,
      });
      setSelectedRoastId(roast.id);
      if (roast.status === 'failed') {
        toast({ status: 'warning', title: 'Roast failed', description: roast.error_message ?? undefined });
      }
    } catch (err) {
      const code = getErrorCode(err);
      const status = getErrorStatus(err);
      let message = getErrorMessage(err, 'Could not roast your code.');
      if (code === 'ROAST_LIMIT_REACHED' || status === 429) {
        message = `${message} Come back tomorrow for more heat.`;
      } else if (code === 'AI_NOT_CONFIGURED' || status === 503) {
        message = `The roaster is offline right now. ${message}`;
      }
      setRoastError(message);
    }
  };

  const handleDelete = async (): Promise<void> => {
    try {
      await deleteSubmission.mutateAsync(submission.id);
      toast({ status: 'success', title: 'Submission deleted' });
      deleteDialog.onClose();
      navigate('/submissions');
    } catch (err) {
      toast({ status: 'error', title: 'Could not delete', description: getErrorMessage(err) });
    }
  };

  return (
    <PageWrapper>
      {/* Header */}
      <Flex
        justify="space-between"
        align={{ base: 'flex-start', md: 'center' }}
        direction={{ base: 'column', md: 'row' }}
        gap={4}
        mb={6}
      >
        <Stack spacing={2} minW={0}>
          <Heading size="lg" wordBreak="break-word">
            {submission.title}
          </Heading>
          <HStack spacing={2} flexWrap="wrap">
            <Badge colorScheme="purple">{getLanguageLabel(submission.language)}</Badge>
            <Badge
              variant="outline"
              display="inline-flex"
              alignItems="center"
              gap={1}
              colorScheme={isGithub ? 'gray' : undefined}
            >
              {isGithub && <FaGithub aria-hidden="true" />}
              {getSourceTypeLabel(submission.source_type)}
            </Badge>
            {isGithub && submission.source_url && (
              <Link
                href={submission.source_url}
                isExternal
                target="_blank"
                rel="noopener noreferrer"
                display="inline-flex"
                alignItems="center"
                gap={1}
                fontSize="sm"
                fontFamily="mono"
                color="brand.400"
                aria-label={`View ${isGithubRepo ? 'repository' : 'commit'} ${shortGithubLabel(submission.source_url)} on GitHub`}
              >
                <FaGithub aria-hidden="true" />
                {shortGithubLabel(submission.source_url)}
              </Link>
            )}
            <Text fontSize="sm" color="text.muted">
              Created {formatDateTime(submission.created_at)}
            </Text>
          </HStack>
        </Stack>
        <HStack spacing={2}>
          <ActionButton
            leftIcon={<FiEdit2 />}
            variant="outline"
            onClick={() => navigate(`/submissions/${submission.id}/edit`)}
          >
            Edit
          </ActionButton>
          <ActionButton
            leftIcon={<FiTrash2 />}
            variant="outline"
            colorScheme="red"
            onClick={deleteDialog.onOpen}
          >
            Delete
          </ActionButton>
        </HStack>
      </Flex>

      <Grid templateColumns={{ base: '1fr', lg: '3fr 2fr' }} gap={6} alignItems="start">
        {/* Roast column */}
        <GridItem order={{ base: 1, lg: 1 }} minW={0}>
          <Stack spacing={6}>
            <GlassCard hoverable={false}>
              <Flex justify="space-between" align="center" mb={4} gap={3} flexWrap="wrap">
                <Heading as="h2" size="md">
                  {selectedRoast && selectedRoast.id !== roasts[0]?.id ? 'Earlier roast' : 'Latest roast'}
                </Heading>
                {selectedRoast && selectedRoast.status === 'completed' && !isRoasting && (
                  <ShareButton roast={selectedRoast} />
                )}
              </Flex>
              {isRoasting ? (
                <RoastLoading />
              ) : selectedRoast ? (
                <RoastPanel
                  roast={selectedRoast}
                  onRetry={() => void runRoast(selectedRoast.intensity)}
                  isRetrying={isRoasting}
                  now={now}
                />
              ) : (
                <EmptyState
                  title="Not roasted yet"
                  description="Pick a heat level below and fire up the grill."
                  py={6}
                />
              )}
            </GlassCard>

            <GlassCard hoverable={false}>
              <Stack spacing={4}>
                <HStack justify="space-between" flexWrap="wrap">
                  <Heading as="h2" size="sm">
                    {roasts.length > 0 ? 'Re-roast' : 'Roast it'}
                  </Heading>
                  {quota.data && (
                    <Text fontSize="sm" color="text.muted">
                      {quota.data.remaining} of {quota.data.limit} roasts left today
                    </Text>
                  )}
                </HStack>
                <IntensityPicker
                  value={intensity}
                  onChange={setIntensity}
                  isDisabled={isRoasting}
                  name="reroast-intensity"
                  compact
                />
                {roastError && (
                  <Alert status="error" borderRadius="lg" role="alert">
                    <AlertIcon />
                    <AlertDescription>{roastError}</AlertDescription>
                  </Alert>
                )}
                <HStack justify="flex-end">
                  <GradientButton
                    onClick={() => void runRoast(intensity)}
                    isLoading={isRoasting}
                    loadingText="Roasting…"
                    isDisabled={outOfRoasts}
                    title={outOfRoasts ? 'Daily roast limit reached' : undefined}
                  >
                    {roasts.length > 0 ? 'Re-roast 🔥' : 'Roast it 🔥'}
                  </GradientButton>
                </HStack>
              </Stack>
            </GlassCard>

            <GlassCard hoverable={false}>
              <Heading as="h2" size="sm" mb={3}>
                {isGithubCommit ? 'Commit diff' : isGithubRepo ? 'Repository snapshot' : 'Code'}
              </Heading>
              <CodeViewer
                code={submission.code_content}
                language={submission.language}
                diff={isGithubCommit}
              />
            </GlassCard>
          </Stack>
        </GridItem>

        {/* Side column */}
        <GridItem order={{ base: 2, lg: 2 }} minW={0}>
          <Stack spacing={6}>
            {roasts.length > 0 && (
              <GlassCard hoverable={false}>
                <Heading as="h2" size="sm" mb={3}>
                  Roast history ({roasts.length})
                </Heading>
                <RoastHistory
                  roasts={roasts}
                  selectedId={selectedRoast?.id ?? null}
                  onSelect={setSelectedRoastId}
                />
              </GlassCard>
            )}

            <GlassCard hoverable={false}>
              <Flex justify="space-between" align="center">
                <Heading as="h2" size="sm">
                  Assignment brief
                </Heading>
                {submission.assignment_brief && (
                  <ActionButton
                    size="sm"
                    variant="ghost"
                    rightIcon={brief.isOpen ? <FiChevronUp /> : <FiChevronDown />}
                    onClick={brief.onToggle}
                    aria-expanded={brief.isOpen}
                    aria-controls="assignment-brief"
                  >
                    {brief.isOpen ? 'Hide' : 'Show'}
                  </ActionButton>
                )}
              </Flex>
              {submission.assignment_brief ? (
                <Collapse in={brief.isOpen} animateOpacity>
                  <Text id="assignment-brief" mt={3} whiteSpace="pre-wrap" fontSize="sm" color="text.muted">
                    {submission.assignment_brief}
                  </Text>
                </Collapse>
              ) : (
                <Text mt={2} fontSize="sm" color="text.muted">
                  No brief provided. Add one via Edit so roasts can check the requirements.
                </Text>
              )}
            </GlassCard>

            {submission.files.length > 0 && (
              <GlassCard hoverable={false}>
                <Heading as="h2" size="sm" mb={3}>
                  Uploaded files ({submission.files.length})
                </Heading>
                <List spacing={2} aria-label="Uploaded files">
                  {submission.files.map((file) => (
                    <ListItem key={file.id} display="flex" alignItems="center" gap={2}>
                      <Icon as={FiFileText} color="brand.400" aria-hidden="true" />
                      <Text flex="1" fontFamily="mono" fontSize="sm" noOfLines={1} title={file.filename}>
                        {file.filename}
                      </Text>
                      <Box as="span" fontSize="xs" color="text.muted">
                        {formatBytes(file.size_bytes)}
                      </Box>
                    </ListItem>
                  ))}
                </List>
              </GlassCard>
            )}
          </Stack>
        </GridItem>
      </Grid>

      <ConfirmDeleteDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.onClose}
        onConfirm={() => void handleDelete()}
        isLoading={deleteSubmission.isPending}
        title={`Delete “${submission.title}”?`}
      />
    </PageWrapper>
  );
}
