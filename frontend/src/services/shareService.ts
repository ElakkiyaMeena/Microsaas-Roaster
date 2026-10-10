import api from './api';
import type {
  CreateSharePayload,
  PublicRoast,
  ShareLink,
  ShareLinkListItem,
  UpdateSharePayload,
} from '../types';

/** Create (or reactivate/update) the public share link for a completed roast. */
export async function createForRoast(
  roastId: number,
  payload: CreateSharePayload = {},
): Promise<ShareLink> {
  const { data } = await api.post<ShareLink>(`/roasts/${roastId}/share`, payload);
  return data;
}

/** List the current user's share links, newest first. */
export async function listMine(): Promise<ShareLinkListItem[]> {
  const { data } = await api.get<ShareLinkListItem[]>('/share-links');
  return data;
}

/** Update a share link (is_active / show_code / expires_at). */
export async function update(id: number, payload: UpdateSharePayload): Promise<ShareLink> {
  const { data } = await api.patch<ShareLink>(`/share-links/${id}`, payload);
  return data;
}

/** Permanently delete (revoke) a share link. */
export async function remove(id: number): Promise<void> {
  await api.delete(`/share-links/${id}`);
}

/** Fetch a shared roast by slug (no auth required). */
export async function getPublic(slug: string): Promise<PublicRoast> {
  const { data } = await api.get<PublicRoast>(`/public/roasts/${encodeURIComponent(slug)}`);
  return data;
}

const shareService = { createForRoast, listMine, update, remove, getPublic };
export default shareService;
