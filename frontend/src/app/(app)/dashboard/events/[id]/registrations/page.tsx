import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EventRegistrationsView } from '../../_components/event-registrations-view';

export const metadata: Metadata = { title: 'Registrations' };

// Rendered only behind the client guard (D25); the id is read on the client with useParams.
export const instant = false;

export default function EventRegistrationsPage() {
  // The view reads its filter from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <EventRegistrationsView />
    </Suspense>
  );
}
