import type { Metadata } from 'next';
import { UserDetailView } from '../_components/user-detail-view';

export const metadata: Metadata = { title: 'User' };

// Rendered only behind the client guard (D25); the id is read on the client with useParams.
export const instant = false;

export default function AdminUserPage() {
  return <UserDetailView />;
}
