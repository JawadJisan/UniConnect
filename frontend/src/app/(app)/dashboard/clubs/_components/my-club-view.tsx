'use client';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormAlert } from '@/components/ui/form-alert';
import { useMyClub } from '@/hooks/use-clubs';
import type { ApiError } from '@/lib/api';
import { CLUBS_HREF } from '../../../_components/nav';
import { ClubPage, ClubRecord, ClubRecordSkeleton } from './club-record';

/**
 * /dashboard/clubs/my-club (PRD FR-CLUB-002): the caller's department club. Super admins have
 * no department, so the API answers 404 NO_DEPARTMENT_CLUB; that is information, not an error.
 */
export function MyClubView() {
  const club = useMyClub();
  if (club.isPending) return <ClubRecordSkeleton />;
  if (club.isSuccess) return <ClubRecord club={club.data} />;

  const err = club.error as ApiError;
  if (err.code === 'NO_DEPARTMENT_CLUB' || err.code === 'CLUB_NOT_FOUND') {
    return (
      <ClubPage>
        <h1 className="text-display-sm">My club</h1>
        <FormAlert
          tone="info"
          title={
            err.code === 'NO_DEPARTMENT_CLUB'
              ? "Super admins don't belong to a department, so there's no club of your own."
              : "Your department doesn't have a club yet."
          }
          className="max-w-xl"
        >
          <Link
            href={CLUBS_HREF}
            className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
          >
            Browse all clubs
          </Link>
        </FormAlert>
      </ClubPage>
    );
  }

  return (
    <ClubPage>
      <h1 className="text-display-sm">My club</h1>
      <ErrorState
        title="Couldn't load your club."
        onRetry={err.status >= 500 || err.status === 0 ? () => void club.refetch() : undefined}
        retrying={club.isFetching}
      />
    </ClubPage>
  );
}
