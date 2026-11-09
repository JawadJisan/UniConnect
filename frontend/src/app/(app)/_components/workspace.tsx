'use client';

import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
import { RequireSession } from './require-session';

/** The session guard, then the role-aware shell around the page. */
export function Workspace({ children }: { children: ReactNode }) {
  return (
    <RequireSession>
      {(profile) => <AppShell profile={profile}>{children}</AppShell>}
    </RequireSession>
  );
}
