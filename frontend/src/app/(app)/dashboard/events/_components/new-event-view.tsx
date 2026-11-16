'use client';

import { canOrganize } from '@/lib/events';
import { useProfile } from '../../../_components/require-session';
import { EventForm } from './event-form';
import { BackLink, EventsNoAccess, EventsPage } from './shared';

/** /dashboard/events/new (PRD FR-EVENT-001): organizers only; the API checks the club. */
export function NewEventView() {
  const profile = useProfile();
  if (!canOrganize(profile.role)) {
    return (
      <EventsNoAccess reason="Events are created by club committee members, department admins and super admins." />
    );
  }
  return (
    <EventsPage narrow>
      <div className="flex flex-col gap-3">
        <BackLink />
        <header className="flex flex-col gap-1.5">
          <h1 className="text-display-sm">New event</h1>
          <p className="text-sm text-fg-secondary">
            Save a draft first. Add a poster and publish it from the event page.
          </p>
        </header>
      </div>
      <EventForm mode="create" />
    </EventsPage>
  );
}
