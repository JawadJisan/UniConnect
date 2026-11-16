import type { Metadata } from 'next';
import { MyClubView } from '../_components/my-club-view';

export const metadata: Metadata = { title: 'My club' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function MyClubPage() {
  return <MyClubView />;
}
