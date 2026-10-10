import type { AxiosProgressEvent } from 'axios';
import api from './api';
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

export const DEFAULT_PER_PAGE = 10;

export interface UploadOptions {
  /** Called with upload progress in percent (0–100). */
  onUploadProgress?: (percent: number) => void;
}

/** Build the multipart body for POST /submissions/upload (`files` repeated per file). */
export function buildUploadFormData(payload: UploadSubmissionPayload): FormData {
  const form = new FormData();
  form.append('title', payload.title);
  form.append('language', payload.language);
  const brief = payload.assignment_brief?.trim();
  if (brief) {
    form.append('assignment_brief', brief);
  }
  payload.files.forEach((file) => {
    form.append('files', file, file.name);
  });
  return form;
}

/** GET /submissions — paginated, newest first. */
export async function list(
  page: number = 1,
  per_page: number = DEFAULT_PER_PAGE,
): Promise<Paginated<SubmissionListItem>> {
  const { data } = await api.get<Paginated<SubmissionListItem>>('/submissions', {
    params: { page, per_page },
  });
  return data;
}

/** GET /submissions/{id}. */
export async function get(id: number): Promise<SubmissionDetail> {
  const { data } = await api.get<SubmissionDetail>(`/submissions/${id}`);
  return data;
}

/** POST /submissions — create a pasted-code submission. */
export async function createPaste(payload: CreateSubmissionPayload): Promise<SubmissionDetail> {
  const { data } = await api.post<SubmissionDetail>('/submissions', payload);
  return data;
}

/**
 * POST /submissions/github-commit — fetch a public GitHub commit (diff + message) server-side.
 * Errors: 400 INVALID_GITHUB_URL / NO_READABLE_FILES, 404 GITHUB_COMMIT_NOT_FOUND,
 * 429 GITHUB_RATE_LIMITED, 502 GITHUB_UNAVAILABLE.
 */
export async function createFromGithubCommit(
  payload: CreateGithubCommitPayload,
): Promise<SubmissionDetail> {
  const { data } = await api.post<SubmissionDetail>('/submissions/github-commit', payload);
  return data;
}

/**
 * POST /submissions/github — fetch a public GitHub repository snapshot or commit server-side
 * (the backend auto-detects which). Errors: 400 INVALID_GITHUB_URL / NO_READABLE_FILES,
 * 404 GITHUB_REPO_NOT_FOUND / GITHUB_COMMIT_NOT_FOUND, 429 GITHUB_RATE_LIMITED,
 * 502 GITHUB_UNAVAILABLE.
 */
export async function createFromGithub(payload: CreateGithubPayload): Promise<SubmissionDetail> {
  const { data } = await api.post<SubmissionDetail>('/submissions/github', payload);
  return data;
}

/** POST /submissions/upload — multipart upload of one or more files (or a zip). */
export async function upload(
  payload: UploadSubmissionPayload,
  options: UploadOptions = {},
): Promise<SubmissionDetail> {
  const { onUploadProgress } = options;
  const { data } = await api.post<SubmissionDetail>(
    '/submissions/upload',
    buildUploadFormData(payload),
    {
      // Axios drops this in the browser so the multipart boundary is set automatically.
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onUploadProgress
        ? (event: AxiosProgressEvent) => {
            if (event.total) {
              onUploadProgress(Math.round((event.loaded / event.total) * 100));
            }
          }
        : undefined,
    },
  );
  return data;
}

/** PUT /submissions/{id}. `code_content` only allowed for paste submissions (not upload / github_commit / github_repo). */
export async function update(
  id: number,
  payload: UpdateSubmissionPayload,
): Promise<SubmissionDetail> {
  const { data } = await api.put<SubmissionDetail>(`/submissions/${id}`, payload);
  return data;
}

/** DELETE /submissions/{id}. */
export async function remove(id: number): Promise<void> {
  await api.delete(`/submissions/${id}`);
}

const submissionService = {
  list,
  get,
  createPaste,
  createFromGithub,
  createFromGithubCommit,
  upload,
  update,
  remove,
};
export default submissionService;
