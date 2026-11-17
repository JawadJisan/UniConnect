'use client';

import { useEffect } from 'react';
import { pageTitle } from '@/lib/site';

/**
 * Names the tab after the record a page shows ("Spring Fest — UniConnect") once its query has
 * loaded. Until then the route's own metadata title stands ("Event — UniConnect"). Detail
 * pages read their id on the client behind the session guard (D25), so the server can't know
 * the name (D50).
 *
 * On unmount the previous title comes back only if the tab still shows ours, so a title that
 * Next has already set for the next route is never overwritten.
 */
export function useDocumentTitle(name: string | null | undefined) {
  useEffect(() => {
    if (!name) return;
    const previous = document.title;
    const ours = pageTitle(name);
    document.title = ours;
    return () => {
      if (document.title === ours) document.title = previous;
    };
  }, [name]);
}
