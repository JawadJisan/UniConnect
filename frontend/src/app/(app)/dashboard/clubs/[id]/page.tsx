import type { Metadata } from 'next';
import { ClubDetailView } from '../_components/club-detail-view';

export const metadata: Metadata = { title: 'Club' };

// Rendered only behind the client guard (D25); the id is read on the client with useParams.
export const instant = false;

export default function ClubPage() {
  return <ClubDetailView />;
}
