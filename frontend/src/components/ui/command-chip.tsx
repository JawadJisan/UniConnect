import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const chipClassName =
  'inline-flex h-6 w-fit shrink-0 items-center rounded-sm border border-border bg-surface-1 px-1.5 font-mono text-xs whitespace-nowrap text-fg-secondary';

function ChipLabel({ children }: { children: ReactNode }) {
  return (
    <>
      <span aria-hidden="true" className="text-brand-text">
        /
      </span>
      {children}
    </>
  );
}

// Static label. The slash is added for you, so pass "events", not "/events".
function CommandChip({ className, children, ...props }: ComponentProps<'span'>) {
  return (
    <span data-slot="command-chip" className={cn(chipClassName, className)} {...props}>
      <ChipLabel>{children}</ChipLabel>
    </span>
  );
}

// Same look, as a real button, for when the chip does something.
function CommandChipButton({
  className,
  children,
  type = 'button',
  ...props
}: ComponentProps<'button'>) {
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
      <ChipLabel>{children}</ChipLabel>
    </button>
  );
}

export { CommandChip, CommandChipButton };
