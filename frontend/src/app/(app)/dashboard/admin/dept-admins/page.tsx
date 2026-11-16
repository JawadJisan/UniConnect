import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DeptAdminsView } from './_components/dept-admins-view';

export const metadata: Metadata = { title: 'Department admins' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function DeptAdminsPage() {
  // The view reads filters from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <DeptAdminsView />
    </Suspense>
  );
}
