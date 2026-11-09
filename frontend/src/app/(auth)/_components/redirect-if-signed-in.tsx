'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/safe-next';

/**
 * Someone already signed in has nothing to do on the auth pages: send them where `?next=`
 * asks (same-origin only) or to the dashboard. This also fires the moment a login succeeds,
 * so it must agree with the login view's own redirect, or the two race. The query string is
 * read from `window.location` because this sits in the layout, outside any Suspense boundary
 * that `useSearchParams` would need.
 */
export function RedirectIfSignedIn() {
  const router = useRouter();
  const { data } = authClient.useSession();

  useEffect(() => {
    if (!data?.session) return;
    const next = new URLSearchParams(window.location.search).get('next');
    router.replace(safeNext(next));
  }, [data, router]);

  return null;
}
