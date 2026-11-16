import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EventsView } from './_components/events-view';

export const metadata: Metadata = { title: 'Events' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function EventsPage() {
  // The view reads filters from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <EventsView />
    </Suspense>
  );
}
