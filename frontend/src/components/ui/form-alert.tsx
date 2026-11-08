import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  error: { Icon: CircleAlertIcon, icon: 'text-destructive', role: 'alert' },
  success: { Icon: CircleCheckIcon, icon: 'text-success', role: 'status' },
  info: { Icon: InfoIcon, icon: 'text-brand-text', role: 'status' },
} as const;

interface FormAlertProps {
  tone: keyof typeof tones;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Form-level status. The icon and the words carry the meaning, so it never relies on colour.
 * Errors are announced immediately (role="alert"), the rest politely (role="status").
 */
function FormAlert({ tone, title, children, className }: FormAlertProps) {
  const { Icon, icon, role } = tones[tone];
  return (
    <div
      role={role}
      data-slot="form-alert"
      data-tone={tone}
      className={cn(
        'flex gap-2.5 rounded-md border border-border bg-surface-1 px-3 py-2.5',
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', icon)} />
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <p className="font-medium text-foreground">{title}</p>
        {children ? <div className="text-fg-secondary">{children}</div> : null}
      </div>
    </div>
  );
}

export { FormAlert };
