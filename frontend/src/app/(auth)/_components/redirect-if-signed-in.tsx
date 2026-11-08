'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { authClient } from '@/lib/auth-client';

/** Someone already signed in has nothing to do on the auth pages, so send them home. */
export function RedirectIfSignedIn() {
  const router = useRouter();
  const { data } = authClient.useSession();

  useEffect(() => {
    if (data?.session) router.replace('/');
  }, [data, router]);

  return null;
}
