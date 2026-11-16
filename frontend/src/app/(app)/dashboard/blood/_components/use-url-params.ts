'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export type Navigate = (next: Record<string, string | number | undefined>) => void;

/**
 * The URL holds the tab and every tab's filters (DESIGN.md "Admin list"; D41). `navigate`
 * merges keys into the query string; an empty or undefined value removes the key.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = new URLSearchParams(searchParams.toString());

  const navigate: Navigate = useCallback(
    (next) => {
      const merged = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === '') merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { search, navigate };
}
