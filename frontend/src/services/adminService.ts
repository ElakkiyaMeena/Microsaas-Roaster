import api from './api';
import type {
  AdminShareLinkItem,
  AdminStats,
  AdminUpdateUserPayload,
  AdminUserItem,
  AdminUsersParams,
  Paginated,
  PaginationParams,
  User,
} from '../types';

/** List users (newest first) with optional email/name search. */
export async function listUsers(params: AdminUsersParams = {}): Promise<Paginated<AdminUserItem>> {
  const query: AdminUsersParams = { page: params.page, per_page: params.per_page };
  const search = params.search?.trim();
  if (search) query.search = search;
  const { data } = await api.get<Paginated<AdminUserItem>>('/admin/users', { params: query });
  return data;
}

/** Activate/deactivate or promote/demote a user. */
export async function updateUser(id: number, payload: AdminUpdateUserPayload): Promise<User> {
  const { data } = await api.put<User>(`/admin/users/${id}`, payload);
  return data;
}

/** Platform-wide statistics. */
export async function getStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>('/admin/stats');
  return data;
}

/** List all share links with owner email. */
export async function listShareLinks(
  params: PaginationParams = {},
): Promise<Paginated<AdminShareLinkItem>> {
  const { data } = await api.get<Paginated<AdminShareLinkItem>>('/admin/share-links', {
    params,
  });
  return data;
}

/** Permanently delete (take down) a share link. */
export async function deleteShareLink(id: number): Promise<void> {
  await api.delete(`/admin/share-links/${id}`);
}

const adminService = { listUsers, updateUser, getStats, listShareLinks, deleteShareLink };
export default adminService;
