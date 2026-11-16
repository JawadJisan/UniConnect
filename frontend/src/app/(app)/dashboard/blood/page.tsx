import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BloodHubView } from './_components/blood-hub-view';

export const metadata: Metadata = { title: 'Blood donation' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function BloodPage() {
  // The view reads the tab and filters from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <BloodHubView />
    </Suspense>
  );
}
