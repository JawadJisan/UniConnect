'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminUpdateUserInput,
  AdminUserDetail,
  AdminUserListParams,
  AdminUserSummary,
  Paginated,
  RecomputeRoleResult,
  UpdateUserStatusInput,
} from '@uniconnect/shared';
import { api, toApiError } from '@/lib/api';

/** Every admin-users query starts with this key, so one invalidation refreshes them all. */
export const ADMIN_USERS_KEY = ['admin', 'users'] as const;
const detailKey = (id: string) => [...ADMIN_USERS_KEY, 'detail', id] as const;

interface Envelope<T> {
  data: T;
}

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw toApiError(err);
  }
}

// 4xx answers won't change on retry (403 for a non-admin, 404 for a deleted user).
const retryServerErrors = (count: number, err: unknown) =>
  ((err as { status?: number }).status ?? 0) >= 500 && count < 1;

/** GET /api/v1/admin/users. Keeps the previous page on screen while the next one loads. */
export function useAdminUsers(params: AdminUserListParams) {
  return useQuery({
    queryKey: [...ADMIN_USERS_KEY, 'list', params],
    queryFn: () =>
      call(async () => {
        const res = await api.get<Envelope<AdminUserSummary[]> & Pick<Paginated<unknown>, 'meta'>>(
          '/v1/admin/users',
          { params },
        );
        return { data: res.data.data, meta: res.data.meta } satisfies Paginated<AdminUserSummary>;
      }),
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
  });
}

/** GET /api/v1/admin/users/:id. */
export function useAdminUser(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () =>
      call(
        async () => (await api.get<Envelope<AdminUserDetail>>(`/v1/admin/users/${id}`)).data.data,
      ),
    retry: retryServerErrors,
  });
}

/** After a change, the detail is replaced and every list refetches. */
function useAfterChange(id: string) {
  const client = useQueryClient();
  return (detail?: AdminUserDetail) => {
    if (detail) client.setQueryData(detailKey(id), detail);
    return client.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
  };
}

/** PATCH /api/v1/admin/users/:id/status: suspend (revokes every session) or activate. */
export function useSetUserStatus(id: string) {
  const after = useAfterChange(id);
  return useMutation({
    mutationFn: (body: UpdateUserStatusInput) =>
      call(
        async () =>
          (await api.patch<Envelope<AdminUserDetail>>(`/v1/admin/users/${id}/status`, body)).data
            .data,
      ),
    onSuccess: (detail) => after(detail),
  });
}

/** POST /api/v1/admin/users/:id/recompute-role. */
export function useRecomputeRole(id: string) {
  const after = useAfterChange(id);
  return useMutation({
    mutationFn: () =>
      call(
        async () =>
          (await api.post<Envelope<RecomputeRoleResult>>(`/v1/admin/users/${id}/recompute-role`))
            .data.data,
      ),
    onSuccess: () => after(),
  });
}

/** PATCH /api/v1/admin/users/:id: a super admin correcting a user's details. */
export function useAdminUpdateUser(id: string) {
  const after = useAfterChange(id);
  return useMutation({
    mutationFn: (body: Partial<Record<keyof AdminUpdateUserInput, unknown>>) =>
      call(
        async () =>
          (await api.patch<Envelope<AdminUserDetail>>(`/v1/admin/users/${id}`, body)).data.data,
      ),
    onSuccess: (detail) => after(detail),
  });
}
