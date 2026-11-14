'use client';

import type { PersonalDashboard, UserProfile } from '@uniconnect/shared';
import Link from 'next/link';
import { BloodGroupBadge } from '@/components/blood-badges';
import { MembershipStatusBadge } from '@/components/membership-status-badge';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { usePersonalDashboard } from '@/hooks/use-dashboard';
import { scopeLabel } from '@/lib/announcements';
import { daysLeftTone } from '@/lib/dashboard';
import { formatEventWhen } from '@/lib/events';
import { formatDate, formatRelative } from '@/lib/format';
import { formatDaysLeft, PLAN_LABEL } from '@/lib/membership';
import {
  ANNOUNCEMENTS_HREF,
  BLOOD_HREF,
  EVENTS_HREF,
  MEMBERSHIPS_HREF,
} from '../../_components/nav';
import { Panel } from '../../_components/panel';
import { EmptyLine, SectionError, SectionHeading, SectionSkeleton } from './section-state';

/**
 * FR-DASH-001, the personal view: every student and faculty account, whatever its role (D13).
 * Membership is for students only; the API sends `membership: null` for faculty.
 */
export function PersonalSection({ profile, stacked }: { profile: UserProfile; stacked: boolean }) {
  const view = usePersonalDashboard();
  return (
    <section aria-labelledby="dash-personal" className="flex flex-col gap-4">
      <SectionHeading
        id="dash-personal"
        title={stacked ? 'For you' : 'Your campus'}
        tag="SYS.DASH.PERSONAL"
        description={
          stacked
            ? 'What a student or faculty member sees: your own events, posts and requests.'
            : undefined
        }
      />
      {view.isPending ? (
        <SectionSkeleton label="Loading your overview…" />
      ) : view.isError ? (
        <SectionError
          title="Couldn't load your overview."
          onRetry={() => void view.refetch()}
          retrying={view.isFetching}
        />
      ) : (
        <PersonalPanels data={view.data} profile={profile} />
      )}
    </section>
  );
}

function PersonalPanels({ data, profile }: { data: PersonalDashboard; profile: UserProfile }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {data.membership ? <MembershipPanel membership={data.membership} /> : null}

      <Panel
        id="dash-events"
        title="Upcoming events"
        tag="SYS.DASH.EVENTS"
        className={data.membership ? undefined : 'lg:col-span-2'}
        footer={
          <Link href={EVENTS_HREF} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Browse events
          </Link>
        }
      >
        {data.upcoming_events.length === 0 ? (
          <EmptyLine>No upcoming events you can see yet.</EmptyLine>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.upcoming_events.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                <Link
                  href={`${EVENTS_HREF}/${e.id}`}
                  className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
                >
                  {e.title}
                </Link>
                <span className="truncate text-sm text-fg-tertiary">
                  <span className="font-mono tabular-nums">
                    {formatEventWhen(e.start_date, e.end_date)}
                  </span>
                  {' · '}
                  {e.organizer_club.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id="dash-announcements"
        title="Latest announcements"
        tag="SYS.DASH.POSTS"
        footer={
          <Link
            href={ANNOUNCEMENTS_HREF}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            All announcements
          </Link>
        }
      >
        {data.announcements.length === 0 ? (
          <EmptyLine>No announcements for you yet.</EmptyLine>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.announcements.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{a.title}</span>
                  {a.is_pinned ? (
                    <Badge variant="secondary" className="shrink-0 uppercase">
                      Pinned
                    </Badge>
                  ) : null}
                </span>
                <span className="truncate text-sm text-fg-tertiary">
                  {scopeLabel(a)} · {formatRelative(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id="dash-blood"
        title="Blood requests for your group"
        tag="SYS.DASH.BLOOD"
        footer={
          <Link href={BLOOD_HREF} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Open blood donation
          </Link>
        }
      >
        {!profile.blood_group ? (
          <EmptyLine>
            Add your blood group on your{' '}
            <Link
              href="/dashboard/profile"
              className="text-foreground underline underline-offset-4"
            >
              profile
            </Link>{' '}
            to see requests you can answer.
          </EmptyLine>
        ) : data.blood_requests.length === 0 ? (
          <EmptyLine>No open requests for your blood group right now.</EmptyLine>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.blood_requests.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <BloodGroupBadge group={r.blood_group} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm text-foreground">
                    {r.units_needed} {r.units_needed === 1 ? 'unit' : 'units'} at {r.hospital_name}
                  </span>
                  <span className="text-sm text-fg-tertiary">
                    Needed by{' '}
                    <span className="font-mono tabular-nums">{formatDate(r.required_by_date)}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function MembershipPanel({
  membership,
}: {
  membership: NonNullable<PersonalDashboard['membership']>;
}) {
  const { current, scheduled, days_left } = membership;
  return (
    <Panel
      id="dash-membership"
      title="Club membership"
      tag="SYS.DASH.MEMBER"
      footer={
        <Link
          href={MEMBERSHIPS_HREF}
          className={buttonVariants({ variant: current ? 'ghost' : 'default', size: 'sm' })}
        >
          {current ? 'Manage membership' : 'Become a member'}
        </Link>
      }
    >
      {current ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{current.club.name}</span>
            <MembershipStatusBadge status={current.status} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-fg-tertiary">Plan</dt>
            <dd className="text-foreground">{PLAN_LABEL[current.type]}</dd>
            <dt className="text-fg-tertiary">Ends</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-foreground tabular-nums">
                {formatDate(current.end_date)}
              </span>
              {days_left !== null ? (
                <Badge variant={daysLeftTone(days_left)}>
                  {formatDaysLeft(days_left)}
                  {days_left > 0 ? ' left' : ''}
                </Badge>
              ) : null}
            </dd>
            {scheduled ? (
              <>
                <dt className="text-fg-tertiary">Renewal</dt>
                <dd className="text-foreground">
                  Starts{' '}
                  <span className="font-mono tabular-nums">{formatDate(scheduled.start_date)}</span>
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : (
        <EmptyLine>
          You don&apos;t have an active club membership. Members join members-only events and club
          announcements.
        </EmptyLine>
      )}
    </Panel>
  );
}
