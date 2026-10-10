import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  Collapse,
  Flex,
  Heading,
  HStack,
  Link,
  Stack,
  Text,
  useDisclosure,
} from '@chakra-ui/react';
import { FaGithub } from 'react-icons/fa';
import { FiArrowRight, FiChevronDown, FiChevronUp, FiRefreshCw, FiRotateCcw } from 'react-icons/fi';
import { PageWrapper } from '../components/layout/PageWrapper';
import { AnimatedInput } from '../components/ui/AnimatedInput';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { TextReveal } from '../components/ui/TextReveal';
import { IntensityPicker } from '../components/roast/IntensityPicker';
import { RoastLoading } from '../components/roast/RoastLoading';
import { RoastView } from '../components/roast/RoastView';
import { ShareButton } from '../components/sharing/ShareButton';
import { ActionButton } from '../components/submissions/ActionButton';
import { SubmissionFields } from '../components/submissions/SubmissionFields';
import {
  validateSubmissionFields,
  type SubmissionFieldErrors,
  type SubmissionFieldValues,
} from '../components/submissions/formValidation';
import { useAuth } from '../hooks/useAuth';
import { useCreateRoast, useRoastQuota } from '../hooks/useRoasts';
import { useCreateGithubCommitSubmission } from '../hooks/useSubmissions';
import { getErrorCode, getErrorMessage, getErrorStatus } from '../lib/errors';
import { shortCommitLabel, validateCommitUrl } from '../lib/github';
import type { Roast, RoastIntensity, SubmissionDetail } from '../types';

type Phase = 'idle' | 'saving' | 'roasting' | 'done';

interface FormErrors extends SubmissionFieldErrors {
  commitUrl?: string;
}

interface FriendlyError {
  title: string;
  message: string;
}

const INITIAL_FIELDS: SubmissionFieldValues = { title: '', language: 'python', brief: '' };

/** Titles for known error codes; the message itself always comes from the backend `detail`. */
const ERROR_TITLES: Record<string, string> = {
  INVALID_GITHUB_URL: 'That link doesn’t work',
  GITHUB_COMMIT_NOT_FOUND: 'Commit not found',
  GITHUB_RATE_LIMITED: 'GitHub is rate limiting us',
  GITHUB_UNAVAILABLE: 'GitHub is not responding',
  NO_READABLE_FILES: 'Nothing to roast in that commit',
  ROAST_LIMIT_REACHED: 'Daily roast limit reached',
  AI_NOT_CONFIGURED: 'The roaster is offline',
};

function toFriendlyError(err: unknown, fallbackTitle: string, fallbackMessage: string): FriendlyError {
  const code = getErrorCode(err);
  const status = getErrorStatus(err);
  let title = (code && ERROR_TITLES[code]) || fallbackTitle;
  if (!code && status === 429) title = 'Too many requests';
  return { title, message: getErrorMessage(err, fallbackMessage) };
}

