'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  BloodRequest,
  BloodRequestListParams,
  CreateBloodRequestBody,
  CreateDonationBody,
  Donation,
  Donor,
  DonorListParams,
  Paginated,
  UnverifiedDonation,
  UnverifiedDonationsParams,
} from '@uniconnect/shared';
import { api, toApiError, type ApiError } from '@/lib/api';
import { ME_KEY } from './use-me';

/** Every blood query starts with this key, so one invalidation refreshes them all. */
export const BLOOD_KEY = ['blood'] as const;

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

/**
 * Only 503 BLOOD_BUSY is retried: the API rolled back before answering (D40), so a second try
 * can't fulfill or verify twice. Everything else (409 already resolved, 403) is final.
 */
export const bloodBusyRetry = (count: number, err: unknown) =>
  (err as ApiError).code === 'BLOOD_BUSY' && count < 1;

async function list<T>(path: string, params: object): Promise<Paginated<T>> {
  const res = await api.get<Envelope<T[]> & Pick<Paginated<unknown>, 'meta'>>(path, { params });
  return { data: res.data.data, meta: res.data.meta };
}

function useList<T>(name: string, path: string, params: object, enabled = true) {
  return useQuery({
    queryKey: [...BLOOD_KEY, name, params],
    queryFn: () => call(() => list<T>(path, params)),
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
    enabled,
  });
}

/** GET /api/v1/blood/requests (FR-BLOOD-006). Pending by default. */
export const useBloodRequests = (params: BloodRequestListParams) =>
  useList<BloodRequest>('requests', '/v1/blood/requests', params);

/** GET /api/v1/blood/donors (FR-BLOOD-004). Phone, never email (D14). */
export const useDonors = (params: DonorListParams) =>
  useList<Donor>('donors', '/v1/blood/donors', params);

/** GET /api/v1/blood/donations/my (FR-BLOOD-003). Not for a super admin. */
export const useMyDonations = (params: { page?: number }, enabled = true) =>
  useList<Donation>('my-donations', '/v1/blood/donations/my', params, enabled);

/** GET /api/v1/admin/blood/donations/unverified (FR-BLOOD-010). */
export const useUnverifiedDonations = (params: UnverifiedDonationsParams) =>
  useList<UnverifiedDonation>('unverified', '/v1/admin/blood/donations/unverified', params);

/** Writes a returned request into every cached page at once, then refetches the lists. */
function replaceRequest(client: QueryClient, row: BloodRequest) {
  client.setQueriesData<Paginated<BloodRequest>>(
    { queryKey: [...BLOOD_KEY, 'requests'] },
    (page) => page && { ...page, data: page.data.map((r) => (r.id === row.id ? row : r)) },
  );
  return client.invalidateQueries({ queryKey: BLOOD_KEY });
}

/** POST /api/v1/blood/requests (FR-BLOOD-005). */
export function useCreateBloodRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBloodRequestBody) =>
      call(
        async () => (await api.post<Envelope<BloodRequest>>('/v1/blood/requests', body)).data.data,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: BLOOD_KEY }),
  });
}

function useResolveRequest(action: 'fulfill' | 'cancel') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      call(
        async () =>
          (await api.patch<Envelope<BloodRequest>>(`/v1/blood/requests/${id}/${action}`)).data.data,
      ),
    retry: bloodBusyRetry,
    retryDelay: 1000,
    onSuccess: (row) => replaceRequest(client, row),
    // A 409 means someone else resolved it first: refresh so the row shows that.
    onError: () => client.invalidateQueries({ queryKey: BLOOD_KEY }),
  });
}

/** PATCH /api/v1/blood/requests/:id/fulfill (FR-BLOOD-007). */
export const useFulfillRequest = () => useResolveRequest('fulfill');

/** PATCH /api/v1/blood/requests/:id/cancel (FR-BLOOD-008). */
export const useCancelRequest = () => useResolveRequest('cancel');

/** POST /api/v1/blood/donations (FR-BLOOD-001). */
export function useRecordDonation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDonationBody) =>
      call(async () => (await api.post<Envelope<Donation>>('/v1/blood/donations', body)).data.data),
    onSuccess: () => client.invalidateQueries({ queryKey: BLOOD_KEY }),
  });
}

/** PATCH /api/v1/blood/donations/:id/verify (FR-BLOOD-002). */
export function useVerifyDonation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      call(
        async () =>
          (await api.patch<Envelope<Donation>>(`/v1/blood/donations/${id}/verify`)).data.data,
      ),
    retry: bloodBusyRetry,
    retryDelay: 1000,
    onSuccess: (row) => {
      client.setQueriesData<Paginated<UnverifiedDonation>>(
        { queryKey: [...BLOOD_KEY, 'unverified'] },
        (page) =>
          page && {
            ...page,
            data: page.data.filter((d) => d.id !== row.id),
            meta: { ...page.meta, total: Math.max(0, page.meta.total - 1) },
          },
      );
      // The donor's last_donation_date changed; refresh the lists and the caller's profile.
      return Promise.all([
        client.invalidateQueries({ queryKey: BLOOD_KEY }),
        client.invalidateQueries({ queryKey: ME_KEY }),
      ]);
    },
  });
}
