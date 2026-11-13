'use client';

import type { MyRegistration } from '@uniconnect/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RegistrationStatusBadge } from '@/components/event-status-badge';
import { DataTable, dataColumns } from '@/components/data-table';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyRegistrations } from '@/hooks/use-events';
import { formatDateTime, formatEventWhen } from '@/lib/events';
import { Pager } from '../../../_components/list-controls';
import { EVENTS_HREF } from '../../../_components/nav';
import { useProfile } from '../../../_components/require-session';
import { EventsNoAccess } from './shared';

type When = 'upcoming' | 'past';
const WHEN_LABEL: Record<When, string> = { upcoming: 'Upcoming', past: 'Past' };

const col = dataColumns<MyRegistration>();
const columns = [
  col.display({
    id: 'event',
    header: () => <span className="micro-label">Event</span>,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={`/dashboard/events/${row.original.event.id}`} className="link truncate">
          {row.original.event.title}
        </Link>
        <span className="truncate font-mono text-xs text-fg-tertiary">
          {row.original.event.organizer_club.name}
        </span>
      </div>
    ),
  }),
  col.display({
    id: 'when',
    header: () => <span className="micro-label">When</span>,
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">
        {formatEventWhen(row.original.event.start_date, row.original.event.end_date)}
      </span>
    ),
    meta: { className: 'hidden sm:table-cell' },
  }),
  col.display({
    id: 'venue',
    header: () => <span className="micro-label">Venue</span>,
    cell: ({ row }) =>
      row.original.event.venue ?? <span className="text-fg-tertiary">To be announced</span>,
    meta: { className: 'hidden md:table-cell' },
  }),
  col.display({
    id: 'status',
    header: () => <span className="micro-label">Status</span>,
    cell: ({ row }) => <RegistrationStatusBadge status={row.original.status} />,
  }),
  col.display({
    id: 'registered',
    header: () => <span className="micro-label">Registered</span>,
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">
        {formatDateTime(row.original.registered_at)}
      </span>
    ),
    meta: { className: 'hidden lg:table-cell' },
  }),
];

/** /dashboard/events/my-registrations (PRD FR-EVENT-009): every registration, any status. */
export function MyRegistrationsView() {
  const profile = useProfile();
  if (profile.role === 'super_admin') {
    return <EventsNoAccess reason="Super admins don't register for events." />;
  }
  return <MyRegistrationsList />;
}

function MyRegistrationsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const when: When = searchParams.get('when') === 'past' ? 'past' : 'upcoming';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const regs = useMyRegistrations({ when, page });

  function navigate(next: { when?: When; page?: number }) {
    const q = new URLSearchParams();
    const nextWhen = next.when ?? when;
    if (nextWhen === 'past') q.set('when', 'past');
    // A new tab starts at page 1.
    const nextPage = next.when ? 1 : (next.page ?? page);
    if (nextPage > 1) q.set('page', String(nextPage));
    const query = q.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display-sm">My registrations</h1>
        <p className="text-sm text-fg-secondary">
          Events you registered for. Cancel a registration from the event page before it starts.
        </p>
      </header>

      <div role="group" aria-label="Which events" className="flex gap-1">
        {(['upcoming', 'past'] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={when === value}
            onClick={() => navigate({ when: value })}
            className="aria-pressed:bg-surface-3 aria-pressed:text-foreground"
          >
            {WHEN_LABEL[value]}
          </Button>
        ))}
      </div>

      {regs.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Loading registrations…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      ) : regs.isError ? (
        <ErrorState
          title="Couldn't load your registrations."
          onRetry={() => void regs.refetch()}
          retrying={regs.isFetching}
        />
      ) : regs.data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <p className="text-md font-medium">
            {when === 'upcoming' ? 'No upcoming registrations' : 'No past registrations'}
          </p>
          <p className="text-sm text-fg-secondary">
            Events you register for appear here, with whether you attended.
          </p>
          <Link href={EVENTS_HREF} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Browse events
          </Link>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={regs.data.data}
          caption={`${WHEN_LABEL[when]} registrations`}
          getRowId={(r) => String(r.id)}
          stale={regs.isPlaceholderData}
          footer={() => <Pager meta={regs.data.meta} onPage={(p) => navigate({ page: p })} />}
        />
      )}
    </div>
  );
}
