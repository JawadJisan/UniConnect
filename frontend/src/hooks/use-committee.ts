'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignCommitteeBody,
  CommitteeCandidate,
  CommitteeEntry,
  UpdateCommitteeInput,
} from '@uniconnect/shared';
import { api, toApiError } from '@/lib/api';
import { ADMIN_USERS_KEY } from './use-admin-users';
import { CLUBS_KEY } from './use-clubs';

/** Every committee query starts with this key, so one invalidation refreshes them all. */
export const COMMITTEE_KEY = ['committee'] as const;

/**
 * A club's committee, current and past, is a few dozen rows at most, so it is fetched in one
 * page and paged on the client. If that ever outgrows 100, page it on the server.
 */
const COMMITTEE_LIMIT = 100;

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

// 4xx answers won't change on retry (403 for a viewer, 404 for a missing club).
const retryServerErrors = (count: number, err: unknown) =>
  ((err as { status?: number }).status ?? 0) >= 500 && count < 1;

/** GET /api/v1/clubs/:id/committee (FR-COMM-001): every row, current first. */
export function useCommittee(clubId: number, { enabled = true } = {}) {
  return useQuery({
    queryKey: [...COMMITTEE_KEY, clubId, 'list'],
    queryFn: () =>
      call(
        async () =>
          (
            await api.get<Envelope<CommitteeEntry[]>>(`/v1/clubs/${clubId}/committee`, {
              params: { limit: COMMITTEE_LIMIT },
            })
          ).data.data,
      ),
    enabled,
    retry: retryServerErrors,
  });
}

/** GET /api/v1/clubs/:id/committee/candidates (D34). Runs once `search` has 2+ characters. */
export function useCommitteeCandidates(clubId: number, search: string) {
  return useQuery({
    queryKey: [...COMMITTEE_KEY, clubId, 'candidates', search],
    queryFn: () =>
      call(
        async () =>
          (
            await api.get<Envelope<CommitteeCandidate[]>>(
              `/v1/clubs/${clubId}/committee/candidates`,
              { params: { search } },
            )
          ).data.data,
      ),
    enabled: search.length >= 2,
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
  });
}

/** Committee rows, the club detail's current committee and users' roles all change together. */
function useInvalidate() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: COMMITTEE_KEY }),
      client.invalidateQueries({ queryKey: CLUBS_KEY }),
      client.invalidateQueries({ queryKey: ADMIN_USERS_KEY }),
    ]);
}

/** POST /api/v1/clubs/:id/committee (FR-COMM-002). */
export function useAssignCommittee(clubId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: AssignCommitteeBody) =>
      call(
        async () =>
          (await api.post<Envelope<CommitteeEntry>>(`/v1/clubs/${clubId}/committee`, body)).data
            .data,
      ),
    onSuccess: () => invalidate(),
  });
}

/** PATCH /api/v1/clubs/:id/committee/:memberId (FR-COMM-004): position and years only. */
export function useUpdateCommittee(clubId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ memberId, body }: { memberId: number; body: UpdateCommitteeInput }) =>
      call(
        async () =>
          (
            await api.patch<Envelope<CommitteeEntry>>(
              `/v1/clubs/${clubId}/committee/${memberId}`,
              body,
            )
          ).data.data,
      ),
    onSuccess: () => invalidate(),
  });
}

/** PATCH /api/v1/clubs/:id/committee/:memberId/end-term (FR-COMM-003). */
export function useEndCommitteeTerm(clubId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (memberId: number) =>
      call(
        async () =>
          (
            await api.patch<Envelope<CommitteeEntry>>(
              `/v1/clubs/${clubId}/committee/${memberId}/end-term`,
            )
          ).data.data,
      ),
    onSuccess: () => invalidate(),
  });
}
