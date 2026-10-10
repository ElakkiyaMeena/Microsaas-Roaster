import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import adminService from '../services/adminService';
import type { AdminUpdateUserPayload, AdminUsersParams, PaginationParams, User } from '../types';

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => ['admin', 'stats'] as const,
  users: (params: AdminUsersParams) => ['admin', 'users', params] as const,
  shareLinks: (params: PaginationParams) => ['admin', 'share-links', params] as const,
};

export function useAdminStats() {
  return useQuery({ queryKey: adminKeys.stats(), queryFn: adminService.getStats });
}

export function useAdminUsers(params: AdminUsersParams) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () => adminService.listUsers(params),
    placeholderData: keepPreviousData,
  });
}

interface UpdateUserVars {
  id: number;
  payload: AdminUpdateUserPayload;
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation<User, unknown, UpdateUserVars>({
    mutationFn: ({ id, payload }) => adminService.updateUser(id, payload),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    },
  });
}

export function useAdminShareLinks(params: PaginationParams) {
  return useQuery({
    queryKey: adminKeys.shareLinks(params),
    queryFn: () => adminService.listShareLinks(params),
    placeholderData: keepPreviousData,
  });
}

export function useDeleteAdminShareLink() {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, number>({
    mutationFn: (id) => adminService.deleteShareLink(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'share-links'] });
      void queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
      void queryClient.invalidateQueries({ queryKey: ['share-links'] });
    },
  });
}
