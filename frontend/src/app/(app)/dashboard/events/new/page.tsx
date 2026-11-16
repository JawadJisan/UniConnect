import type { Metadata } from 'next';
import { NewEventView } from '../_components/new-event-view';

export const metadata: Metadata = { title: 'New event' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function NewEventPage() {
  return <NewEventView />;
}
