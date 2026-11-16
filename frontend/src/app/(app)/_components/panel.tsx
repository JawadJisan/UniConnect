import type { ReactNode } from 'react';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface PanelProps {
  /** Heading id, so the section is labelled by its title. */
  id: string;
  title: ReactNode;
  /** The SYS.* system tag, set opposite the title in the header row, never above it. */
  tag?: string;
  description?: ReactNode;
  /** Grid placement (col-span) for the bento layout. */
  className?: string;
  children: ReactNode;
  /** The cell's action row, right-aligned under a hairline. */
  footer?: ReactNode;
}

/** One bento cell: title and system tag, content, then an optional action row. */
export function Panel({ id, title, tag, description, className, children, footer }: PanelProps) {
  return (
    <section aria-labelledby={id} className={cn('min-w-0', className)}>
      <Card className="h-full gap-5">
        <CardHeader className="border-b border-border">
          <h2 id={id} className="text-md leading-snug font-medium tracking-tight">
            {title}
          </h2>
          {tag ? (
            <CardAction>
              <span className="micro-label">{tag}</span>
            </CardAction>
          ) : null}
          {description ? (
            <CardDescription className="text-fg-tertiary">{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">{children}</CardContent>
        {footer ? (
          <CardFooter className="justify-end gap-2 bg-surface-1 py-3">{footer}</CardFooter>
        ) : null}
      </Card>
    </section>
  );
}
