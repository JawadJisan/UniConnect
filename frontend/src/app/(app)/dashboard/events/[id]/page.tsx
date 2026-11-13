import type { Metadata } from 'next';
import { EventDetailView } from '../_components/event-detail-view';

export const metadata: Metadata = { title: 'Event' };

// Rendered only behind the client guard (D25); the id is read on the client with useParams.
export const instant = false;

export default function EventPage() {
  return <EventDetailView />;
}
