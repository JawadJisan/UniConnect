'use client';

import { m } from 'motion/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { duration, ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * One KPI (DESIGN.md §7 "Stat tile"): a micro-label, the figure in mono tabular numerals and an
 * optional line of context. With `href` the whole tile is the link. `attention` raises the
 * border when the figure asks for action (pending verifications), never colour alone: the
 * `note` says why.
 */
export function StatTile({
  label,
  value,
  note,
  href,
  attention,
  index = 0,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  href?: string;
  attention?: boolean;
  /** Position in its row, for the entrance stagger. */
  index?: number;
}) {
  const body = (
    <>
      <span className="micro-label">{label}</span>
      <span className="font-mono text-display-sm text-foreground tabular-nums">{value}</span>
      {note ? <span className="text-sm text-fg-tertiary">{note}</span> : null}
    </>
  );
  const className = cn(
    'flex h-full min-w-0 flex-col gap-1.5 rounded-lg border bg-surface-1 p-4',
    attention ? 'border-warning/50' : 'border-border',
    href &&
      'transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
  );
  return (
    <m.div
      className="min-w-0"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: ease.out, delay: index * 0.04 }}
    >
      {href ? (
        <Link href={href} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </m.div>
  );
}

/** A row of stat tiles: one column on phones, up to four on wide screens. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
