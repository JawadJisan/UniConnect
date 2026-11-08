import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A styled native <select>. Native keeps the platform picker on phones, which beats a custom
 * listbox for short, fixed option lists like departments and blood groups.
 */
function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div data-slot="native-select" className="relative w-full">
      <select
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-background py-1 pr-8 pl-2.5 text-field text-foreground transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 md:text-base [&:has(option[value=""]:checked)]:text-muted-foreground',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-tertiary"
      />
    </div>
  );
}

export { NativeSelect };
