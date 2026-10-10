/**
 * Client-side helpers for GitHub commit URLs. This is pre-validation only; the backend
 * re-validates and canonicalises the URL.
 */

export interface GithubCommitRef {
  owner: string;
  repo: string;
  sha: string;
}

const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})';
const REPO = '[A-Za-z0-9._-]{1,100}';
const SHA = '[0-9a-fA-F]{7,40}';
const TAIL = '(?:/)?(?:[?#].*)?';

/** `https://github.com/{owner}/{repo}/commit/{sha}` */
const COMMIT_RE = new RegExp(`^https://(?:www\\.)?github\\.com/(${OWNER})/(${REPO})/commit/(${SHA})${TAIL}$`);
/** `https://github.com/{owner}/{repo}/pull/{n}/commits/{sha}` */
const PR_COMMIT_RE = new RegExp(
  `^https://(?:www\\.)?github\\.com/(${OWNER})/(${REPO})/pull/\\d+/commits/(${SHA})${TAIL}$`,
);

/** Parse a GitHub commit URL into owner / repo / sha, or null when it is not one. */
export function parseGithubCommitUrl(url: string): GithubCommitRef | null {
  const trimmed = url.trim();
  const match = COMMIT_RE.exec(trimmed) ?? PR_COMMIT_RE.exec(trimmed);
  if (!match) return null;
  const [, owner, repo, sha] = match;
  if (repo === '.' || repo === '..') return null;
  return { owner, repo, sha: sha.toLowerCase() };
}

/** True when `url` looks like a public GitHub commit URL (commit page or PR commit page). */
export function isGithubCommitUrl(url: string): boolean {
  return parseGithubCommitUrl(url) !== null;
}

/** Short label like "owner/repo@abc1234"; falls back to the raw URL when it can't be parsed. */
export function shortCommitLabel(url: string): string {
  const ref = parseGithubCommitUrl(url);
  if (!ref) return url;
  return `${ref.owner}/${ref.repo}@${ref.sha.slice(0, 7)}`;
}

export const COMMIT_URL_REQUIRED = 'Paste a GitHub commit link.';
export const COMMIT_URL_INVALID =
  'That doesn’t look like a GitHub commit link (https://github.com/owner/repo/commit/<sha>).';

/** Inline form validation for a commit URL field. Returns an error message or undefined. */
export function validateCommitUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return COMMIT_URL_REQUIRED;
  if (!isGithubCommitUrl(trimmed)) return COMMIT_URL_INVALID;
  return undefined;
}
