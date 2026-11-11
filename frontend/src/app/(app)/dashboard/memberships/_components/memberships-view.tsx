'use client';

import type { ClubDetail, MembershipSummary } from '@uniconnect/shared';
import { m } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { useMyClub } from '@/hooks/use-clubs';
import { useMyMemberships } from '@/hooks/use-memberships';
import type { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { currentMembership } from '@/lib/membership';
import { duration } from '@/lib/motion';
import { CLUBS_HREF } from '../../../_components/nav';
import { useProfile } from '../../../_components/require-session';
import { MembershipHistory } from './membership-history';
import { MembershipStatusCard } from './membership-status-card';

/** How long the page keeps polling for a confirmed payment after a checkout returns. */
const POLL_FOR_MS = 30_000;

type CheckoutResult = 'success' | 'failed' | 'cancelled';

function checkoutParam(value: string | null): CheckoutResult | null {
  return value === 'success' || value === 'failed' || value === 'cancelled' ? value : null;
}

/**
 * /dashboard/memberships (PRD FR-MEM-001–004): the student's membership of their department's
 * club. Buying is about who someone is, so this is for `user_type` student, student moderators
 * included (PRD §5); the API answers 403 to anyone else.
 */
export function MembershipsView() {
  const profile = useProfile();
  if (profile.user_type !== 'student') {
    return (
      <Page>
        <FormAlert tone="info" title="Memberships are for students." className="max-w-xl">
          Club memberships are bought by student accounts. You can still browse every club.
          <Link
            href={CLUBS_HREF}
            className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
          >
            Browse all clubs
          </Link>
        </FormAlert>
      </Page>
    );
  }
  return <StudentMemberships />;
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <m.div
      className="container-wide flex flex-col gap-6 py-8"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base }}
    >
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display-sm">Membership</h1>
        <p className="text-sm text-fg-secondary">
          Your membership of your department&apos;s club, and every payment you&apos;ve made for it.
        </p>
      </header>
      {children}
    </m.div>
  );
}

function StudentMemberships() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const checkout = checkoutParam(searchParams.get('checkout'));

  const [polling, setPolling] = useState(checkout === 'success');
  useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(() => setPolling(false), POLL_FOR_MS);
    return () => clearTimeout(timer);
  }, [polling]);

  const club = useMyClub();
  const memberships = useMyMemberships({ pollWhilePending: polling });

  // A checkout that was pending when the page opened and has now settled gets a toast, and the
  // ?checkout= banner goes away: the list itself is the record.
  const watched = useRef<number | null>(null);
  useEffect(() => {
    if (checkout !== 'success' || !memberships.data) return;
    const pending = memberships.data.find((row) => row.status === 'pending');
    if (pending) {
      watched.current = pending.id;
      return;
    }
    const settled =
      watched.current === null
        ? memberships.data[0]
        : memberships.data.find((row) => row.id === watched.current);
    if (settled) announce(settled);
    // Dropping ?checkout= ends the banner; polling stops by itself with no pending row left.
    router.replace(pathname, { scroll: false });
  }, [checkout, memberships.data, pathname, router]);

  if (club.isPending || memberships.isPending) return <MembershipsSkeleton />;

  if (club.isError) {
    const err = club.error as ApiError;
    return (
      <Page>
        {err.code === 'CLUB_NOT_FOUND' ? (
          <FormAlert
            tone="info"
            title="Your department doesn't have a club yet."
            className="max-w-xl"
          >
            Memberships open once your department admin sets one up.
          </FormAlert>
        ) : (
          <ErrorState
            title="Couldn't load your club."
            onRetry={() => void club.refetch()}
            retrying={club.isFetching}
          />
        )}
      </Page>
    );
  }

  return (
    <Page>
      {checkout ? <CheckoutBanner result={checkout} /> : null}
      {memberships.isError ? (
        <ErrorState
          title="Couldn't load your memberships."
          onRetry={() => void memberships.refetch()}
          retrying={memberships.isFetching}
        />
      ) : (
        <Workspace club={club.data} memberships={memberships.data} />
      )}
    </Page>
  );
}

function Workspace({ club, memberships }: { club: ClubDetail; memberships: MembershipSummary[] }) {
  const state = currentMembership(memberships, club.id);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="lg:sticky lg:top-16">
        <MembershipStatusCard club={club} state={state} />
      </div>
      <MembershipHistory memberships={memberships} className="lg:col-span-2" club={club} />
    </div>
  );
}

function announce(row: MembershipSummary) {
  if (row.status === 'active') {
    toast.success(`You're a member of ${row.club.name}.`);
  } else if (row.status === 'scheduled') {
    toast.success('Renewal confirmed.', {
      description: `It starts on ${formatDate(row.start_date)}.`,
    });
  } else if (row.status === 'cancelled') {
    toast.error("The payment wasn't confirmed, so no membership was started.");
  }
}

/** The gateway's return page is display only: it never grants a membership (PRD FR-MEM-001). */
function CheckoutBanner({ result }: { result: CheckoutResult }) {
  if (result === 'success') {
    return (
      <FormAlert tone="info" title="Payment received." className="max-w-2xl">
        Your membership starts as soon as the payment gateway confirms it. This usually takes a few
        seconds.
      </FormAlert>
    );
  }
  return (
    <FormAlert
      tone={result === 'failed' ? 'error' : 'info'}
      title={result === 'failed' ? "The payment didn't go through." : 'Payment cancelled.'}
      className="max-w-2xl"
    >
      You haven&apos;t been charged. You can start a new checkout below.
    </FormAlert>
  );
}

function MembershipsSkeleton() {
  return (
    <div className="container-wide flex flex-col gap-6 py-8" aria-busy="true">
      <span className="sr-only">Loading your membership…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}
