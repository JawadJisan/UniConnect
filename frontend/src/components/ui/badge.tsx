import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-1.5 font-mono text-micro font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-brand-tint text-brand-text [a]:hover:bg-brand/30',
        secondary: 'border-border bg-surface-2 text-fg-secondary [a]:hover:bg-surface-3',
        outline: 'border-border-strong text-fg-secondary [a]:hover:bg-surface-2',
        success: 'bg-success/12 text-success [a]:hover:bg-success/20',
        warning: 'bg-warning/12 text-warning [a]:hover:bg-warning/20',
        destructive: 'bg-destructive/12 text-destructive [a]:hover:bg-destructive/20',
        ghost: 'text-fg-secondary hover:bg-surface-2',
        link: 'text-brand-text underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