/** Roast a public GitHub commit: paste a link, pick a heat level, see the roast right here. */
export default function GithubRoastPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const quota = useRoastQuota();
  const createSubmission = useCreateGithubCommitSubmission();
  const createRoast = useCreateRoast();
  const moreOptions = useDisclosure({ defaultIsOpen: false });
  const resultRef = useRef<HTMLDivElement>(null);

  const [commitUrl, setCommitUrl] = useState<string>('');
  const [fields, setFields] = useState<SubmissionFieldValues>(INITIAL_FIELDS);
  const [autoLanguage, setAutoLanguage] = useState<boolean>(true);
  const [intensity, setIntensity] = useState<RoastIntensity>(user?.default_intensity ?? 'medium');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<FriendlyError | null>(null);
  const [roastError, setRoastError] = useState<FriendlyError | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [roast, setRoast] = useState<Roast | null>(null);

  const busy = phase === 'saving' || phase === 'roasting';
  const remaining = quota.data?.remaining;
  const outOfRoasts = remaining !== undefined && remaining <= 0;

  // Bring the result into view once the roast starts / finishes.
  useEffect(() => {
    if (phase === 'roasting' || phase === 'done') {
      resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [phase]);

  const handleFieldChange = <K extends keyof SubmissionFieldValues>(
    field: K,
    value: SubmissionFieldValues[K],
  ): void => {
    setFields((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const runRoast = async (target: SubmissionDetail, heat: RoastIntensity): Promise<void> => {
    setPhase('roasting');
    setRoastError(null);
    try {
      const created = await createRoast.mutateAsync({ submissionId: target.id, intensity: heat });
      setRoast(created);
    } catch (err) {
      setRoastError(
        toFriendlyError(err, 'Could not roast this commit', 'Could not roast this commit.'),
      );
    }
    setPhase('done');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setSubmitError(null);
    const nextErrors: FormErrors = validateSubmissionFields(fields, { titleOptional: true });
    const urlError = validateCommitUrl(commitUrl);
    if (urlError) nextErrors.commitUrl = urlError;
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      if (nextErrors.title || nextErrors.brief) moreOptions.onOpen();
      return;
    }

    setPhase('saving');
    setSubmission(null);
    setRoast(null);
    setRoastError(null);
    const title = fields.title.trim();
    const brief = fields.brief.trim();
    let created: SubmissionDetail;
    try {
      created = await createSubmission.mutateAsync({
        commit_url: commitUrl.trim(),
        ...(title ? { title } : {}),
        ...(brief ? { assignment_brief: brief } : {}),
        language: autoLanguage ? null : fields.language,
      });
    } catch (err) {
      const friendly = toFriendlyError(
        err,
        'Could not fetch that commit',
        'Could not fetch that commit.',
      );
      if (getErrorCode(err) === 'INVALID_GITHUB_URL') {
        setErrors((prev) => ({ ...prev, commitUrl: friendly.message }));
      }
      setSubmitError(friendly);
      setPhase('idle');
      return;
    }
    setSubmission(created);
    await runRoast(created, intensity);
  };

  const handleReset = (): void => {
    setCommitUrl('');
    setFields(INITIAL_FIELDS);
    setAutoLanguage(true);
    setErrors({});
    setSubmitError(null);
    setRoastError(null);
    setSubmission(null);
    setRoast(null);
    setPhase('idle');
    moreOptions.onClose();
  };

  const sourceUrl = submission?.source_url ?? null;
  const roastFailed = roast?.status === 'failed';

  return (
    <PageWrapper maxW="container.lg">
      <Stack spacing={2} mb={6}>
        <TextReveal text="Commit-a kudu, roast pannrom 🔥" as="h1" size="xl" />
        <Text color="text.muted">
          Paste a public GitHub commit link — we roast the diff and the commit message in Tanglish.
        </Text>
      </Stack>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label="Roast a GitHub commit">
        <Stack spacing={6}>
          <GlassCard hoverable={false}>
            <Stack spacing={5}>
              <AnimatedInput
                id="commit-url"
                name="commit_url"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                label="Commit link"
                placeholder="https://github.com/owner/repo/commit/abc1234"
                value={commitUrl}
                onChange={(e) => {
                  const next = e.target.value;
                  setCommitUrl(next);
                  if (errors.commitUrl && !validateCommitUrl(next)) {
                    setErrors((prev) => ({ ...prev, commitUrl: undefined }));
                  }
                }}
                onBlur={() => {
                  if (commitUrl.trim()) {
                    setErrors((prev) => ({ ...prev, commitUrl: validateCommitUrl(commitUrl) }));
                  }
                }}
                error={errors.commitUrl}
                helperText="Public repositories only. We roast the diff and the commit message."
                isRequired
                isDisabled={busy}
                maxLength={500}
              />

              <Box>
                <ActionButton
                  size="sm"
                  variant="ghost"
                  rightIcon={moreOptions.isOpen ? <FiChevronUp /> : <FiChevronDown />}
                  onClick={moreOptions.onToggle}
                  aria-expanded={moreOptions.isOpen}
                  aria-controls="github-more-options"
                >
                  More options
                </ActionButton>
                <Collapse in={moreOptions.isOpen} animateOpacity unmountOnExit={false}>
                  <Box id="github-more-options" pt={4}>
                    <SubmissionFields
                      values={fields}
                      errors={errors}
                      onChange={handleFieldChange}
                      isDisabled={busy}
                      titleOptional
                      titlePlaceholder="Defaults to the commit message"
                      autoDetect={{ selected: autoLanguage, onSelect: setAutoLanguage }}
                    />
                  </Box>
                </Collapse>
              </Box>
            </Stack>
          </GlassCard>

          <GlassCard hoverable={false}>
            <Stack spacing={4}>
              <HStack justify="space-between" align="baseline" flexWrap="wrap">
                <Heading as="h2" size="sm">
                  Heat level
                </Heading>
                {quota.data && (
                  <Text fontSize="sm" color="text.muted" data-testid="quota">
                    {quota.data.remaining} of {quota.data.limit} roasts left today
                  </Text>
                )}
              </HStack>
              <IntensityPicker
                value={intensity}
                onChange={setIntensity}
                isDisabled={busy}
                name="github-intensity"
              />
            </Stack>
          </GlassCard>

          {outOfRoasts && (
            <Alert status="warning" borderRadius="xl">
              <AlertIcon />
              <AlertDescription>
                You&apos;ve used all your roasts for today. The commit will still be saved so you can
                roast it tomorrow.
              </AlertDescription>
            </Alert>
          )}

          {submitError && (
            <Alert status="error" borderRadius="xl" role="alert" alignItems="flex-start">
              <AlertIcon />
              <Box>
                <AlertTitle>{submitError.title}</AlertTitle>
                <AlertDescription>{submitError.message}</AlertDescription>
              </Box>
            </Alert>
          )}

          <HStack justify="flex-end">
            <GradientButton
              type="submit"
              size="lg"
              leftIcon={<FaGithub />}
              isLoading={busy}
              loadingText={phase === 'saving' ? 'Fetching commit…' : 'Roasting…'}
            >
              Roast this commit 🔥
            </GradientButton>
          </HStack>
        </Stack>
      </form>

      {(phase === 'roasting' || phase === 'done') && submission && (
        <Box ref={resultRef} mt={8} scrollMarginTop={20}>
          <GlassCard hoverable={false} aria-label="Roast result" role="region">
            <Flex justify="space-between" align="center" mb={4} gap={3} flexWrap="wrap">
              <Stack spacing={1} minW={0}>
                <Heading as="h2" size="md" wordBreak="break-word">
                  {submission.title}
                </Heading>
                {sourceUrl && (
                  <Link
                    href={sourceUrl}
                    isExternal
                    target="_blank"
                    rel="noopener noreferrer"
                    display="inline-flex"
                    alignItems="center"
                    gap={1}
                    fontSize="sm"
                    fontFamily="mono"
                    color="brand.400"
                    aria-label={`View commit ${shortCommitLabel(sourceUrl)} on GitHub`}
                  >
                    <FaGithub aria-hidden="true" />
                    {shortCommitLabel(sourceUrl)}
                  </Link>
                )}
              </Stack>
              {roast && roast.status === 'completed' && <ShareButton roast={roast} />}
            </Flex>

            {phase === 'roasting' ? (
              <RoastLoading />
            ) : roastError ? (
              <Alert status="error" borderRadius="xl" role="alert" alignItems="flex-start">
                <AlertIcon />
                <Box>
                  <AlertTitle>{roastError.title}</AlertTitle>
                  <AlertDescription>
                    {roastError.message} The commit was saved — you can roast it again from its
                    details page.
                  </AlertDescription>
                </Box>
              </Alert>
            ) : roast && roastFailed ? (
              <Alert
                status="error"
                variant="subtle"
                borderRadius="xl"
                flexDirection="column"
                alignItems="flex-start"
                gap={3}
                py={5}
                role="alert"
              >
                <HStack>
                  <AlertIcon />
                  <AlertTitle>The roast fell off the grill</AlertTitle>
                </HStack>
                <AlertDescription>
                  {roast.error_message ?? 'Something went wrong while roasting. Please try again.'}
                </AlertDescription>
                <ActionButton
                  leftIcon={<FiRefreshCw />}
                  colorScheme="red"
                  variant="outline"
                  size="sm"
                  onClick={() => void runRoast(submission, roast.intensity)}
                >
                  Retry
                </ActionButton>
              </Alert>
            ) : roast ? (
              <RoastView roast={roast} />
            ) : null}

            {phase === 'done' && (
              <HStack justify="flex-end" spacing={3} mt={6} flexWrap="wrap">
                <ActionButton
                  variant="ghost"
                  leftIcon={<FiRotateCcw />}
                  onClick={handleReset}
                >
                  Roast another commit
                </ActionButton>
                <GradientButton
                  rightIcon={<FiArrowRight />}
                  onClick={() => navigate(`/submissions/${submission.id}`)}
                >
                  View full details
                </GradientButton>
              </HStack>
            )}
          </GlassCard>
        </Box>
      )}
    </PageWrapper>
  );
}
