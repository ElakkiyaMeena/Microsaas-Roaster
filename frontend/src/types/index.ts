/**
 * Shared API types. These mirror the PRP API contract exactly (snake_case, no mapping layer).
 * Datetimes are ISO-8601 strings with timezone.
 */

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export type RoastIntensity = 'mild' | 'medium' | 'savage';
export type RoastStatus = 'pending' | 'completed' | 'failed';
export type SourceType = 'paste' | 'upload' | 'github_commit';
export type Language =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'go'
  | 'ruby'
  | 'php'
  | 'html_css'
  | 'sql'
  | 'other';
export type IssueSeverity = 'low' | 'medium' | 'high';
export type IssueCategory =
  | 'bug'
  | 'style'
  | 'performance'
  | 'security'
  | 'readability'
  | 'requirements';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  is_admin: boolean;
  oauth_provider: string | null;
  avatar_url: string | null;
  default_intensity: RoastIntensity;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
}

// ---------------------------------------------------------------------------
// Roasts
// ---------------------------------------------------------------------------

export interface RoastIssue {
  file: string | null;
  line: number | null;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  suggested_fix: string;
}

export interface ShareLink {
  id: number;
  roast_id: number;
  slug: string;
  url: string;
  is_active: boolean;
  show_code: boolean;
  view_count: number;
  expires_at: string | null;
  created_at: string;
}

export interface Roast {
  id: number;
  submission_id: number;
  intensity: RoastIntensity;
  status: RoastStatus;
  score: number | null;
  headline: string | null;
  summary: string | null;
  issues: RoastIssue[];
  strengths: string[];
  model: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  share_link: ShareLink | null;
}

export interface RoastQuota {
  limit: number;
  used_today: number;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export interface SubmissionFile {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface SubmissionListItem {
  id: number;
  title: string;
  language: Language;
  source_type: SourceType;
  /** Canonical commit URL for github_commit submissions; null otherwise. */
  source_url: string | null;
  created_at: string;
  updated_at: string | null;
  roast_count: number;
  latest_score: number | null;
}

export interface SubmissionDetail {
  id: number;
  title: string;
  assignment_brief: string | null;
  language: Language;
  source_type: SourceType;
  /** Canonical `https://github.com/{owner}/{repo}/commit/{sha}` for github_commit; null otherwise. */
  source_url: string | null;
  code_content: string;
  created_at: string;
  updated_at: string | null;
  files: SubmissionFile[];
  /** Newest first. */
  roasts: Roast[];
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export interface ShareLinkListItem extends ShareLink {
  roast_headline: string | null;
  submission_title: string;
}

export interface AdminShareLinkItem extends ShareLinkListItem {
  owner_email: string;
}

/** Public roast payload. Contains no user ids or emails. */
export interface PublicRoast {
  slug: string;
  submission_title: string;
  language: Language;
  intensity: RoastIntensity;
  score: number | null;
  headline: string | null;
  summary: string | null;
  issues: RoastIssue[];
  strengths: string[];
  /** null unless the owner enabled show_code. */
  code_content: string | null;
  /** First name only, or null. */
  author_name: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pagination / admin / errors
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
}

export interface AdminUserItem extends User {
  submission_count: number;
  roast_count: number;
}

export interface DailyCount {
  /** YYYY-MM-DD */
  date: string;
  count: number;
}

export interface AdminStats {
  total_users: number;
  active_users: number;
  total_submissions: number;
  total_roasts: number;
  failed_roasts: number;
  roasts_last_7_days: DailyCount[];
  total_prompt_tokens: number;
  total_completion_tokens: number;
  active_share_links: number;
}

export interface ApiError {
  detail: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

export interface RegisterPayload {
  email: string;
  /** 8–128 characters. */
  password: string;
  full_name?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RefreshPayload {
  refresh_token: string;
}

export interface UpdateProfilePayload {
  full_name?: string | null;
  default_intensity?: RoastIntensity;
}

export interface CreateSubmissionPayload {
  title: string;
  assignment_brief?: string | null;
  language: Language;
  code_content: string;
}

/** Sent as multipart/form-data to POST /submissions/upload. */
export interface UploadSubmissionPayload {
  title: string;
  assignment_brief?: string | null;
  language: Language;
  files: File[];
}

/** JSON body for POST /submissions/github-commit. */
export interface CreateGithubCommitPayload {
  commit_url: string;
  /** Defaults to the commit message's first line when omitted. */
  title?: string;
  assignment_brief?: string;
  /** null / omitted = auto-detect from the changed files. */
  language?: Language | null;
}

export interface UpdateSubmissionPayload {
  title?: string;
  assignment_brief?: string | null;
  language?: Language;
  /** Only allowed for paste submissions (400 CODE_NOT_EDITABLE for upload / github_commit). */
  code_content?: string;
}

export interface CreateRoastPayload {
  intensity?: RoastIntensity;
}

export interface CreateSharePayload {
  show_code?: boolean;
  expires_at?: string | null;
}

export interface UpdateSharePayload {
  is_active?: boolean;
  show_code?: boolean;
  expires_at?: string | null;
}

export interface AdminUpdateUserPayload {
  is_active?: boolean;
  is_admin?: boolean;
}

export interface AdminUsersParams extends PaginationParams {
  search?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export interface LanguageOption {
  value: Language;
  label: string;
}

export const LANGUAGES: readonly LanguageOption[] = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'html_css', label: 'HTML / CSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'other', label: 'Other' },
] as const;

export interface IntensityOption {
  value: RoastIntensity;
  label: string;
  emoji: string;
  description: string;
}

export const INTENSITIES: readonly IntensityOption[] = [
  {
    value: 'mild',
    label: 'Mild',
    emoji: '🌶️',
    description: 'Gentle and encouraging. Constructive feedback with a light touch.',
  },
  {
    value: 'medium',
    label: 'Medium',
    emoji: '🔥',
    description: 'Witty and direct. Honest critique with a side of sass.',
  },
  {
    value: 'savage',
    label: 'Savage',
    emoji: '💀',
    description: 'Brutal comedic roast of your code (never you). Not for the faint of heart.',
  },
] as const;

/** Allowed upload extensions (mirrors backend config). */
export const ALLOWED_UPLOAD_EXTENSIONS: readonly string[] = [
  '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rb', '.php',
  '.html', '.css', '.sql', '.md', '.json', '.txt', '.zip',
] as const;

export function getLanguageLabel(value: string): string {
  return LANGUAGES.find((l) => l.value === value)?.label ?? value;
}

export function getIntensityOption(value: RoastIntensity): IntensityOption {
  return INTENSITIES.find((i) => i.value === value) ?? INTENSITIES[1];
}
