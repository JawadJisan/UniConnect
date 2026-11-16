import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MembershipsView } from './_components/memberships-view';

export const metadata: Metadata = { title: 'Membership' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function MembershipsPage() {
  // The view reads ?checkout= from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <MembershipsView />
    </Suspense>
  );
}
