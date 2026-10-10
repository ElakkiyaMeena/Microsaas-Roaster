import { isAxiosError } from 'axios';
import type { ApiError } from '../types';

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';
export const TOO_LARGE_MESSAGE = 'That upload is too large.';
const UNAVAILABLE_MESSAGE = 'The server is temporarily unavailable. Please try again shortly.';

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'detail' in value &&
    typeof (value as { detail: unknown }).detail === 'string'
  );
}

/**
 * Extract a human-readable message from an unknown error (axios or otherwise).
 * Reads `response.data.detail` when it is a string. Non-JSON bodies (e.g. an HTML 413 / 502
 * page from the reverse proxy) map to friendly messages by status.
 */
export function getErrorMessage(err: unknown, fallback: string = DEFAULT_MESSAGE): string {
  if (isAxiosError(err)) {
    const data: unknown = err.response?.data;
    if (isApiError(data) && data.code === 'REQUEST_TOO_LARGE') {
      return TOO_LARGE_MESSAGE;
    }
    if (isApiError(data) && data.detail.trim() !== '') {
      return data.detail;
    }
    if (!err.response) {
      return 'Cannot reach the server. Check your connection and try again.';
    }
    const status = err.response.status;
    if (status === 413) {
      return TOO_LARGE_MESSAGE;
    }
    if (!isApiError(data) && (status === 502 || status === 503 || status === 504)) {
      return UNAVAILABLE_MESSAGE;
    }
    return fallback;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

/** Extract the machine error code (e.g. "ROAST_LIMIT_REACHED") if present. */
export function getErrorCode(err: unknown): string | undefined {
  if (isAxiosError(err)) {
    const data: unknown = err.response?.data;
    if (isApiError(data) && typeof data.code === 'string') {
      return data.code;
    }
  }
  return undefined;
}

/** HTTP status of an axios error, if any. */
export function getErrorStatus(err: unknown): number | undefined {
  return isAxiosError(err) ? err.response?.status : undefined;
}
