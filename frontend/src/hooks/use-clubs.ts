'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LOGO_FIELD,
  type ClubDetail,
  type ClubSummary,
  type Paginated,
  type UpdateClubBody,
} from '@uniconnect/shared';
import { api, toApiError } from '@/lib/api';

/** Every clubs query starts with this key, so one invalidation refreshes them all. */
export const CLUBS_KEY = ['clubs'] as const;
const detailKey = (id: number) => [...CLUBS_KEY, 'detail', id] as const;

/**
 * There is one club per department, so the directory asks for the API's largest page and
 * shows no pager. If clubs ever outgrow 100, add page/limit params here like useAdminUsers.
 */
const DIRECTORY_LIMIT = 100;

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

// 4xx answers won't change on retry (404 for a missing club, NO_DEPARTMENT_CLUB).
const retryServerErrors = (count: number, err: unknown) =>
  ((err as { status?: number }).status ?? 0) >= 500 && count < 1;

/** GET /api/v1/clubs (FR-CLUB-004). */
export function useClubs() {
  return useQuery({
    queryKey: [...CLUBS_KEY, 'list'],
    queryFn: () =>
      call(async () => {
        const res = await api.get<Envelope<ClubSummary[]> & Pick<Paginated<unknown>, 'meta'>>(
          '/v1/clubs',
          { params: { limit: DIRECTORY_LIMIT } },
        );
        return { data: res.data.data, meta: res.data.meta } satisfies Paginated<ClubSummary>;
      }),
    retry: retryServerErrors,
  });
}

/** GET /api/v1/clubs/:id (FR-CLUB-001). */
export function useClub(id: number) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () =>
      call(async () => (await api.get<Envelope<ClubDetail>>(`/v1/clubs/${id}`)).data.data),
    retry: retryServerErrors,
  });
}

/** GET /api/v1/clubs/my-club (FR-CLUB-002). A super admin gets 404 NO_DEPARTMENT_CLUB. */
export function useMyClub() {
  return useQuery({
    queryKey: [...CLUBS_KEY, 'my'],
    queryFn: () =>
      call(async () => (await api.get<Envelope<ClubDetail>>('/v1/clubs/my-club')).data.data),
    retry: retryServerErrors,
  });
}

/** After a change the detail is replaced, and the list and my-club refetch. */
function useAfterChange(id: number) {
  const client = useQueryClient();
  return (detail: ClubDetail) => {
    client.setQueryData(detailKey(id), detail);
    return client.invalidateQueries({ queryKey: CLUBS_KEY });
  };
}

/** PATCH /api/v1/clubs/:id (FR-CLUB-003): name, description and fees. */
export function useUpdateClub(id: number) {
  const after = useAfterChange(id);
  return useMutation({
    mutationFn: (body: UpdateClubBody) =>
      call(async () => (await api.patch<Envelope<ClubDetail>>(`/v1/clubs/${id}`, body)).data.data),
    onSuccess: (detail) => after(detail),
  });
}

/** PATCH /api/v1/clubs/:id/logo with one image file (DECISIONS D31). */
export function useUploadClubLogo(id: number) {
  const after = useAfterChange(id);
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append(LOGO_FIELD, file);
      return call(
        async () => (await api.patch<Envelope<ClubDetail>>(`/v1/clubs/${id}/logo`, form)).data.data,
      );
    },
    onSuccess: (detail) => after(detail),
  });
}
