import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuditLogsView } from './_components/audit-logs-view';

export const metadata: Metadata = { title: 'Audit log' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function AuditLogsPage() {
  // The view reads filters from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <AuditLogsView />
    </Suspense>
  );
}
