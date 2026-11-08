import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FlowTrail, type Trail } from './flow-trail';

interface AuthPageProps {
  trail: Trail;
  title: string;
  description?: ReactNode;
  /** Registration has more fields, so it gets a slightly wider column. */
  wide?: boolean;
  children: ReactNode;
}

/** The shared column: flow trail, title, one line of context, then the page's content. */
export function AuthPage({ trail, title, description, wide, children }: AuthPageProps) {
  return (
    <div className={cn('flex w-full flex-col gap-8', wide ? 'max-w-[32rem]' : 'max-w-[26rem]')}>
      <div className="flex flex-col gap-5">
        <FlowTrail {...trail} />
        <div className="flex flex-col gap-2 border-t border-border pt-5">
          <h1 className="text-display-sm">{title}</h1>
          {description ? <p className="text-md text-fg-secondary">{description}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Holds the column's space while a client view reads the URL. */
export function AuthPageFallback({ wide }: { wide?: boolean }) {
  return (
    <div
      aria-busy="true"
      className={cn('min-h-96 w-full', wide ? 'max-w-[32rem]' : 'max-w-[26rem]')}
    />
  );
}
