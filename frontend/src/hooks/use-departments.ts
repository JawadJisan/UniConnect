'use client';

import { useQuery } from '@tanstack/react-query';
import type { Department } from '@uniconnect/shared';
import { api, toApiError } from '@/lib/api';

/** GET /api/v1/departments (public). Shares its cache key with the registration form. */
export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      try {
        return (await api.get<{ data: Department[] }>('/v1/departments')).data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    staleTime: 5 * 60_000,
  });
}
