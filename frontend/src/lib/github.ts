/**
 * Client-side helpers for GitHub repository and commit URLs. This is pre-validation only; the
 * backend re-validates and canonicalises the URL.
 */

export interface GithubCommitRef {
  owner: string;
  repo: string;
  sha: string;
}

export type GithubUrlKind = 'repo' | 'commit';

export interface GithubUrlRef {
  kind: GithubUrlKind;
  owner: string;
  repo: string;
  /** Branch / tag / sha from a `/tree/{ref}` repo link. */
  ref?: string;
  /** Lowercased commit sha (commit links only). */
  sha?: string;
}

const HOST = '^https://(?:www\\.)?github\\.com';
const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})';
const REPO = '[A-Za-z0-9._-]{1,100}';
const SHA = '[0-9a-fA-F]{7,40}';
const REF = '[A-Za-z0-9._/-]{1,255}';
const TAIL = '(?:/)?(?:[?#].*)?';

/** `https://github.com/{owner}/{repo}/commit/{sha}` */
const COMMIT_RE = new RegExp(`${HOST}/(${OWNER})/(${REPO})/commit/(${SHA})${TAIL}$`);
/** `https://github.com/{owner}/{repo}/pull/{n}/commits/{sha}` */
const PR_COMMIT_RE = new RegExp(`${HOST}/(${OWNER})/(${REPO})/pull/\\d+/commits/(${SHA})${TAIL}$`);
/** `https://github.com/{owner}/{repo}[.git][/tree/{ref}]` */
const REPO_RE = new RegExp(`${HOST}/(${OWNER})/(${REPO})(?:/tree/(${REF}))?${TAIL}$`);

/** Top-level GitHub paths that look like `/{owner}/{repo}` but are not repositories. */
const RESERVED_OWNERS: ReadonlySet<string> = new Set([
  'orgs',
  'settings',
  'marketplace',
  'topics',
  'explore',
  'sponsors',
  'features',
  'login',
  'notifications',
  'collections',
  'apps',
]);

function isValidRepoName(repo: string): boolean {
  return repo !== '.' && repo !== '..' && repo.length > 0;
}

/** Parse a GitHub commit URL into owner / repo / sha, or null when it is not one. */
export function parseGithubCommitUrl(url: string): GithubCommitRef | null {
  const trimmed = url.trim();
  const match = COMMIT_RE.exec(trimmed) ?? PR_COMMIT_RE.exec(trimmed);
  if (!match) return null;
  const [, owner, repo, sha] = match;
  if (!isValidRepoName(repo)) return null;
  return { owner, repo, sha: sha.toLowerCase() };
}

/**
 * Parse a public GitHub repository or commit URL. Repo links may end in `.git`, a trailing
 * slash, `/tree/{ref}`, or a query / fragment. Returns null for anything else (org pages,
 * issues, blobs, gists, other hosts, plain http).
 */
export function parseGithubUrl(url: string): GithubUrlRef | null {
  const commit = parseGithubCommitUrl(url);
  if (commit) return { kind: 'commit', ...commit };

  const match = REPO_RE.exec(url.trim());
  if (!match) return null;
  const [, owner, rawRepo, rawRef] = match;
  if (RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
  if (!isValidRepoName(repo)) return null;
  const ref = rawRef?.replace(/\/+$/, '');
  if (rawRef !== undefined) {
    if (!ref || ref.split('/').some((part) => part === '' || part === '.' || part === '..')) {
      return null;
    }
    return { kind: 'repo', owner, repo, ref };
  }
  return { kind: 'repo', owner, repo };
}

/** True when `url` looks like a public GitHub commit URL (commit page or PR commit page). */
export function isGithubCommitUrl(url: string): boolean {
  return parseGithubCommitUrl(url) !== null;
}

/** True when `url` looks like a public GitHub repository or commit URL. */
export function isGithubUrl(url: string): boolean {
  return parseGithubUrl(url) !== null;
}

/** Short label like "owner/repo@abc1234"; falls back to the raw URL when it can't be parsed. */
export function shortCommitLabel(url: string): string {
  const ref = parseGithubCommitUrl(url);
  if (!ref) return url;
  return `${ref.owner}/${ref.repo}@${ref.sha.slice(0, 7)}`;
}

/**
 * Short label for any GitHub link: "owner/repo", "owner/repo (ref)" or "owner/repo@abc1234".
 * Falls back to the raw URL when it can't be parsed.
 */
export function shortGithubLabel(url: string): string {
  const parsed = parseGithubUrl(url);
  if (!parsed) return url;
  const base = `${parsed.owner}/${parsed.repo}`;
  if (parsed.kind === 'commit' && parsed.sha) return `${base}@${parsed.sha.slice(0, 7)}`;
  if (parsed.ref) return `${base} (${parsed.ref})`;
  return base;
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

export const GITHUB_URL_REQUIRED = 'Paste a GitHub repository or commit link.';
export const GITHUB_URL_INVALID = 'That doesn’t look like a GitHub repository or commit link.';

/** Inline form validation for a repo-or-commit URL field. Returns an error message or undefined. */
export function validateGithubUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return GITHUB_URL_REQUIRED;
  if (!isGithubUrl(trimmed)) return GITHUB_URL_INVALID;
  return undefined;
}
