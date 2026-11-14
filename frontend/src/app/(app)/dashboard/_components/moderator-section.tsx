'use client';

import type { EventRegistrationStatus, ModeratorDashboard } from '@uniconnect/shared';
import Link from 'next/link';
import { useMemo } from 'react';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { RegistrationStatusBadge } from '@/components/event-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { useModeratorDashboard } from '@/hooks/use-dashboard';
import { formatEventWhen, formatDateTime } from '@/lib/events';
import { CLUBS_HREF, EVENTS_HREF, NEW_EVENT_HREF } from '../../_components/nav';
import { Panel } from '../../_components/panel';
import { CommitteeList } from './committee-list';
import { EmptyLine, SectionError, SectionHeading, SectionSkeleton } from './section-state';
import { StatRow, StatTile } from './stat-tile';

/** FR-DASH-002: the club where the moderator holds a current committee seat. */
export function ModeratorSection() {
  const view = useModeratorDashboard();
  return (
    <section aria-labelledby="dash-moderator" className="flex flex-col gap-4">
      <SectionHeading
        id="dash-moderator"
        title={view.data?.kind === 'ok' ? view.data.data.club.name : 'Your club'}
        tag="SYS.DASH.MOD"
        description="The club you run as a committee member."
      />
      {view.isPending ? (
        <SectionSkeleton label="Loading your club…" />
      ) : view.isError ? (
        <SectionError
          title="Couldn't load your club's figures."
          onRetry={() => void view.refetch()}
          retrying={view.isFetching}
        />
      ) : view.data.kind === 'no_seat' ? (
        <FormAlert
          tone="info"
          title="You don't hold a committee seat right now."
          className="max-w-2xl"
        >
          Club figures appear here while you have a current seat. Your department admin assigns
          committee members on the club page.
        </FormAlert>
      ) : (
        <ModeratorPanels data={view.data.data} />
      )}
    </section>
  );
}

type Registration = ModeratorDashboard['recent_registrations'][number];

function ModeratorPanels({ data }: { data: ModeratorDashboard }) {
  const columns = useMemo(() => registrationColumns(), []);
  return (
    <div className="flex flex-col gap-4">
      <StatRow>
        <StatTile
          index={0}
          label="Upcoming events"
          value={data.stats.upcoming_events}
          note="Published, not started"
          href={`${EVENTS_HREF}?club_id=${data.club.id}&status=upcoming`}
        />
        <StatTile
          index={1}
          label="Registrations"
          value={data.stats.upcoming_registrations}
          note="Across upcoming events"
        />
        <StatTile
          index={2}
          label="Active members"
          value={data.stats.active_members}
          note="Membership not yet ended"
        />
        <StatTile
          index={3}
          label="Drafts"
          value={data.drafts.length}
          note={data.drafts.length ? 'Waiting to publish' : 'Nothing waiting'}
          attention={data.drafts.length > 0}
        />
      </StatRow>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel
          id="dash-drafts"
          title="Drafts to publish"
          tag="SYS.DASH.DRAFTS"
          footer={
            <Link
              href={NEW_EVENT_HREF}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              New event
            </Link>
          }
        >
          {data.drafts.length === 0 ? (
            <EmptyLine>No drafts. New events start as drafts until you publish them.</EmptyLine>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {data.drafts.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                  <Link
                    href={`${EVENTS_HREF}/${e.id}`}
                    className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {e.title}
                  </Link>
                  <span className="font-mono text-sm text-fg-tertiary tabular-nums">
                    {formatEventWhen(e.start_date, e.end_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          id="dash-registrations"
          title="Recent registrations"
          tag="SYS.DASH.REG"
          className="lg:col-span-2"
        >
          {data.recent_registrations.length === 0 ? (
            <EmptyLine>No registrations for your club&apos;s events yet.</EmptyLine>
          ) : (
            <DataTable
              columns={columns}
              data={data.recent_registrations}
              caption="Recent registrations, newest first"
              getRowId={(r) => String(r.id)}
            />
          )}
        </Panel>

        <Panel
          id="dash-committee"
          title="Committee"
          tag="SYS.DASH.COMMITTEE"
          className="lg:col-span-3"
          footer={
            <Link
              href={`${CLUBS_HREF}/${data.club.id}`}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              Open club page
            </Link>
          }
        >
          <CommitteeList entries={data.committee} />
        </Panel>
      </div>
    </div>
  );
}

function registrationColumns(): DataColumn<Registration>[] {
  const col = dataColumns<Registration>();
  return [
    col.display({
      id: 'person',
      header: 'Person',
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.original.user.name}</span>
          {row.original.user.student_id ? (
            <span className="truncate font-mono text-xs text-fg-tertiary">
              {row.original.user.student_id}
            </span>
          ) : null}
        </span>
      ),
    }),
    col.display({
      id: 'event',
      header: 'Event',
      cell: ({ row }) => (
        <Link
          href={`${EVENTS_HREF}/${row.original.event.id}/registrations`}
          className="truncate underline-offset-4 hover:underline focus-visible:underline"
        >
          {row.original.event.title}
        </Link>
      ),
      meta: { className: 'hidden sm:table-cell max-w-[16rem] truncate' },
    }),
    col.display({
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <RegistrationStatusBadge status={row.original.status as EventRegistrationStatus} />
      ),
    }),
    col.display({
      id: 'when',
      header: 'Registered',
      cell: ({ row }) => (
        <span className="font-mono text-fg-secondary tabular-nums">
          {formatDateTime(row.original.registered_at)}
        </span>
      ),
      meta: { className: 'hidden md:table-cell text-right' },
    }),
  ];
}
