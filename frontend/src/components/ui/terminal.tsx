import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// A display panel styled like a terminal. It doesn't run anything.
function Terminal({
  title,
  className,
  children,
  ...props
}: ComponentProps<'figure'> & { title?: string }) {
  return (
    <figure
      data-slot="terminal"
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border border-border bg-surface-1 font-mono text-sm',
        className,
      )}
      {...props}
    >
      {title ? (
        <figcaption className="micro-label border-b border-border px-3 py-2">{title}</figcaption>
      ) : null}
      <div className="flex flex-col gap-1 overflow-x-auto p-3">{children}</div>
    </figure>
  );
}

function TerminalLine({
  prompt = false,
  className,
  children,
  ...props
}: ComponentProps<'div'> & { prompt?: boolean }) {
  return (
    <div
      data-slot="terminal-line"
      className={cn('whitespace-pre', prompt ? 'text-foreground' : 'text-fg-tertiary', className)}
      {...props}
    >
      {prompt ? (
        <span aria-hidden="true" className="mr-2 text-brand-text select-none">
          $
        </span>
      ) : null}
      {children}
    </div>
  );
}

export { Terminal, TerminalLine };
