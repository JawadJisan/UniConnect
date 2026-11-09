import type { Metadata } from 'next';
import { OverviewView } from './_components/overview-view';

export const metadata: Metadata = { title: 'Overview' };

// Rendered only after the client guard has the session and profile (D25), so the page segment
// isn't part of the prerendered static shell; the shell skeleton is. Opt out of instant
// navigation validation here, as low in the tree as possible (Next's guide for session-reading
// routes under Cache Components).
export const instant = false;

export default function DashboardPage() {
  return <OverviewView />;
}
