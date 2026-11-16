'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  DeptAdminDashboard,
  ModeratorDashboard,
  PersonalDashboard,
  SuperAdminDashboard,
} from '@uniconnect/shared';
import { api, toApiError, type ApiError } from '@/lib/api';

// The overview's four views (PRD FR-DASH-001–004; DECISIONS D13, D42, D43). Each section
// fetches on its own, so one failing view never blanks the others.

export const DASHBOARD_KEY = ['dashboard'] as const;

/** The super admin's health strip refreshes on this interval while the page is open. */
export const SUPER_ADMIN_REFRESH_MS = 60_000;

interface Envelope<T> {
  data: T;
}

async function fetchView<T>(path: string): Promise<T> {
  try {
    const res = await api.get<Envelope<T>>(`/v1/dashboard/${path}`);
    return res.data.data;
  } catch (err) {
    throw toApiError(err);
  }
}

const retryServerErrors = (count: number, err: unknown) =>
  ((err as { status?: number }).status ?? 0) >= 500 && count < 1;

export function usePersonalDashboard({ enabled = true } = {}) {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'student'],
    queryFn: () => fetchView<PersonalDashboard>('student'),
    enabled,
    retry: retryServerErrors,
  });
}

/** A moderator whose seat has ended answers 404 `NO_COMMITTEE_SEAT`: not an error, a state. */
export type ModeratorView = { kind: 'ok'; data: ModeratorDashboard } | { kind: 'no_seat' };

export function useModeratorDashboard({ enabled = true } = {}) {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'moderator'],
    queryFn: async (): Promise<ModeratorView> => {
      try {
        return { kind: 'ok', data: await fetchView<ModeratorDashboard>('moderator') };
      } catch (err) {
        if ((err as ApiError).code === 'NO_COMMITTEE_SEAT') return { kind: 'no_seat' };
        throw err;
      }
    },
    enabled,
    retry: retryServerErrors,
  });
}

export function useDeptAdminDashboard({ enabled = true } = {}) {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'dept-admin'],
    queryFn: () => fetchView<DeptAdminDashboard>('dept-admin'),
    enabled,
    retry: retryServerErrors,
  });
}

export function useSuperAdminDashboard({ enabled = true } = {}) {
  return useQuery({
    queryKey: [...DASHBOARD_KEY, 'super-admin'],
    queryFn: () => fetchView<SuperAdminDashboard>('super-admin'),
    enabled,
    refetchInterval: SUPER_ADMIN_REFRESH_MS,
    retry: retryServerErrors,
  });
}
