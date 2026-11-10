'use client';

import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/ui/error-state';
import { useClub } from '@/hooks/use-clubs';
import type { ApiError } from '@/lib/api';
import { BackToClubs, ClubPage, ClubRecord, ClubRecordSkeleton } from './club-record';

/** /dashboard/clubs/[id] (PRD FR-CLUB-001). Any signed-in user may view any club. */
export function ClubDetailView() {
  const { id } = useParams<{ id: string }>();
  const clubId = Number(id);
  const valid = Number.isInteger(clubId) && clubId > 0;
  // A malformed id never reaches the API; it reads as "doesn't exist".
  if (!valid) return <ClubLoadError status={404} />;
  return <ClubById id={clubId} />;
}

function ClubById({ id }: { id: number }) {
  const club = useClub(id);
  if (club.isPending) return <ClubRecordSkeleton />;
  if (club.isError) {
    return (
      <ClubLoadError
        status={(club.error as ApiError).status}
        onRetry={() => void club.refetch()}
        retrying={club.isFetching}
      />
    );
  }
  return <ClubRecord club={club.data} />;
}

function ClubLoadError({
  status,
  onRetry,
  retrying,
}: {
  status: number;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const missing = status === 404 || status === 400;
  return (
    <ClubPage>
      <BackToClubs />
      <ErrorState
        title={missing ? "This club doesn't exist." : "Couldn't load this club."}
        onRetry={!missing && (status >= 500 || status === 0) ? onRetry : undefined}
        retrying={retrying}
      />
    </ClubPage>
  );
}
