'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminMembershipListParams,
  AdminMembershipRow,
  CheckoutResult,
  MembershipSummary,
  MembershipType,
  Paginated,
} from '@uniconnect/shared';
import { api, toApiError } from '@/lib/api';
import { mockValId } from '@/lib/mock-gateway';

/** Every membership query starts with this key, so one invalidation refreshes them all. */
export const MEMBERSHIPS_KEY = ['memberships'] as const;

/**
 * A student has a handful of rows per club (one a month at most), so their list is fetched in
 * one page and paged on the client. If that ever outgrows 100, page it like useAdminMemberships.
 */
const MY_LIMIT = 100;

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

// 4xx answers won't change on retry (403 for faculty, 404 for someone else's membership).
const retryServerErrors = (count: number, err: unknown) =>
  ((err as { status?: number }).status ?? 0) >= 500 && count < 1;

/**
 * GET /api/v1/memberships/my (FR-MEM-004). With `pollWhilePending`, refetches every 2 s while a
 * row is still `pending`, so a confirmed payment shows up without a reload after checkout.
 */
export function useMyMemberships({ pollWhilePending = false } = {}) {
  return useQuery({
    queryKey: [...MEMBERSHIPS_KEY, 'my'],
    queryFn: () =>
      call(async () => {
        const res = await api.get<Envelope<MembershipSummary[]> & Pick<Paginated<unknown>, 'meta'>>(
          '/v1/memberships/my',
          { params: { limit: MY_LIMIT } },
        );
        return res.data.data;
      }),
    refetchInterval: (query) =>
      pollWhilePending && query.state.data?.some((m) => m.status === 'pending') ? 2000 : false,
    retry: retryServerErrors,
  });
}

/** GET /api/v1/admin/memberships (FR-MEM-005). Keeps the previous page while the next loads. */
export function useAdminMemberships(params: AdminMembershipListParams) {
  return useQuery({
    queryKey: [...MEMBERSHIPS_KEY, 'admin', params],
    queryFn: () =>
      call(async () => {
        const res = await api.get<
          Envelope<AdminMembershipRow[]> & Pick<Paginated<unknown>, 'meta'>
        >('/v1/admin/memberships', { params });
        return { data: res.data.data, meta: res.data.meta } satisfies Paginated<AdminMembershipRow>;
      }),
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: MEMBERSHIPS_KEY });
}

/**
 * POST /api/v1/memberships (FR-MEM-001) or /:id/renew (FR-MEM-002). Resolves with the checkout;
 * the caller sends the browser to `redirect_url`.
 */
export function useStartCheckout() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (
      input:
        | { kind: 'purchase'; clubId: number; type: MembershipType }
        | { kind: 'renew'; membershipId: number; type: MembershipType },
    ) =>
      call(async () => {
        const res =
          input.kind === 'purchase'
            ? await api.post<Envelope<CheckoutResult>>('/v1/memberships', {
                club_id: input.clubId,
                type: input.type,
              })
            : await api.post<Envelope<CheckoutResult>>(
                `/v1/memberships/${input.membershipId}/renew`,
                { type: input.type },
              );
        return res.data.data;
      }),
    onSuccess: () => invalidate(),
  });
}

/** PATCH /api/v1/memberships/:id/cancel (FR-MEM-003): the owner, the club's dept_admin or a super admin. */
export function useCancelMembership() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) =>
      call(
        async () =>
          (await api.patch<Envelope<MembershipSummary>>(`/v1/memberships/${id}/cancel`)).data.data,
      ),
    onSuccess: () => invalidate(),
  });
}

/**
 * Development only: posts the IPN the mock gateway would send (DECISIONS D32). The server still
 * settles the payment from its own gateway validation, never from this body.
 */
export function useSimulatePayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      tranId,
      amount,
      outcome,
    }: {
      tranId: string;
      amount: string;
      outcome: 'success' | 'failure';
    }) =>
      call(async () => {
        await api.post('/v1/memberships/payment/ipn', {
          tran_id: tranId,
          val_id: mockValId(tranId, amount, outcome),
          status: outcome === 'success' ? 'VALID' : 'FAILED',
        });
      }),
    onSuccess: () => invalidate(),
  });
}
