import type { Language } from '../../types';
import { MAX_BRIEF_CHARS, MAX_CODE_CHARS, MAX_TITLE_CHARS } from './uploadValidation';

export interface SubmissionFieldValues {
  title: string;
  language: Language;
  brief: string;
}

export type SubmissionFieldErrors = Partial<Record<keyof SubmissionFieldValues, string>>;

/** Validate title / brief. Returns an errors object (empty when valid). */
export function validateSubmissionFields(values: SubmissionFieldValues): SubmissionFieldErrors {
  const errors: SubmissionFieldErrors = {};
  const title = values.title.trim();
  if (!title) errors.title = 'Title is required.';
  else if (title.length > MAX_TITLE_CHARS) errors.title = `Title must be at most ${MAX_TITLE_CHARS} characters.`;
  if (values.brief.length > MAX_BRIEF_CHARS) {
    errors.brief = `Assignment brief must be at most ${MAX_BRIEF_CHARS} characters.`;
  }
  return errors;
}

/** Validate pasted code (required, at most 100k characters). Returns an error or undefined. */
export function validateCode(code: string): string | undefined {
  if (!code.trim()) return 'Paste some code to roast.';
  if (code.length > MAX_CODE_CHARS) {
    return `Code must be at most ${MAX_CODE_CHARS.toLocaleString()} characters.`;
  }
  return undefined;
}
