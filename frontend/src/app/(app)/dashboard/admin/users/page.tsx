import type { Metadata } from 'next';
import { Suspense } from 'react';
import { UsersView } from './_components/users-view';

export const metadata: Metadata = { title: 'Users' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function AdminUsersPage() {
  // The view reads filters from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <UsersView />
    </Suspense>
  );
}
