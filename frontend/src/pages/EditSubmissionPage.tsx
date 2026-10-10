import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Heading,
  HStack,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { CodeViewer } from '../components/roast/CodeViewer';
import { ActionButton } from '../components/submissions/ActionButton';
import { CodeTextarea } from '../components/submissions/CodeTextarea';
import { SubmissionFields } from '../components/submissions/SubmissionFields';
import { SubmissionNotFound } from '../components/submissions/SubmissionNotFound';
import {
  validateCode,
  validateSubmissionFields,
  type SubmissionFieldErrors,
  type SubmissionFieldValues,
} from '../components/submissions/formValidation';
import { useSubmission, useUpdateSubmission } from '../hooks/useSubmissions';
import { getErrorMessage, getErrorStatus } from '../lib/errors';
import type { SubmissionDetail, UpdateSubmissionPayload } from '../types';

interface EditErrors extends SubmissionFieldErrors {
  code?: string;
}

function parseId(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

interface EditFormProps {
  submission: SubmissionDetail;
}

function EditForm({ submission }: EditFormProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const update = useUpdateSubmission();
  const isPaste = submission.source_type === 'paste';

  const [fields, setFields] = useState<SubmissionFieldValues>({
    title: submission.title,
    language: submission.language,
    brief: submission.assignment_brief ?? '',
  });
  const [code, setCode] = useState<string>(submission.code_content);
  const [errors, setErrors] = useState<EditErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFieldChange = <K extends keyof SubmissionFieldValues>(
    field: K,
    value: SubmissionFieldValues[K],
  ): void => {
    setFields((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitError(null);
    const nextErrors: EditErrors = validateSubmissionFields(fields);
    if (isPaste) {
      const codeError = validateCode(code);
      if (codeError) nextErrors.code = codeError;
    }
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const payload: UpdateSubmissionPayload = {
      title: fields.title.trim(),
      language: fields.language,
      assignment_brief: fields.brief.trim() || null,
    };
    if (isPaste && code !== submission.code_content) payload.code_content = code;

    try {
      await update.mutateAsync({ id: submission.id, payload });
      toast({ status: 'success', title: 'Submission updated' });
      navigate(`/submissions/${submission.id}`);
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Could not save your changes.'));
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label="Edit submission">
      <Stack spacing={6}>
        <GlassCard hoverable={false}>
          <SubmissionFields
            values={fields}
            errors={errors}
            onChange={handleFieldChange}
            isDisabled={update.isPending}
          />
        </GlassCard>

        <GlassCard hoverable={false}>
          {isPaste ? (
            <CodeTextarea
              value={code}
              onChange={(v) => {
                setCode(v);
                if (errors.code) setErrors((prev) => ({ ...prev, code: undefined }));
              }}
              error={errors.code}
              isDisabled={update.isPending}
            />
          ) : (
            <Stack spacing={3}>
              <Heading as="h2" size="sm">
                Code
              </Heading>
              <Text fontSize="sm" color="text.muted">
                Code from uploaded files can&apos;t be edited. Create a new submission to roast a
                different version.
              </Text>
              <CodeViewer code={submission.code_content} language={fields.language} />
            </Stack>
          )}
        </GlassCard>

        {submitError && (
          <Alert status="error" borderRadius="xl" role="alert">
            <AlertIcon />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <HStack justify="flex-end" spacing={3}>
          <ActionButton
            variant="ghost"
            onClick={() => navigate(`/submissions/${submission.id}`)}
            isDisabled={update.isPending}
          >
            Cancel
          </ActionButton>
          <GradientButton type="submit" isLoading={update.isPending} loadingText="Saving…">
            Save changes
          </GradientButton>
        </HStack>
      </Stack>
    </form>
  );
}

/** Edit a submission's title, brief and language (and code for pasted submissions). */
export default function EditSubmissionPage() {
  const params = useParams<{ id: string }>();
  const id = parseId(params.id);
  const { data: submission, isLoading, isError, error, refetch } = useSubmission(id);

  if (id !== undefined && isLoading) {
    return <LoadingScreen label="Fetching your submission…" />;
  }

  const notFound = id === undefined || (isError && getErrorStatus(error) === 404);

  return (
    <PageWrapper maxW="container.lg">
      {notFound ? (
        <SubmissionNotFound />
      ) : isError || !submission ? (
        <Alert status="error" borderRadius="xl">
          <AlertIcon />
          <AlertDescription flex="1">
            {getErrorMessage(error, 'Could not load this submission.')}
          </AlertDescription>
          <ActionButton size="sm" onClick={() => void refetch()}>
            Retry
          </ActionButton>
        </Alert>
      ) : (
        <>
          <Stack spacing={1} mb={6}>
            <Heading size="lg">Edit submission</Heading>
            <Text color="text.muted" noOfLines={1}>
              {submission.title}
            </Text>
          </Stack>
          <EditForm key={submission.id} submission={submission} />
        </>
      )}
    </PageWrapper>
  );
}
