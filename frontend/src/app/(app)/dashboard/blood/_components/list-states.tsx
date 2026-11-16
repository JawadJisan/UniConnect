import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Rows shaped like the table while it loads (DESIGN.md §7 "Skeleton"). */
export function TableSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** The empty result: says whether filters caused it, and offers to clear them. */
export function EmptyState({
  title,
  text,
  onClear,
  action,
}: {
  title: string;
  text: string;
  onClear?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
      <p className="text-md font-medium">{title}</p>
      <p className="text-sm text-fg-secondary">{text}</p>
      {onClear ? (
        <Button variant="secondary" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
      {action}
    </div>
  );
}

/** A phone number as a `tel:` link in mono (D14: shown to signed-in users). */
export function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone}`}
      className="font-mono text-foreground tabular-nums underline-offset-4 hover:underline focus-visible:underline"
    >
      {phone}
    </a>
  );
}
