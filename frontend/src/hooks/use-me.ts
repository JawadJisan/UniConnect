'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AVATAR_FIELD, type UpdateProfileInput, type UserProfile } from '@uniconnect/shared';
import { api, toApiError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

export const ME_KEY = ['me'] as const;

interface Envelope<T> {
  data: T;
}

async function fetchMe(): Promise<UserProfile> {
  try {
    return (await api.get<Envelope<UserProfile>>('/v1/users/me')).data.data;
  } catch (err) {
    throw toApiError(err);
  }
}

/** The signed-in user's profile (GET /api/v1/users/me). Errors are ApiErrors. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    // A 401 or 403 won't fix itself on retry; the guard handles both.
    retry: (count, err) => {
      const status = (err as { status?: number }).status ?? 0;
      return status >= 500 && count < 1;
    },
  });
}

/** PATCH /api/v1/users/me. The response replaces the cached profile. */
export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<Record<keyof UpdateProfileInput, unknown>>) => {
      try {
        return (await api.patch<Envelope<UserProfile>>('/v1/users/me', body)).data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (profile) => client.setQueryData(ME_KEY, profile),
  });
}

/** PATCH /api/v1/users/me/avatar with one image file. */
export function useUploadAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append(AVATAR_FIELD, file);
      try {
        return (await api.patch<Envelope<UserProfile>>('/v1/users/me/avatar', form)).data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (profile) => client.setQueryData(ME_KEY, profile),
  });
}

/**
 * Better Auth's POST /api/auth/change-password (PRD FR-USER-004). The server always signs out
 * the user's other sessions.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      const { error } = await authClient.changePassword(body);
      if (error) throw toApiError(error);
    },
  });
}
