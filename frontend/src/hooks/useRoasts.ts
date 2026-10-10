import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import * as roastService from '../services/roastService';
import type { Roast, RoastIntensity, RoastQuota, SubmissionDetail } from '../types';
import { submissionKeys } from './useSubmissions';

/** Same prefix as shareKeys.all (not imported: useShareLinks depends on this module). */
const SHARE_LINKS_KEY = ['share-links'] as const;

export const roastKeys = {
  all: ['roasts'] as const,
  quota: () => [...roastKeys.all, 'quota'] as const,
  forSubmission: (submissionId: number) =>
    [...roastKeys.all, 'submission', submissionId] as const,
  details: () => [...roastKeys.all, 'detail'] as const,
  detail: (id: number) => [...roastKeys.details(), id] as const,
};

/** Today's roast quota for the current user. */
export function useRoastQuota(): UseQueryResult<RoastQuota> {
  return useQuery({
    queryKey: roastKeys.quota(),
    queryFn: roastService.getQuota,
    staleTime: 30_000,
  });
}

/** All roasts of a submission (newest first). */
export function useSubmissionRoasts(submissionId: number | undefined): UseQueryResult<Roast[]> {
  const valid = submissionId !== undefined && submissionId > 0;
  return useQuery({
    queryKey: roastKeys.forSubmission(valid ? submissionId : 0),
    queryFn: () => roastService.listForSubmission(submissionId as number),
    enabled: valid,
  });
}

/** A single roast by id. */
export function useRoast(id: number | undefined): UseQueryResult<Roast> {
  const valid = id !== undefined && id > 0;
  return useQuery({
    queryKey: roastKeys.detail(valid ? id : 0),
    queryFn: () => roastService.get(id as number),
    enabled: valid,
  });
}

export interface CreateRoastVariables {
  submissionId: number;
  intensity?: RoastIntensity;
}

/**
 * Generate a roast (synchronous on the server). On success the new roast is prepended to the
 * cached submission detail; quota and lists are refreshed either way (failed attempts count).
 */
export function useCreateRoast(): UseMutationResult<Roast, unknown, CreateRoastVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, intensity }: CreateRoastVariables) =>
      roastService.create(submissionId, intensity ? { intensity } : {}),
    onSuccess: (roast) => {
      queryClient.setQueryData<SubmissionDetail>(
        submissionKeys.detail(roast.submission_id),
        (prev) =>
          prev
            ? { ...prev, roasts: [roast, ...prev.roasts.filter((r) => r.id !== roast.id)] }
            : prev,
      );
      queryClient.setQueryData(roastKeys.detail(roast.id), roast);
    },
    onSettled: (_data, _error, { submissionId }) => {
      void queryClient.invalidateQueries({ queryKey: roastKeys.quota() });
      void queryClient.invalidateQueries({ queryKey: roastKeys.forSubmission(submissionId) });
      void queryClient.invalidateQueries({ queryKey: submissionKeys.detail(submissionId) });
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() });
    },
  });
}

export interface DeleteRoastVariables {
  id: number;
  submissionId: number;
}

export function useDeleteRoast(): UseMutationResult<void, unknown, DeleteRoastVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteRoastVariables) => roastService.remove(id),
    onSuccess: (_data, { id, submissionId }) => {
      queryClient.removeQueries({ queryKey: roastKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: roastKeys.forSubmission(submissionId) });
      void queryClient.invalidateQueries({ queryKey: submissionKeys.detail(submissionId) });
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() });
      // The roast's share link is deleted with it; quota/usage may change too.
      void queryClient.invalidateQueries({ queryKey: SHARE_LINKS_KEY });
      void queryClient.invalidateQueries({ queryKey: roastKeys.quota() });
    },
  });
}
