'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AuditLogEntry, AuditLogParams, Paginated } from '@uniconnect/shared';
import { api, toApiError } from '@/lib/api';

// GET /api/v1/admin/audit-logs (PRD FR-AUDIT-002; DECISIONS D42), super admin only.

export const AUDIT_LOGS_KEY = ['audit-logs'] as const;

interface ListEnvelope<T> {
  data: T[];
  meta: Paginated<T>['meta'];
}

// 400 (a bad filter) and 403 won't change on retry.
const retryServerErrors = (count: number, err: unknown) =>
  ((err as { status?: number }).status ?? 0) >= 500 && count < 1;

export function useAuditLogs(params: AuditLogParams, { enabled = true } = {}) {
  return useQuery({
    queryKey: [...AUDIT_LOGS_KEY, params],
    queryFn: async (): Promise<Paginated<AuditLogEntry>> => {
      try {
        const res = await api.get<ListEnvelope<AuditLogEntry>>('/v1/admin/audit-logs', {
          params,
        });
        return { data: res.data.data, meta: res.data.meta };
      } catch (err) {
        throw toApiError(err);
      }
    },
    enabled,
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
  });
}
