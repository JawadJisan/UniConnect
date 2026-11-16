'use client';

import type { ReactNode } from 'react';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';

/** A section's heading row: the title and its SYS.* tag on one hairline. */
export function SectionHeading({
  id,
  title,
  tag,
  description,
}: {
  id: string;
  title: ReactNode;
  tag: string;
  description?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border pb-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-lg font-medium tracking-tight">
          {title}
        </h2>
        <span className="micro-label shrink-0">{tag}</span>
      </div>
      {description ? <p className="text-sm text-fg-tertiary">{description}</p> : null}
    </div>
  );
}

/** Loading placeholder shaped like a stat row and two panels. */
export function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}

/** One section failed: say which, offer a retry. The other sections keep working. */
export function SectionError({
  title,
  onRetry,
  retrying,
}: {
  title: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return <ErrorState title={title} onRetry={onRetry} retrying={retrying} />;
}

/** A panel with nothing to list: one plain line, optionally a next step. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-fg-tertiary">{children}</p>;
}
