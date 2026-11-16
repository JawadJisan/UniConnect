'use client';

import { useParams } from 'next/navigation';
import { FormAlert } from '@/components/ui/form-alert';
import { useEvent } from '@/hooks/use-events';
import type { ApiError } from '@/lib/api';
import { EventLoadError, EventRecordSkeleton } from './event-detail-view';
import { EventForm } from './event-form';
import { BackLink, EventsNoAccess, EventsPage, parseId } from './shared';

/** /dashboard/events/[id]/edit (PRD FR-EVENT-004): the event's organizers only. */
export function EditEventView() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseId(id);
  if (eventId === null) return <EventLoadError status={404} />;
  return <EditById id={eventId} />;
}

function EditById({ id }: { id: number }) {
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
  const data = event.data;
  if (!data.can_manage) {
    return (
      <EventsNoAccess reason="Only this event's organizers can edit it: its club committee, its department admin or a super admin." />
    );
  }
  const back = <BackLink href={`/dashboard/events/${data.id}`} label="Back to the event" />;
  if (data.status === 'cancelled' || data.status === 'completed') {
    return (
      <EventsPage narrow>
        {back}
        <FormAlert
          tone="info"
          title={`This event is ${data.status} and can no longer be edited.`}
        />
      </EventsPage>
    );
  }
  return (
    <EventsPage narrow>
      <div className="flex flex-col gap-3">
        {back}
        <header className="flex flex-col gap-1.5">
          <h1 className="text-display-sm break-words">Edit {data.title}</h1>
          <p className="text-sm text-fg-secondary">Change the poster from the event page.</p>
        </header>
      </div>
      <EventForm mode="edit" event={data} />
    </EventsPage>
  );
}
