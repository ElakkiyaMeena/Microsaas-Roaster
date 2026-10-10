export type DiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'context';

/** Classify one line of a unified diff. File headers (`+++` / `---` / `diff --git`) are meta. */
export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')) return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'context';
}
