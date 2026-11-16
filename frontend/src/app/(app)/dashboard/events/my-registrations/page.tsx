import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyRegistrationsView } from '../_components/my-registrations-view';

export const metadata: Metadata = { title: 'My registrations' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function MyRegistrationsPage() {
  // The view reads its filter from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <MyRegistrationsView />
    </Suspense>
  );
}
