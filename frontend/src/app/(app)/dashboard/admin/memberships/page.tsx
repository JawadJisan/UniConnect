import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminMembershipsView } from './_components/admin-memberships-view';

export const metadata: Metadata = { title: 'Memberships' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function AdminMembershipsPage() {
  // The view reads filters from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <AdminMembershipsView />
    </Suspense>
  );
}
