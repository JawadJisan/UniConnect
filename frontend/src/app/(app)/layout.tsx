import { Suspense, type ReactNode } from 'react';
import { ShellSkeleton } from './_components/shell-skeleton';
import { Workspace } from './_components/workspace';

/**
 * Every signed-in page. The proxy has already turned away visitors with no session cookie.
 *
 * The shell reads `usePathname()` (session guard, sidebar). On a dynamic route (`[id]`) the
 * pathname depends on params that don't exist at build time, so with `cacheComponents` the
 * prerender must stop at a Suspense boundary; without one `next build` fails on every `[id]`
 * page. The fallback is the same skeleton the guard shows while the session loads.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Workspace>{children}</Workspace>
    </Suspense>
  );
}
