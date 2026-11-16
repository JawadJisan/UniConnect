'use client';

import type { EventDetail } from '@uniconnect/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EventStatusBadge } from '@/components/event-status-badge';
import { ImageDropZone } from '@/components/image-drop-zone';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvent, useUploadEventPoster } from '@/hooks/use-events';
import type { ApiError } from '@/lib/api';
import { formatEventWhen, isFull, seatsText, VISIBILITY_LABEL } from '@/lib/events';
import { Panel } from '../../../_components/panel';
import { useProfile } from '../../../_components/require-session';
import { ManagePanel } from './manage-panel';
import { RegistrationPanel } from './registration-panel';
import { BackLink, EventFee, EventPoster, EventsPage, parseId } from './shared';

/** /dashboard/events/[id] (PRD FR-EVENT-006/007). 404 for an event the caller can't see. */
export function EventDetailView() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseId(id);
  // A malformed id never reaches the API; it reads as "doesn't exist".
  if (eventId === null) return <EventLoadError status={404} />;
  return <EventById id={eventId} />;
}

function EventById({ id }: { id: number }) {
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
  return <EventRecord event={event.data} />;
}

export function EventLoadError({
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
    <EventsPage>
      <BackLink />
      <ErrorState
        title={
          missing
            ? "This event doesn't exist, or it isn't open to you."
            : "Couldn't load this event."
        }
        onRetry={!missing && (status >= 500 || status === 0) ? onRetry : undefined}
        retrying={retrying}
      />
    </EventsPage>
  );
}

export function EventRecordSkeleton() {
  return (
    <EventsPage>
      <div aria-busy="true" className="flex flex-col gap-6">
        <span className="sr-only">Loading event…</span>
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-48 rounded-xl lg:col-span-2" />
        </div>
      </div>
    </EventsPage>
  );
}

/**
 * One event in the record layout: a sticky read-only cell on the left, then registration and,
 * for its organizers only, the manage and poster panels on the right.
 */
export function EventRecord({ event }: { event: EventDetail }) {
  const profile = useProfile();
  const posterEditable =
    event.can_manage && (event.status === 'draft' || event.status === 'published');

  return (
    <EventsPage>
      <div className="flex flex-col gap-3">
        <BackLink />
        <header className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 text-display-sm break-words">{event.title}</h1>
            {event.status !== 'published' ? <EventStatusBadge status={event.status} /> : null}
          </div>
          <p className="text-sm text-fg-secondary">
            By{' '}
            <Link href={`/dashboard/clubs/${event.organizer_club.id}`} className="link">
              {event.organizer_club.name}
            </Link>
          </p>
        </header>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-16">
          <Panel id="event-info-title" title="About" tag="SYS.EVENT.INFO">
            <div className="flex flex-col gap-4 text-sm">
              <EventPoster
                event={event}
                fit="contain"
                className="rounded-lg border border-border"
                sizes="(min-width: 1024px) 360px, 100vw"
              />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
                <dt className="micro-label self-center">WHEN</dt>
                <dd className="font-mono text-foreground tabular-nums">
                  {formatEventWhen(event.start_date, event.end_date)}
                </dd>
                <dt className="micro-label self-center">VENUE</dt>
                <dd className="text-foreground">
                  {event.venue ?? <span className="text-fg-tertiary">To be announced</span>}
                </dd>
                <dt className="micro-label self-center">SEATS</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono text-foreground tabular-nums">
                    {seatsText(event.registered_count, event.max_attendees)}
                  </span>
                  {isFull(event.registered_count, event.max_attendees) ? (
                    <Badge variant="warning">Full</Badge>
                  ) : null}
                </dd>
                <dt className="micro-label self-center">FEE</dt>
                <dd>
                  <EventFee event={event} />
                </dd>
                <dt className="micro-label self-center">ACCESS</dt>
                <dd className="text-foreground">{VISIBILITY_LABEL[event.visibility]}</dd>
              </dl>
              <div className="flex flex-col gap-2">
                <p className="micro-label">DEPARTMENTS</p>
                <ul aria-label="Participating departments" className="flex flex-wrap gap-1.5">
                  {event.departments.map((d) => (
                    <li key={d.id}>
                      <Badge variant={d.id === profile.department?.id ? 'secondary' : 'outline'}>
                        {d.name}
                      </Badge>
                    </li>
                  ))}
                </ul>
                {event.visibility === 'members_only' ? (
                  <p className="text-fg-tertiary">
                    Members only: open to people from these departments who hold an active
                    membership in one of their clubs.
                  </p>
                ) : null}
              </div>
              <p className="whitespace-pre-line text-fg-secondary">
                {event.description ?? <span className="text-fg-tertiary">No description yet.</span>}
              </p>
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {profile.role !== 'super_admin' ? <RegistrationPanel event={event} /> : null}
          {event.can_manage ? <ManagePanel event={event} /> : null}
          {posterEditable ? <PosterPanel event={event} /> : null}
        </div>
      </div>
    </EventsPage>
  );
}

/** The poster (PRD FR-EVENT-002): uploaded to Cloudinary, never set from a typed URL. */
function PosterPanel({ event }: { event: EventDetail }) {
  const upload = useUploadEventPoster(event.id);
  return (
    <Panel
      id="event-poster-title"
      title="Poster"
      tag="SYS.EVENT.POSTER"
      description="Shown on the event card and this page."
    >
      <ImageDropZone
        current={event.poster_image_url}
        fallback={<span className="font-mono text-fg-tertiary">No poster</span>}
        upload={(file) => upload.mutateAsync(file)}
        busy={upload.isPending}
        noun="poster"
        changeLabel="Change the event poster"
        note="Fitted inside 1600 px, never cropped."
        successMessage="Poster updated."
        fit="contain"
      />
    </Panel>
  );
}
