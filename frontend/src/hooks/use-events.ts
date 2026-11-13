'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  POSTER_FIELD,
  type CreateEventBody,
  type EventDetail,
  type EventListParams,
  type EventRegistration,
  type EventRegistrationStatus,
  type EventRegistrationsParams,
  type EventSummary,
  type MyRegistration,
  type MyRegistrationsParams,
  type Paginated,
  type UpdateEventBody,
} from '@uniconnect/shared';
import { api, toApiError, type ApiError } from '@/lib/api';

/** Every events query starts with this key, so one invalidation refreshes them all. */
export const EVENTS_KEY = ['events'] as const;
const detailKey = (id: number) => [...EVENTS_KEY, 'detail', id] as const;
const registrationsKey = (id: number) => [...EVENTS_KEY, id, 'registrations'] as const;

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

// 4xx answers won't change on retry (404 for an event the caller can't see).
const retryServerErrors = (count: number, err: unknown) =>
  ((err as { status?: number }).status ?? 0) >= 500 && count < 1;

async function list<T>(url: string, params: object): Promise<Paginated<T>> {
  return call(async () => {
    const res = await api.get<Envelope<T[]> & Pick<Paginated<unknown>, 'meta'>>(url, { params });
    return { data: res.data.data, meta: res.data.meta } satisfies Paginated<T>;
  });
}

/** GET /api/v1/events (FR-EVENT-006): only events the caller may see. */
export function useEvents(params: EventListParams) {
  return useQuery({
    queryKey: [...EVENTS_KEY, 'list', params],
    queryFn: () => list<EventSummary>('/v1/events', params),
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
  });
}

/** GET /api/v1/events/:id: 404 for an event the caller can't see. */
export function useEvent(id: number) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () =>
      call(async () => (await api.get<Envelope<EventDetail>>(`/v1/events/${id}`)).data.data),
    retry: retryServerErrors,
  });
}

/** GET /api/v1/events/my-registrations (FR-EVENT-009). */
export function useMyRegistrations(params: MyRegistrationsParams, { enabled = true } = {}) {
  return useQuery({
    queryKey: [...EVENTS_KEY, 'mine', params],
    queryFn: () => list<MyRegistration>('/v1/events/my-registrations', params),
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
    enabled,
  });
}

/** GET /api/v1/events/:id/registrations (FR-EVENT-011), organizers only. */
export function useEventRegistrations(
  id: number,
  params: EventRegistrationsParams,
  { enabled = true } = {},
) {
  return useQuery({
    queryKey: [...registrationsKey(id), params],
    queryFn: () => list<EventRegistration>(`/v1/events/${id}/registrations`, params),
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
    enabled,
  });
}

/** The same-origin CSV export: a plain link carries the session cookie (FR-EVENT-011). */
export function registrationsCsvUrl(id: number, status?: EventRegistrationStatus): string {
  const q = new URLSearchParams({ format: 'csv' });
  if (status) q.set('status', status);
  return `/api/v1/events/${id}/registrations?${q.toString()}`;
}

/** After a change the detail is replaced, and every list refetches. */
function afterChange(client: QueryClient, detail: EventDetail) {
  client.setQueryData(detailKey(detail.id), detail);
  return client.invalidateQueries({ queryKey: EVENTS_KEY });
}

/** POST /api/v1/events (FR-EVENT-001): creates a draft. */
export function useCreateEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventBody) =>
      call(async () => (await api.post<Envelope<EventDetail>>('/v1/events', body)).data.data),
    onSuccess: (detail) => afterChange(client, detail),
  });
}

/** PATCH /api/v1/events/:id (FR-EVENT-004): changed fields only. */
export function useUpdateEvent(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateEventBody) =>
      call(
        async () => (await api.patch<Envelope<EventDetail>>(`/v1/events/${id}`, body)).data.data,
      ),
    onSuccess: (detail) => afterChange(client, detail),
  });
}

/** PATCH /api/v1/events/:id/poster with one image file (FR-EVENT-002). */
export function useUploadEventPoster(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append(POSTER_FIELD, file);
      return call(
        async () =>
          (await api.patch<Envelope<EventDetail>>(`/v1/events/${id}/poster`, form)).data.data,
      );
    },
    onSuccess: (detail) => afterChange(client, detail),
  });
}

export type LifecycleAction = 'publish' | 'cancel' | 'complete';

/** PATCH /api/v1/events/:id/{publish,cancel,complete} (FR-EVENT-003/005/012). */
export function useEventLifecycle(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: LifecycleAction) =>
      call(
        async () =>
          (await api.patch<Envelope<EventDetail>>(`/v1/events/${id}/${action}`)).data.data,
      ),
    onSuccess: (detail) => afterChange(client, detail),
  });
}

/**
 * Only 503 EVENT_BUSY is retried: the API rolled the registration back before answering, so a
 * second try can't double-book. Everything else (409 full, 403 not eligible) is final.
 */
export const BUSY_RETRIES = 2;
export const busyRetry = (count: number, err: unknown) =>
  (err as ApiError).code === 'EVENT_BUSY' && count < BUSY_RETRIES;
export const busyDelay = (attempt: number) => 1000 * 2 ** attempt;

/** Seats changed: refetch the detail and every list. */
function afterSeats(client: QueryClient) {
  return client.invalidateQueries({ queryKey: EVENTS_KEY });
}

/** POST /api/v1/events/:id/register (FR-EVENT-007). */
export function useRegister(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      call(
        async () =>
          (await api.post<Envelope<MyRegistration>>(`/v1/events/${id}/register`)).data.data,
      ),
    retry: busyRetry,
    retryDelay: busyDelay,
    onSettled: () => afterSeats(client),
  });
}

/** DELETE /api/v1/events/:id/register (FR-EVENT-008). */
export function useCancelRegistration(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      call(
        async () =>
          (await api.delete<Envelope<MyRegistration>>(`/v1/events/${id}/register`)).data.data,
      ),
    retry: busyRetry,
    retryDelay: busyDelay,
    onSettled: () => afterSeats(client),
  });
}

/**
 * PATCH /api/v1/events/:id/registrations/:regId/check-in (FR-EVENT-010). The returned row is
 * written into every cached page at once, so it flips without waiting for a refetch.
 */
export function useCheckIn(eventId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (regId: number) =>
      call(
        async () =>
          (
            await api.patch<Envelope<EventRegistration>>(
              `/v1/events/${eventId}/registrations/${regId}/check-in`,
            )
          ).data.data,
      ),
    onSuccess: (row) => {
      client.setQueriesData<Paginated<EventRegistration>>(
        { queryKey: registrationsKey(eventId) },
        (page) => page && { ...page, data: page.data.map((r) => (r.id === row.id ? row : r)) },
      );
      return client.invalidateQueries({ queryKey: detailKey(eventId) });
    },
    onError: () => client.invalidateQueries({ queryKey: registrationsKey(eventId) }),
  });
}
