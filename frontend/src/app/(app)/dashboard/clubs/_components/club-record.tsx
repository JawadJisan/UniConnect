'use client';

import type { ClubDetail } from '@uniconnect/shared';
import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { canEditClub } from '@/lib/club-access';
import { formatDate } from '@/lib/format';
import { CLUBS_HREF } from '../../../_components/nav';
import { Panel } from '../../../_components/panel';
import { useProfile } from '../../../_components/require-session';
import { Fee } from './club-card';
import { ClubEditForm } from './club-edit-form';
import { ClubLogo } from './club-logo';
import { ClubLogoUpload } from './club-logo-upload';
import { CommitteePanel } from './committee-panel';

export function BackToClubs() {
  return (
    <Link
      href={CLUBS_HREF}
      className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 w-fit' })}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      All clubs
    </Link>
  );
}

/** Page frame shared by the club page, my club, and their loading and error states. */
export function ClubPage({ children }: { children: ReactNode }) {
  return <div className="container-wide flex flex-col gap-6 py-8">{children}</div>;
}

export function ClubRecordSkeleton() {
  return (
    <ClubPage>
      <div aria-busy="true" className="flex flex-col gap-6">
        <span className="sr-only">Loading club…</span>
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-lg" />
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        </div>
      </div>
    </ClubPage>
  );
}

/**
 * One club (PRD FR-CLUB-001/002), in the record layout: a sticky read-only About cell on the
 * left, the committee and, for the club's editors only, the edit and logo panels on the right.
 */
export function ClubRecord({ club }: { club: ClubDetail }) {
  const profile = useProfile();
  const editable = canEditClub(profile, club);
  const own = profile.department?.id === club.department.id;

  return (
    <ClubPage>
      <div className="flex flex-col gap-3">
        <BackToClubs />
        <header className="flex min-w-0 items-center gap-4">
          <ClubLogo name={club.name} src={club.logo_url} size={48} />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate text-display-sm">{club.name}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
              <span>{club.department.name} department</span>
              {own ? <Badge variant="secondary">Your department</Badge> : null}
            </p>
          </div>
        </header>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-16">
          <Panel id="club-about-title" title="About" tag="SYS.CLUB">
            <div className="flex flex-col gap-4 text-sm">
              <p className="whitespace-pre-line text-fg-secondary">
                {club.description ?? <span className="text-fg-tertiary">No description yet.</span>}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
                <dt className="micro-label self-center">FEE.MONTHLY</dt>
                <dd>
                  <Fee amount={club.membership_fee_monthly} />
                </dd>
                <dt className="micro-label self-center">FEE.YEARLY</dt>
                <dd>
                  <Fee amount={club.membership_fee_yearly} />
                </dd>
                <dt className="text-fg-tertiary">Department</dt>
                <dd className="text-foreground">{club.department.name}</dd>
                <dt className="text-fg-tertiary">Updated</dt>
                <dd className="font-mono text-foreground tabular-nums">
                  {formatDate(club.updated_at)}
                </dd>
              </dl>
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <CommitteePanel club={club} editable={editable} />
          {editable ? (
            <>
              {/* Keyed by the update time, so a saved change resets the form's baseline. */}
              <ClubEditForm key={club.updated_at} club={club} />
              <ClubLogoUpload club={club} />
            </>
          ) : null}
        </div>
      </div>
    </ClubPage>
  );
}
