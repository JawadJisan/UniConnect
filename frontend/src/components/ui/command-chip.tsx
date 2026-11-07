import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const chipClassName =
  'inline-flex h-6 w-fit shrink-0 items-center rounded-sm border border-border bg-surface-1 px-1.5 font-mono text-xs whitespace-nowrap text-fg-secondary';

type ChipSymbol = { symbol?: string | null };

function ChipLabel({ symbol, children }: ChipSymbol & { children: ReactNode }) {
  return (
    <>
      {symbol ? (
        <span
          aria-hidden="true"
          className={cn('text-brand-text', symbol.length > 0 && symbol !== '/' && 'mr-1.5')}
        >
          {symbol}
        </span>
      ) : null}
      {children}
    </>
  );
}

// Static label. The symbol is added for you, so pass "events", not "/events".
function CommandChip({
  className,
  children,
  symbol = '/',
  ...props
}: ComponentProps<'span'> & ChipSymbol) {
  return (
    <span data-slot="command-chip" className={cn(chipClassName, className)} {...props}>
      <ChipLabel symbol={symbol}>{children}</ChipLabel>
    </span>
  );
}

// Same look, as a real button, for when the chip does something.
function CommandChipButton({
  className,
  children,
  symbol = '/',
  type = 'button',
  ...props
}: ComponentProps<'button'> & ChipSymbol) {
  return (
    <button
      data-slot="command-chip"
      type={type}
      className={cn(
        chipClassName,
        'cursor-pointer transition-colors outline-none hover:border-border-strong hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-pressed:border-brand aria-pressed:bg-brand-tint aria-pressed:text-foreground',
        className,
      )}
      {...props}
    >
      <ChipLabel symbol={symbol}>{children}</ChipLabel>
    </button>
  );
}

export { CommandChip, CommandChipButton };
