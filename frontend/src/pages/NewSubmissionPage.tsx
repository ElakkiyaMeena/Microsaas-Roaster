import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Heading,
  HStack,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useToast,
} from '@chakra-ui/react';
import { FiClipboard, FiUploadCloud } from 'react-icons/fi';
import { PageWrapper } from '../components/layout/PageWrapper';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { CodeDropzone } from '../components/submissions/CodeDropzone';
import { CodeTextarea } from '../components/submissions/CodeTextarea';
import { SubmissionFields } from '../components/submissions/SubmissionFields';
import {
  validateCode,
  validateSubmissionFields,
  type SubmissionFieldErrors,
  type SubmissionFieldValues,
} from '../components/submissions/formValidation';
import { IntensityPicker } from '../components/roast/IntensityPicker';
import { RoastLoading } from '../components/roast/RoastLoading';
import { useAuth } from '../hooks/useAuth';
import { useCreateRoast, useRoastQuota } from '../hooks/useRoasts';
import { useCreatePasteSubmission, useUploadSubmission } from '../hooks/useSubmissions';
import { getErrorCode, getErrorMessage, getErrorStatus } from '../lib/errors';
import type { RoastIntensity, SubmissionDetail } from '../types';

type Mode = 'paste' | 'upload';
type Phase = 'idle' | 'saving' | 'roasting';

interface FormErrors extends SubmissionFieldErrors {
  code?: string;
  files?: string;
}

const MODES: readonly Mode[] = ['paste', 'upload'];

