import type { IssueSeverity } from '../../types';

export type ScoreColorScheme = 'red' | 'orange' | 'green' | 'gray';

/** Color scheme for a 0–100 score: <50 red, <75 orange, else green (gray when missing). */
export function getScoreColorScheme(score: number | null | undefined): ScoreColorScheme {
  if (score === null || score === undefined) return 'gray';
  if (score < 50) return 'red';
  if (score < 75) return 'orange';
  return 'green';
}

export const SEVERITY_ORDER: readonly IssueSeverity[] = ['high', 'medium', 'low'];

export const SEVERITY_META: Record<IssueSeverity, { label: string; colorScheme: string }> = {
  high: { label: 'High severity', colorScheme: 'red' },
  medium: { label: 'Medium severity', colorScheme: 'orange' },
  low: { label: 'Low severity', colorScheme: 'yellow' },
};

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
