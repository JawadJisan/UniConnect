import type { ReactNode } from 'react';
import { Workspace } from './_components/workspace';

/** Every signed-in page. The proxy has already turned away visitors with no session cookie. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Workspace>{children}</Workspace>;
}
