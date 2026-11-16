import type { EventSummary } from '@uniconnect/shared';
import Link from 'next/link';
import { EventStatusBadge } from '@/components/event-status-badge';
import { Badge } from '@/components/ui/badge';
import { formatEventWhen, isFull, seatsText } from '@/lib/events';
import { EventFee, EventPoster } from './shared';

const MAX_DEPARTMENT_TAGS = 3;

/** One browse cell: the whole card is a link to the event (DESIGN.md "Event card"). */
export function EventCard({ event }: { event: EventSummary }) {
  const extra = event.departments.length - MAX_DEPARTMENT_TAGS;
  const full = isFull(event.registered_count, event.max_attendees);
  return (
    <Link
      href={`/dashboard/events/${event.id}`}
      className="group/event flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors duration-(--duration-fast) hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      <EventPoster
        event={event}
        className="border-b border-border"
        sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
      />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <h2 className="line-clamp-2 text-md leading-snug font-medium tracking-tight">
              {event.title}
            </h2>
            {event.status !== 'published' ? <EventStatusBadge status={event.status} /> : null}
          </div>
          <p className="micro-label truncate">{event.organizer_club.name}</p>
        </div>

        <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
          <dt className="micro-label self-center">WHEN</dt>
          <dd className="font-mono text-foreground tabular-nums">
            {formatEventWhen(event.start_date, event.end_date)}
          </dd>
          <dt className="micro-label self-center">VENUE</dt>
          <dd className="truncate text-foreground">
            {event.venue ?? <span className="text-fg-tertiary">To be announced</span>}
          </dd>
          <dt className="micro-label self-center">SEATS</dt>
          <dd className="flex items-center gap-2">
            <span className="font-mono text-foreground tabular-nums">
              {seatsText(event.registered_count, event.max_attendees)}
            </span>
            {full ? <Badge variant="warning">Full</Badge> : null}
          </dd>
          <dt className="micro-label self-center">FEE</dt>
          <dd>
            <EventFee event={event} />
          </dd>
        </dl>

        <ul aria-label="Departments" className="flex flex-wrap gap-1.5">
          {event.visibility === 'members_only' ? (
            <li>
              <Badge variant="secondary">Members only</Badge>
            </li>
          ) : null}
          {event.departments.slice(0, MAX_DEPARTMENT_TAGS).map((d) => (
            <li key={d.id}>
              <Badge variant="outline">{d.name}</Badge>
            </li>
          ))}
          {extra > 0 ? (
            <li>
              <Badge variant="outline">+{extra}</Badge>
            </li>
          ) : null}
        </ul>
      </div>
    </Link>
  );
}
