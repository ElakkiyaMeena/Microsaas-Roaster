import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import * as submissionService from '../services/submissionService';
import * as roastService from '../services/roastService';
import type { Paginated, RoastQuota, SubmissionListItem } from '../types';
import { submissionKeys } from './useSubmissions';
import { roastKeys } from './useRoasts';

const RECENT_PAGE = 1;
const RECENT_PER_PAGE = 5;

/** The five most recent submissions of the current user (same cache key as useSubmissions(1, 5)). */
export function useRecentSubmissions(): UseQueryResult<Paginated<SubmissionListItem>> {
  return useQuery({
    queryKey: submissionKeys.list(RECENT_PAGE, RECENT_PER_PAGE),
    queryFn: () => submissionService.list(RECENT_PAGE, RECENT_PER_PAGE),
  });
}

/** Today's roast quota (same cache key as useRoastQuota). */
export function useQuota(): UseQueryResult<RoastQuota> {
  return useQuery({
    queryKey: roastKeys.quota(),
    queryFn: roastService.getQuota,
    staleTime: 30_000,
  });
}