/** Create a submission (paste or upload) and immediately roast it. */
export default function NewSubmissionPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const quota = useRoastQuota();
  const createPaste = useCreatePasteSubmission();
  const uploadSubmission = useUploadSubmission();
  const createRoast = useCreateRoast();

  const [fields, setFields] = useState<SubmissionFieldValues>({
    title: '',
    language: 'python',
    brief: '',
  });
  const [mode, setMode] = useState<Mode>('paste');
  const [code, setCode] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [intensity, setIntensity] = useState<RoastIntensity>(user?.default_intensity ?? 'medium');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<number | null>(null);

  const busy = phase !== 'idle';

  const handleFieldChange = <K extends keyof SubmissionFieldValues>(
    field: K,
    value: SubmissionFieldValues[K],
  ): void => {
    setFields((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): FormErrors => {
    const next: FormErrors = validateSubmissionFields(fields);
    if (mode === 'paste') {
      const codeError = validateCode(code);
      if (codeError) next.code = codeError;
    } else if (files.length === 0) {
      next.files = 'Select at least one file (or a .zip).';
    }
    return next;
  };

  const createSubmission = (): Promise<SubmissionDetail> => {
    const brief = fields.brief.trim() || null;
    const title = fields.title.trim();
    if (mode === 'paste') {
      return createPaste.mutateAsync({
        title,
        language: fields.language,
        assignment_brief: brief,
        code_content: code,
      });
    }
    setProgress(0);
    return uploadSubmission.mutateAsync({
      payload: { title, language: fields.language, assignment_brief: brief, files },
      onUploadProgress: setProgress,
    });
  };

  const roastAndGo = async (submission: SubmissionDetail): Promise<void> => {
    setPhase('roasting');
    try {
      const roast = await createRoast.mutateAsync({ submissionId: submission.id, intensity });
      if (roast.status === 'failed') {
        toast({
          status: 'warning',
          title: 'The roast fell off the grill',
          description: roast.error_message ?? 'Roast failed. You can retry from the submission page.',
        });
      }
    } catch (err) {
      const code = getErrorCode(err);
      const status = getErrorStatus(err);
      if (code === 'ROAST_LIMIT_REACHED' || status === 429) {
        toast({
          status: 'warning',
          title: 'Daily roast limit reached',
          description: `${getErrorMessage(err)} Your submission was saved — roast it tomorrow.`,
          duration: 8000,
          isClosable: true,
        });
      } else if (code === 'AI_NOT_CONFIGURED' || status === 503) {
        toast({
          status: 'warning',
          title: 'The roaster is offline',
          description: `${getErrorMessage(err)} Your submission was saved.`,
          duration: 8000,
          isClosable: true,
        });
      } else {
        toast({
          status: 'error',
          title: 'Could not roast your code',
          description: `${getErrorMessage(err)} Your submission was saved; you can retry.`,
          duration: 8000,
          isClosable: true,
        });
      }
    }
    navigate(`/submissions/${submission.id}`);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setSubmitError(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setPhase('saving');
    let submission: SubmissionDetail;
    try {
      submission = await createSubmission();
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Could not save your submission.'));
      setPhase('idle');
      setProgress(null);
      return;
    }
    await roastAndGo(submission);
  };

  const remaining = quota.data?.remaining;
  const outOfRoasts = remaining !== undefined && remaining <= 0;

  return (
    <PageWrapper maxW="container.lg">
      <Stack spacing={2} mb={6}>
        <Heading size="lg">New roast 🔥</Heading>
        <Text color="text.muted">
          Paste your code or upload files, pick a heat level, and let the roaster do its thing.
        </Text>
      </Stack>

      {phase === 'roasting' ? (
        <GlassCard hoverable={false}>
          <RoastLoading />
        </GlassCard>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label="New submission">
          <Stack spacing={6}>
            <GlassCard hoverable={false}>
              <SubmissionFields
                values={fields}
                errors={errors}
                onChange={handleFieldChange}
                isDisabled={busy}
              />
            </GlassCard>

            <GlassCard hoverable={false}>
              <Tabs
                variant="soft-rounded"
                colorScheme="orange"
                index={MODES.indexOf(mode)}
                onChange={(i) => setMode(MODES[i] ?? 'paste')}
                isLazy={false}
              >
                <TabList mb={4} gap={2}>
                  <Tab isDisabled={busy} gap={2}>
                    <FiClipboard aria-hidden="true" /> Paste code
                  </Tab>
                  <Tab isDisabled={busy} gap={2}>
                    <FiUploadCloud aria-hidden="true" /> Upload files
                  </Tab>
                </TabList>
                <TabPanels>
                  <TabPanel p={0}>
                    <CodeTextarea
                      value={code}
                      onChange={(v) => {
                        setCode(v);
                        if (errors.code) setErrors((prev) => ({ ...prev, code: undefined }));
                      }}
                      error={errors.code}
                      isDisabled={busy}
                    />
                  </TabPanel>
                  <TabPanel p={0}>
                    <CodeDropzone
                      files={files}
                      onChange={(next) => {
                        setFiles(next);
                        if (errors.files) setErrors((prev) => ({ ...prev, files: undefined }));
                      }}
                      isDisabled={busy}
                      progress={phase === 'saving' && mode === 'upload' ? progress : null}
                      error={errors.files}
                    />
                  </TabPanel>
                </TabPanels>
              </Tabs>
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
                <IntensityPicker value={intensity} onChange={setIntensity} isDisabled={busy} />
              </Stack>
            </GlassCard>

            {outOfRoasts && (
              <Alert status="warning" borderRadius="xl">
                <AlertIcon />
                <AlertDescription>
                  You&apos;ve used all your roasts for today. Your submission will be saved and you can
                  roast it tomorrow.
                </AlertDescription>
              </Alert>
            )}

            {submitError && (
              <Alert status="error" borderRadius="xl" role="alert">
                <AlertIcon />
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <HStack justify="flex-end">
              <GradientButton
                type="submit"
                size="lg"
                isLoading={busy}
                loadingText={mode === 'upload' ? 'Uploading…' : 'Saving…'}
              >
                Roast it 🔥
              </GradientButton>
            </HStack>
          </Stack>
        </form>
      )}
    </PageWrapper>
  );
}
