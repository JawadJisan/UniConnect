'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  Announcement,
  AnnouncementListParams,
  CreateAnnouncementBody,
  Paginated,
  UpdateAnnouncementBody,
} from '@uniconnect/shared';
import { api, toApiError } from '@/lib/api';

/** Every announcements query starts with this key, so one invalidation refreshes them all. */
export const ANNOUNCEMENTS_KEY = ['announcements'] as const;

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

// 4xx answers won't change on retry.
const retryServerErrors = (count: number, err: unknown) =>
  ((err as { status?: number }).status ?? 0) >= 500 && count < 1;

/** GET /api/v1/announcements (FR-ANNOUNCE-002): only posts the caller may see (D15). */
export function useAnnouncements(params: AnnouncementListParams) {
  return useQuery({
    queryKey: [...ANNOUNCEMENTS_KEY, 'list', params],
    queryFn: () =>
      call(async () => {
        const res = await api.get<Envelope<Announcement[]> & Pick<Paginated<unknown>, 'meta'>>(
          '/v1/announcements',
          { params },
        );
        return { data: res.data.data, meta: res.data.meta } satisfies Paginated<Announcement>;
      }),
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
  });
}

/** Writes a returned row into every cached page at once, then refetches the lists. */
function replaceRow(client: QueryClient, row: Announcement) {
  client.setQueriesData<Paginated<Announcement>>(
    { queryKey: ANNOUNCEMENTS_KEY },
    (page) => page && { ...page, data: page.data.map((a) => (a.id === row.id ? row : a)) },
  );
  return client.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY });
}

/** POST /api/v1/announcements (FR-ANNOUNCE-001). */
export function useCreateAnnouncement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAnnouncementBody) =>
      call(
        async () => (await api.post<Envelope<Announcement>>('/v1/announcements', body)).data.data,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY }),
  });
}

/** PATCH /api/v1/announcements/:id (FR-ANNOUNCE-003): title and content only. */
export function useUpdateAnnouncement(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAnnouncementBody) =>
      call(
        async () =>
          (await api.patch<Envelope<Announcement>>(`/v1/announcements/${id}`, body)).data.data,
      ),
    onSuccess: (row) => replaceRow(client, row),
  });
}

/** DELETE /api/v1/announcements/:id (FR-ANNOUNCE-003). */
export function useDeleteAnnouncement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      call(async () => {
        await api.delete(`/v1/announcements/${id}`);
        return id;
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY }),
  });
}

/** PATCH /api/v1/announcements/:id/pin (FR-ANNOUNCE-004): flips is_pinned. */
export function useTogglePin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      call(
        async () =>
          (await api.patch<Envelope<Announcement>>(`/v1/announcements/${id}/pin`)).data.data,
      ),
    onSuccess: (row) => replaceRow(client, row),
  });
}
