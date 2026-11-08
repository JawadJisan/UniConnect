import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Wordmark } from '../_components/wordmark';
import { RedirectIfSignedIn } from './_components/redirect-if-signed-in';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border">
        <div className="container-page flex h-14 items-center justify-between gap-4">
          <Wordmark />
          <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Back to home
          </Link>
        </div>
      </header>
      <main className="flex flex-1 justify-center px-(--gutter) pt-10 pb-16 sm:pt-16">
        {children}
      </main>
      <RedirectIfSignedIn />
    </div>
  );
}
