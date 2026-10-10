import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import shareService from '../services/shareService';
import { getErrorStatus } from '../lib/errors';
import { submissionKeys } from './useSubmissions';
import { roastKeys } from './useRoasts';
import type {
  CreateSharePayload,
  PublicRoast,
  ShareLink,
  ShareLinkListItem,
  UpdateSharePayload,
} from '../types';

/** React Query keys for the sharing module. */
export const shareKeys = {
  all: ['share-links'] as const,
  mine: () => [...shareKeys.all, 'mine'] as const,
  public: (slug: string) => ['public-roast', slug] as const,
};

/**
 * Query prefixes owned by other modules that embed share-link data
 * (submission detail embeds roasts -> roast.share_link). Prefix invalidation
 * covers every key that starts with these segments.
 */
const DEPENDENT_PREFIXES: ReadonlyArray<readonly unknown[]> = [submissionKeys.all, roastKeys.all];

async function invalidateShareData(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: shareKeys.all }),
    ...DEPENDENT_PREFIXES.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ]);
}

/** Current user's share links (GET /share-links). */
export function useMyShareLinks(): UseQueryResult<ShareLinkListItem[], Error> {
  return useQuery({ queryKey: shareKeys.mine(), queryFn: shareService.listMine });
}

/** Public roast by slug (no auth). 404s are not retried. */
export function usePublicRoast(slug: string | undefined): UseQueryResult<PublicRoast, Error> {
  return useQuery({
    queryKey: shareKeys.public(slug ?? ''),
    queryFn: () => shareService.getPublic(slug ?? ''),
    enabled: Boolean(slug),
    // view_count increments on every fetch; avoid refetch storms.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      const status = getErrorStatus(error);
      if (status !== undefined && status >= 400 && status < 500) return false;
      return failureCount < 1;
    },
  });
}

export interface CreateShareVariables {
  roastId: number;
  payload: CreateSharePayload;
}

export function useCreateShareLink(): UseMutationResult<ShareLink, Error, CreateShareVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roastId, payload }: CreateShareVariables) =>
      shareService.createForRoast(roastId, payload),
    onSuccess: () => invalidateShareData(queryClient),
  });
}

export interface UpdateShareVariables {
  id: number;
  payload: UpdateSharePayload;
}

export function useUpdateShareLink(): UseMutationResult<ShareLink, Error, UpdateShareVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: UpdateShareVariables) => shareService.update(id, payload),
    onSuccess: () => invalidateShareData(queryClient),
  });
}

export function useDeleteShareLink(): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => shareService.remove(id),
    onSuccess: () => invalidateShareData(queryClient),
  });
}
