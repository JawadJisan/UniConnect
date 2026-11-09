'use client';

import type { UserProfile } from '@uniconnect/shared';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormAlert } from '@/components/ui/form-alert';
import { useMe } from '@/hooks/use-me';
import type { ApiError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { loginUrlFor } from '@/lib/safe-next';
import { ShellSkeleton } from './shell-skeleton';

const ProfileContext = createContext<UserProfile | null>(null);
const SignOutContext = createContext<(() => Promise<void>) | null>(null);

/** The signed-in user's profile, inside RequireSession. */
export function useProfile(): UserProfile {
  const profile = use(ProfileContext);
  if (!profile) throw new Error('useProfile must be used inside RequireSession');
  return profile;
}

/**
 * Signs out and goes to the home page. The guard owns this so that, while it runs, the session
 * disappearing is not mistaken for a stale cookie and sent to the login page instead.
 */
export function useSignOut(): () => Promise<void> {
  const signOut = use(SignOutContext);
  if (!signOut) throw new Error('useSignOut must be used inside RequireSession');
  return signOut;
}

/**
 * Client guard for every signed-in page (docs/DECISIONS.md D25). proxy.ts has already sent
 * visitors without a session cookie to log in; this handles a cookie whose session is gone
 * or expired (401) and a suspended account (403), then hands the profile to the shell.
 */
export function RequireSession({ children }: { children: (profile: UserProfile) => ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const [leaving, setLeaving] = useState(false);
  const signedOut = !session.isPending && !session.data;
  const me = useMe();
  const status = (me.error as ApiError | null)?.status;

  useEffect(() => {
    if (leaving) return;
    if (signedOut || status === 401) router.replace(loginUrlFor(pathname));
  }, [leaving, signedOut, status, pathname, router]);

  const signOut = useCallback(async () => {
    setLeaving(true);
    await authClient.signOut();
    router.replace('/');
    // Nothing from this account may outlive the session in the cache.
    queryClient.clear();
  }, [queryClient, router]);

  if (status === 403) return <Suspended />;

  if (leaving) return <ShellSkeleton />;

  if (me.data && !signedOut) {
    return (
      <SignOutContext value={signOut}>
        <ProfileContext value={me.data}>{children(me.data)}</ProfileContext>
      </SignOutContext>
    );
  }

  if (me.isError && status !== 401) {
    return (
      <main className="container-narrow flex flex-1 items-start pt-16">
        <ErrorState
          title="Couldn't load your account."
          onRetry={() => void me.refetch()}
          retrying={me.isFetching}
        >
          {me.error.message}
        </ErrorState>
      </main>
    );
  }

  return <ShellSkeleton />;
}

function Suspended() {
  const router = useRouter();
  async function signOut() {
    await authClient.signOut();
    router.replace('/login');
  }
  return (
    <main className="container-narrow flex flex-1 items-start pt-16">
      <FormAlert tone="error" title="This account is suspended." className="max-w-xl">
        <p>Contact your department admin to restore access.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={signOut}>
          Sign out
        </Button>
      </FormAlert>
    </main>
  );
}
