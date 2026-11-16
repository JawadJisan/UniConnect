import type { Metadata } from 'next';
import { ClubsView } from './_components/clubs-view';

export const metadata: Metadata = { title: 'Clubs' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function ClubsPage() {
  return <ClubsView />;
}
