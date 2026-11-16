import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BloodVerificationsView } from './_components/blood-verifications-view';

export const metadata: Metadata = { title: 'Blood verifications' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function BloodVerificationsPage() {
  // The view reads filters from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <BloodVerificationsView />
    </Suspense>
  );
}
