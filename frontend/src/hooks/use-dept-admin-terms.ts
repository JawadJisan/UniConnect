'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignDeptAdminInput,
  DeptAdminTerm,
  DeptAdminTermListParams,
  Paginated,
  RenewDeptAdminInput,
} from '@uniconnect/shared';
import { api, toApiError } from '@/lib/api';
import { ADMIN_USERS_KEY } from './use-admin-users';
import { CLUBS_KEY } from './use-clubs';

/** Every dept-admin-term query starts with this key. */
export const DEPT_ADMIN_TERMS_KEY = ['admin', 'dept-admin-terms'] as const;

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

// 4xx answers won't change on retry (403 for anyone but a super admin).
const retryServerErrors = (count: number, err: unknown) =>
  ((err as { status?: number }).status ?? 0) >= 500 && count < 1;

/** GET /api/v1/admin/dept-admin-terms (FR-ADMIN-004). Keeps the previous page while the next loads. */
export function useDeptAdminTerms(params: DeptAdminTermListParams) {
  return useQuery({
    queryKey: [...DEPT_ADMIN_TERMS_KEY, 'list', params],
    queryFn: () =>
      call(async () => {
        const res = await api.get<Envelope<DeptAdminTerm[]> & Pick<Paginated<unknown>, 'meta'>>(
          '/v1/admin/dept-admin-terms',
          { params },
        );
        return { data: res.data.data, meta: res.data.meta } satisfies Paginated<DeptAdminTerm>;
      }),
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
  });
}

/** Terms, users' roles and the clubs editors see all change together. */
function useInvalidate() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: DEPT_ADMIN_TERMS_KEY }),
      client.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
      client.invalidateQueries({ queryKey: CLUBS_KEY }),
    ]);
}

/** POST /api/v1/admin/dept-admin-terms (FR-ADMIN-001). */
export function useAssignDeptAdmin() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: AssignDeptAdminInput) =>
      call(
        async () =>
          (await api.post<Envelope<DeptAdminTerm>>('/v1/admin/dept-admin-terms', body)).data.data,
      ),
    onSuccess: () => invalidate(),
  });
}

/** PATCH /api/v1/admin/dept-admin-terms/:id/end (FR-ADMIN-002). */
export function useEndDeptAdminTerm() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) =>
      call(
        async () =>
          (await api.patch<Envelope<DeptAdminTerm>>(`/v1/admin/dept-admin-terms/${id}/end`)).data
            .data,
      ),
    onSuccess: () => invalidate(),
  });
}

/** POST /api/v1/admin/dept-admin-terms/:id/renew (FR-ADMIN-003). */
export function useRenewDeptAdminTerm() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: RenewDeptAdminInput }) =>
      call(
        async () =>
          (await api.post<Envelope<DeptAdminTerm>>(`/v1/admin/dept-admin-terms/${id}/renew`, body))
            .data.data,
      ),
    onSuccess: () => invalidate(),
  });
}
