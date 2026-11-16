'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { useMySessions, useRevokeOtherSessions } from '@/hooks/use-me';
import type { ApiError } from '@/lib/api';
import { Panel } from '../../../_components/panel';

/**
 * "Log out of all devices" (PRD FR-AUTH-005.4). Shows only a count of other sessions, so no
 * session token reaches the browser, and signs every other device out at once.
 */
export function SessionsCard() {
  const sessions = useMySessions();
  const revoke = useRevokeOtherSessions();
  const others = sessions.data?.other_sessions ?? 0;

  async function run() {
    try {
      await revoke.mutateAsync();
      toast.success('Signed out of your other devices.', {
        description: 'This device stays signed in.',
      });
    } catch (err) {
      const e = err as ApiError;
      toast.error(
        e.status === 429
          ? 'Too many attempts. Wait a minute, then try again.'
          : "Couldn't sign them out. Try again.",
      );
    }
  }

  return (
    <Panel
      id="sessions-title"
      title="Devices"
      tag="SYS.PROFILE.SESSIONS"
      description="Sessions last 7 days and renew while you use them."
      footer={
        <Button
          variant="secondary"
          onClick={run}
          disabled={sessions.isPending || sessions.isError || others === 0 || revoke.isPending}
        >
          {revoke.isPending ? 'Signing out…' : 'Sign out other devices'}
        </Button>
      }
    >
      {sessions.isPending ? (
        <Skeleton className="h-5 w-56" />
      ) : sessions.isError ? (
        <p className="text-sm text-fg-secondary">
          Couldn&apos;t check your other devices.{' '}
          <button
            type="button"
            onClick={() => void sessions.refetch()}
            className="text-brand-text underline-offset-4 hover:underline"
          >
            Try again
          </button>
        </p>
      ) : (
        <p className="text-sm text-foreground" aria-live="polite">
          {others === 0
            ? 'Only this device is signed in.'
            : `Signed in on this device and ${others} other ${others === 1 ? 'device' : 'devices'}.`}
        </p>
      )}
    </Panel>
  );
}
