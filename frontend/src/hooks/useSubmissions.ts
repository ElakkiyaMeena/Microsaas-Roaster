import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import * as submissionService from '../services/submissionService';
import { DEFAULT_PER_PAGE } from '../services/submissionService';
import { getErrorStatus } from '../lib/errors';
import { hasActivePendingRoast, PENDING_POLL_INTERVAL_MS } from '../lib/roastStatus';
import type {
  CreateGithubCommitPayload,
  CreateGithubPayload,
  CreateSubmissionPayload,
  Paginated,
  SubmissionDetail,
  SubmissionListItem,
  UpdateSubmissionPayload,
  UploadSubmissionPayload,
} from '../types';
import { roastKeys } from './useRoasts';

export const submissionKeys = {
  all: ['submissions'] as const,
  lists: () => [...submissionKeys.all, 'list'] as const,
  list: (page: number, perPage: number) =>
    [...submissionKeys.lists(), { page, perPage }] as const,
  details: () => [...submissionKeys.all, 'detail'] as const,
  detail: (id: number) => [...submissionKeys.details(), id] as const,
};

/** Same prefix as shareKeys.all (not imported: useShareLinks depends on this module). */
const SHARE_LINKS_KEY = ['share-links'] as const;

/** Retry once, but never on 4xx (e.g. 404 for someone else's submission). */
function retryUnlessClientError(failureCount: number, error: Error): boolean {
  const status = getErrorStatus(error);
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

/** Paginated list of the current user's submissions (newest first). */
export function useSubmissions(
  page: number = 1,
  perPage: number = DEFAULT_PER_PAGE,
): UseQueryResult<Paginated<SubmissionListItem>> {
  return useQuery({
    queryKey: submissionKeys.list(page, perPage),
    queryFn: () => submissionService.list(page, perPage),
    placeholderData: keepPreviousData,
  });
}

/**
 * A single submission with files and roasts (newest first). Disabled for invalid ids.
 * While a roast is `pending` (and not yet timed out) the detail is polled every 5s.
 */
export function useSubmission(id: number | undefined): UseQueryResult<SubmissionDetail> {
  const valid = id !== undefined && Number.isInteger(id) && id > 0;
  return useQuery({
    queryKey: submissionKeys.detail(valid ? id : 0),
    queryFn: () => submissionService.get(id as number),
    enabled: valid,
    retry: retryUnlessClientError,
    refetchInterval: (query) =>
      hasActivePendingRoast(query.state.data) ? PENDING_POLL_INTERVAL_MS : false,
  });
}

export function useCreatePasteSubmission(): UseMutationResult<
  SubmissionDetail,
  unknown,
  CreateSubmissionPayload
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSubmissionPayload) => submissionService.createPaste(payload),
    onSuccess: (created) => {
      queryClient.setQueryData(submissionKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() });
    },
  });
}

/** Create a submission from a public GitHub commit URL. */
export function useCreateGithubCommitSubmission(): UseMutationResult<
  SubmissionDetail,
  unknown,
  CreateGithubCommitPayload
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateGithubCommitPayload) =>
      submissionService.createFromGithubCommit(payload),
    onSuccess: (created) => {
      queryClient.setQueryData(submissionKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() });
    },
  });
}

/** Create a submission from a public GitHub repository or commit URL (auto-detected). */
export function useCreateGithubSubmission(): UseMutationResult<
  SubmissionDetail,
  unknown,
  CreateGithubPayload
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateGithubPayload) => submissionService.createFromGithub(payload),
    onSuccess: (created) => {
      queryClient.setQueryData(submissionKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() });
    },
  });
}

export interface UploadVariables {
  payload: UploadSubmissionPayload;
  onUploadProgress?: (percent: number) => void;
}

export function useUploadSubmission(): UseMutationResult<
  SubmissionDetail,
  unknown,
  UploadVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, onUploadProgress }: UploadVariables) =>
      submissionService.upload(payload, { onUploadProgress }),
    onSuccess: (created) => {
      queryClient.setQueryData(submissionKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() });
    },
  });
}

export interface UpdateVariables {
  id: number;
  payload: UpdateSubmissionPayload;
}

export function useUpdateSubmission(): UseMutationResult<
  SubmissionDetail,
  unknown,
  UpdateVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: UpdateVariables) => submissionService.update(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(submissionKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() });
    },
  });
}

export function useDeleteSubmission(): UseMutationResult<void, unknown, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => submissionService.remove(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: submissionKeys.detail(id) });
      queryClient.removeQueries({ queryKey: roastKeys.forSubmission(id) });
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() });
      // Share links of the deleted roasts are gone (cascade); quota/usage may change too.
      void queryClient.invalidateQueries({ queryKey: SHARE_LINKS_KEY });
      void queryClient.invalidateQueries({ queryKey: roastKeys.quota() });
    },
  });
}
