import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  /** The control's id. The label, description and error are tied to it. */
  id: string;
  label: ReactNode;
  /** Shown under the label, before the control. */
  description?: ReactNode;
  error?: string;
  /** Marks the field as optional in the label. Required is the default and isn't marked. */
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

export const descriptionId = (id: string) => `${id}-description`;
export const errorId = (id: string) => `${id}-error`;

/** Props for the control inside a Field: invalid state and its descriptions. */
export function controlProps(
  id: string,
  { error, description }: { error?: string; description?: boolean },
) {
  const ids = [description ? descriptionId(id) : null, error ? errorId(id) : null].filter(Boolean);
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': ids.length ? ids.join(' ') : undefined,
  } as const;
}

/** A labelled form control with optional help text and an inline error. */
function Field({ id, label, description, error, optional, className, children }: FieldProps) {
  return (
    <div data-slot="field" className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-fg-tertiary">optional</span> : null}
      </label>
      {description ? (
        <p id={descriptionId(id)} className="text-sm text-fg-tertiary">
          {description}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId(id)} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
