/** Helpers for recovering from stale lazy-loaded chunks (e.g. after a new deploy). */

/** sessionStorage key holding the timestamp (ms) of the last automatic chunk-error reload. */
export const CHUNK_RELOAD_FLAG = 'ar_chunk_reload_at';

/** A second automatic reload is only allowed after this window, preventing reload loops. */
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

const CHUNK_ERROR_PATTERNS: RegExp[] = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [\w-]+ failed/i,
];

/** True when the error comes from a lazy-loaded chunk that could not be fetched. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error.message));
}

/**
 * Record an automatic reload attempt. Returns true when a reload should happen now, i.e. no
 * attempt was recorded within the last {@link CHUNK_RELOAD_WINDOW_MS} and storage is writable.
 */
export function claimChunkReload(now: number = Date.now()): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_FLAG));
    if (Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(now));
    return true;
  } catch {
    return false;
  }
}

/** Indirection over window.location.reload so it can be stubbed in tests. */
export const pageActions = {
  reload(): void {
    window.location.reload();
  },
};
