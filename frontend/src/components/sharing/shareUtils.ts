import type { ShareLink } from '../../types';

export type ExpiryOption = 'never' | '7' | '30';

export const EXPIRY_OPTIONS: ReadonlyArray<{ value: ExpiryOption; label: string }> = [
  { value: 'never', label: 'Never expires' },
  { value: '7', label: 'Expires in 7 days' },
  { value: '30', label: 'Expires in 30 days' },
];

/** Convert an expiry option to an ISO timestamp (null = never). */
export function expiryToIso(option: ExpiryOption, now: Date = new Date()): string | null {
  if (option === 'never') return null;
  const days = Number(option);
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function isExpired(link: Pick<ShareLink, 'expires_at'>, now: Date = new Date()): boolean {
  return link.expires_at !== null && new Date(link.expires_at).getTime() <= now.getTime();
}

/** A link is "live" when active and not expired. */
export function isLinkLive(link: ShareLink | null | undefined): link is ShareLink {
  return Boolean(link && link.is_active && !isExpired(link));
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Copy text to the clipboard. Uses the async Clipboard API when available, otherwise
 * falls back to selecting the given input and `document.execCommand('copy')`.
 * Returns true on success.
 */
export async function copyToClipboard(
  text: string,
  fallbackInput?: HTMLInputElement | null,
): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy fallback
  }
  try {
    if (fallbackInput) {
      fallbackInput.focus();
      fallbackInput.select();
      return document.execCommand('copy');
    }
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    document.body.appendChild(temp);
    temp.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(temp);
    return ok;
  } catch {
    return false;
  }
}
