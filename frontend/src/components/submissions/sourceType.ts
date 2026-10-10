import type { IconType } from 'react-icons';
import { FaGithub } from 'react-icons/fa';
import { FiClipboard, FiUploadCloud } from 'react-icons/fi';
import type { SourceType } from '../../types';

export interface SourceTypeMeta {
  label: string;
  icon: IconType;
}

/** Display label + icon for each submission source. */
export const SOURCE_TYPE_META: Record<SourceType, SourceTypeMeta> = {
  paste: { label: 'Paste', icon: FiClipboard },
  upload: { label: 'Upload', icon: FiUploadCloud },
  github_commit: { label: 'GitHub commit', icon: FaGithub },
  github_repo: { label: 'GitHub repo', icon: FaGithub },
};

/** Label for a source type (falls back to the raw value for unknown types). */
export function getSourceTypeLabel(sourceType: SourceType): string {
  return SOURCE_TYPE_META[sourceType]?.label ?? sourceType;
}
