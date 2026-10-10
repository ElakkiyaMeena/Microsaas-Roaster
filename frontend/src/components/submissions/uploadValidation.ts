import { ALLOWED_UPLOAD_EXTENSIONS } from '../../types';

/** Client-side limits (mirror backend config defaults; the server re-validates). */
export const UPLOAD_LIMITS = {
  maxFileBytes: 1_048_576,
  maxZipBytes: 5_242_880,
  maxFiles: 20,
  /** Total bytes of one upload request (proxy accepts 26 MB; keep headroom for multipart). */
  maxTotalBytes: 25 * 1024 * 1024,
} as const;

export const MAX_CODE_CHARS = 100_000;
export const MAX_BRIEF_CHARS = 5000;
export const MAX_TITLE_CHARS = 200;

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

export function isZip(file: File): boolean {
  return getExtension(file.name) === '.zip';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export interface FileValidationResult {
  accepted: File[];
  errors: string[];
}

/**
 * Validate newly picked files against the already selected ones: allowed extension,
 * size (1 MB per file, 5 MB per zip), duplicates, the max file count and the total size (25 MB).
 */
export function validateIncomingFiles(existing: File[], incoming: File[]): FileValidationResult {
  const accepted: File[] = [];
  const errors: string[] = [];
  const seen = new Set(existing.map(fileKey));
  let totalBytes = existing.reduce((sum, f) => sum + f.size, 0);

  for (const file of incoming) {
    const ext = getExtension(file.name);
    if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
      errors.push(`${file.name}: unsupported file type${ext ? ` (${ext})` : ''}.`);
      continue;
    }
    const limit = ext === '.zip' ? UPLOAD_LIMITS.maxZipBytes : UPLOAD_LIMITS.maxFileBytes;
    if (file.size > limit) {
      errors.push(`${file.name}: too large (${formatBytes(file.size)}; max ${formatBytes(limit)}).`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`${file.name}: file is empty.`);
      continue;
    }
    const key = fileKey(file);
    if (seen.has(key)) continue;
    if (existing.length + accepted.length >= UPLOAD_LIMITS.maxFiles) {
      errors.push(`You can upload at most ${UPLOAD_LIMITS.maxFiles} files.`);
      break;
    }
    if (totalBytes + file.size > UPLOAD_LIMITS.maxTotalBytes) {
      errors.push(
        `${file.name}: would exceed the ${formatBytes(UPLOAD_LIMITS.maxTotalBytes)} total upload limit.`,
      );
      continue;
    }
    totalBytes += file.size;
    seen.add(key);
    accepted.push(file);
  }
  return { accepted, errors };
}
