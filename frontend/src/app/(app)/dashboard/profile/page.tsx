import type { Metadata } from 'next';
import { ProfileView } from './_components/profile-view';

export const metadata: Metadata = { title: 'Profile' };

// Rendered only after the client guard has the session and profile (D25), so the page segment
// isn't part of the prerendered static shell; the shell skeleton is. Opt out of instant
// navigation validation here, as low in the tree as possible (Next's guide for session-reading
// routes under Cache Components).
export const instant = false;

export default function ProfilePage() {
  return <ProfileView />;
}
