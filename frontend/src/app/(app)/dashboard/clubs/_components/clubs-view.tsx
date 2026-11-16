'use client';

import { m } from 'motion/react';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useClubs } from '@/hooks/use-clubs';
import { duration, ease } from '@/lib/motion';
import { useProfile } from '../../../_components/require-session';
import { ClubCard } from './club-card';

const list = { show: { transition: { staggerChildren: 0.04 } } };
const item = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } },
};

/** The club directory (PRD FR-CLUB-004): every club, one per department. */
export function ClubsView() {
  const profile = useProfile();
  const clubs = useClubs();

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-sm">Clubs</h1>
        <p className="text-sm text-fg-secondary">
          Every department has one club. Open a club to see its committee and fees.
        </p>
      </header>

      {clubs.isPending ? (
        <div aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <span className="sr-only">Loading clubs…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : clubs.isError ? (
        <ErrorState
          title="Couldn't load the clubs."
          onRetry={() => void clubs.refetch()}
          retrying={clubs.isFetching}
        />
      ) : clubs.data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <p className="text-md font-medium">No clubs yet</p>
          <p className="text-sm text-fg-secondary">
            Each department&apos;s club appears here once it has been set up.
          </p>
        </div>
      ) : (
        <>
          <m.ul
            initial="hidden"
            animate="show"
            variants={list}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {clubs.data.data.map((club) => (
              <m.li key={club.id} variants={item} className="min-w-0">
                <ClubCard club={club} own={club.department.id === profile.department?.id} />
              </m.li>
            ))}
          </m.ul>
          <p className="font-mono text-xs text-fg-tertiary tabular-nums">
            {clubs.data.meta.total} {clubs.data.meta.total === 1 ? 'club' : 'clubs'}
          </p>
        </>
      )}
    </div>
  );
}
