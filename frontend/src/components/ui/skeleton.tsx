import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A placeholder block shaped like the content that is loading. Hidden from screen readers. */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-2', className)}
      {...props}
    />
  );
}

export { Skeleton };
