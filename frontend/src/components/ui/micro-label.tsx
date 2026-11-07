import type { ComponentProps, ElementType } from 'react';
import { cn } from '@/lib/utils';

type MicroLabelProps<T extends ElementType> = { as?: T } & ComponentProps<T>;

// For metadata and group labels. Don't place one above every heading: see docs/DESIGN.md.
function MicroLabel<T extends ElementType = 'span'>({
  as,
  className,
  ...props
}: MicroLabelProps<T>) {
  const Component: ElementType = as ?? 'span';

  return <Component data-slot="micro-label" className={cn('micro-label', className)} {...props} />;
}

export { MicroLabel };
