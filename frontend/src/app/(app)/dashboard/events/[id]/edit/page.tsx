import type { Metadata } from 'next';
import { EditEventView } from '../../_components/edit-event-view';

export const metadata: Metadata = { title: 'Edit event' };

// Rendered only behind the client guard (D25); the id is read on the client with useParams.
export const instant = false;

export default function EditEventPage() {
  return <EditEventView />;
}
