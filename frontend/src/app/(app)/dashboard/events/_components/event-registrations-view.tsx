'use client';

import {
  EVENT_REGISTRATION_STATUSES,
  type EventDetail,
  type EventRegistration,
  type EventRegistrationStatus,
} from '@uniconnect/shared';
import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId } from 'react';
import { EventStatusBadge, RegistrationStatusBadge } from '@/components/event-status-badge';
import { DataTable, dataColumns } from '@/components/data-table';
import { Avatar } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import {
  registrationsCsvUrl,
  useCheckIn,
  useEvent,
  useEventRegistrations,
} from '@/hooks/use-events';
import type { ApiError } from '@/lib/api';
import { formatDateTime, formatEventWhen, REGISTRATION_STATUS_META, seatsText } from '@/lib/events';
import { FilterSelect, Pager } from '../../../_components/list-controls';
import { EventLoadError, EventRecordSkeleton } from './event-detail-view';
import { BackLink, EventsNoAccess, EventsPage, parseId } from './shared';

/** /dashboard/events/[id]/registrations (PRD FR-EVENT-010/011): organizers only. */
export function EventRegistrationsView() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseId(id);
  if (eventId === null) return <EventLoadError status={404} />;
  return <ForEvent id={eventId} />;
}

function ForEvent({ id }: { id: number }) {
  const event = useEvent(id);
  if (event.isPending) return <EventRecordSkeleton />;
  if (event.isError) {
    return (
      <EventLoadError
        status={(event.error as ApiError).status}
        onRetry={() => void event.refetch()}
        retrying={event.isFetching}
      />
    );
  }
  if (!event.data.can_manage) {
    return (
      <EventsNoAccess reason="Only this event's organizers can see who registered: its club committee, its department admin or a super admin." />
    );
  }
  return <Registrations event={event.data} />;
}

const isStatus = (v: string | null): v is EventRegistrationStatus =>
  v !== null && (EVENT_REGISTRATION_STATUSES as readonly string[]).includes(v);

function Registrations({ event }: { event: EventDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterId = useId();
  const rawStatus = searchParams.get('status');
  const status = isStatus(rawStatus) ? rawStatus : undefined;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const regs = useEventRegistrations(event.id, { status, page });
  const checkIn = useCheckIn(event.id);
  // Check-in is open on published events only (FR-EVENT-010).
  const canCheckIn = event.status === 'published';

  function navigate(next: { status?: string; page?: number }) {
    const q = new URLSearchParams();
    const nextStatus = 'status' in next ? next.status : status;
    if (nextStatus) q.set('status', nextStatus);
    const nextPage = 'status' in next ? 1 : (next.page ?? page);
    if (nextPage > 1) q.set('page', String(nextPage));
    const query = q.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function onCheckIn(reg: EventRegistration) {
    try {
      await checkIn.mutateAsync(reg.id);
      toast.success(`${reg.user.name} checked in.`);
    } catch (thrown) {
      const e = thrown as ApiError;
      toast.error(e.status >= 400 && e.status < 500 ? e.message : "Couldn't check in. Try again.");
    }
  }

  const col = dataColumns<EventRegistration>();
  const columns = [
    col.display({
      id: 'person',
      header: () => <span className="micro-label">Person</span>,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.original.user.name} src={row.original.user.avatar_url} size={28} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-foreground">{row.original.user.name}</span>
            {row.original.user.student_id ? (
              <span className="truncate font-mono text-xs text-fg-tertiary">
                {row.original.user.student_id}
              </span>
            ) : null}
          </div>
        </div>
      ),
    }),
    col.display({
      id: 'department',
      header: () => <span className="micro-label">Department</span>,
      cell: ({ row }) => row.original.user.department?.name ?? '—',
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
      meta: { className: 'hidden sm:table-cell' },
    }),
    col.display({
      id: 'checked_in',
      header: () => <span className="micro-label">Checked in</span>,
      cell: ({ row }) =>
        row.original.checked_in_at ? (
          <span className="font-mono text-xs tabular-nums">
            {formatDateTime(row.original.checked_in_at)}
          </span>
        ) : (
          <span className="text-fg-tertiary">—</span>
        ),
      meta: { className: 'hidden lg:table-cell' },
    }),
    col.display({
      id: 'action',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const reg = row.original;
        if (!canCheckIn || reg.status !== 'registered') return null;
        const busy = checkIn.isPending && checkIn.variables === reg.id;
        return (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-label={`Check in ${reg.user.name}`}
            onClick={() => void onCheckIn(reg)}
          >
            {busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            {busy ? 'Checking in…' : 'Check in'}
          </Button>
        );
      },
      meta: { className: 'text-right' },
    }),
  ];

  return (
    <EventsPage>
      <div className="flex flex-col gap-3">
        <BackLink href={`/dashboard/events/${event.id}`} label="Back to the event" />
        <header className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 text-display-sm break-words">{event.title}</h1>
            <EventStatusBadge status={event.status} />
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm text-fg-secondary tabular-nums">
            <span>{formatEventWhen(event.start_date, event.end_date)}</span>
            <span>SEATS {seatsText(event.registered_count, event.max_attendees)}</span>
          </p>
        </header>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-56">
          <FilterSelect
            id={`${filterId}-status`}
            label="Registration status"
            value={status ?? ''}
            onChange={(v) => navigate({ status: v || undefined })}
            options={EVENT_REGISTRATION_STATUSES.map((s) => [s, REGISTRATION_STATUS_META[s].label])}
            all="Any status"
          />
        </div>
        <a
          href={registrationsCsvUrl(event.id, status)}
          download
          className={buttonVariants({ variant: 'secondary' })}
        >
          <DownloadIcon data-icon="inline-start" />
          Download CSV
        </a>
      </div>

      {!canCheckIn ? (
        <p className="text-sm text-fg-tertiary">Check-in is open while the event is published.</p>
      ) : null}

      {regs.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Loading registrations…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      ) : regs.isError ? (
        <ErrorState
          title="Couldn't load the registrations."
          onRetry={() => void regs.refetch()}
          retrying={regs.isFetching}
        />
      ) : regs.data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <p className="text-md font-medium">
            {status ? 'No registrations with this status' : 'No registrations yet'}
          </p>
          <p className="text-sm text-fg-secondary">
            {status
              ? 'Choose another status to see the rest.'
              : 'People who register appear here, ready to check in.'}
          </p>
          {status ? (
            <Button variant="secondary" size="sm" onClick={() => navigate({ status: undefined })}>
              Clear filter
            </Button>
          ) : null}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={regs.data.data}
          caption={`Registrations for ${event.title}`}
          getRowId={(r) => String(r.id)}
          stale={regs.isPlaceholderData}
          footer={() => <Pager meta={regs.data.meta} onPage={(p) => navigate({ page: p })} />}
        />
      )}
    </EventsPage>
  );
}
