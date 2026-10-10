import type { Roast, SubmissionDetail } from '../types';

/** A roast still `pending` after this long is treated as timed out (the request died). */
export const PENDING_TIMEOUT_MS = 3 * 60 * 1000;

/** How often a submission with a fresh pending roast is re-fetched. */
export const PENDING_POLL_INTERVAL_MS = 5000;

const HAS_TIMEZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Parse a server timestamp; naive ISO strings (no offset) are treated as UTC. */
export function parseServerDate(iso: string): number {
  const value = HAS_TIMEZONE.test(iso.trim()) ? iso : `${iso}Z`;
  return Date.parse(value);
}

/** True for a pending roast older than {@link PENDING_TIMEOUT_MS}. */
export function isRoastTimedOut(roast: Pick<Roast, 'status' | 'created_at'>, now: number = Date.now()): boolean {
  if (roast.status !== 'pending') return false;
  const created = parseServerDate(roast.created_at);
  if (Number.isNaN(created)) return false;
  return now - created > PENDING_TIMEOUT_MS;
}

/** True when the submission has a pending roast that has not timed out yet (worth polling). */
export function hasActivePendingRoast(
  submission: Pick<SubmissionDetail, 'roasts'> | undefined,
  now: number = Date.now(),
): boolean {
  if (!submission) return false;
  return submission.roasts.some((r) => r.status === 'pending' && !isRoastTimedOut(r, now));
}
