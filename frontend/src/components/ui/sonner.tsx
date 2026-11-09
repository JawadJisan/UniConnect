'use client';

import { CircleAlertIcon, CircleCheckIcon, InfoIcon, Loader2Icon } from 'lucide-react';
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner';

/**
 * Toasts for confirmations after an action ("Profile saved."). Field errors stay inline on the
 * form. Unstyled sonner, drawn with the design tokens: a surface-2 panel with a hairline and a
 * float shadow; the icon and the words carry the meaning, never colour alone.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton={false}
      gap={8}
      icons={{
        success: <CircleCheckIcon aria-hidden="true" className="size-4 text-success" />,
        error: <CircleAlertIcon aria-hidden="true" className="size-4 text-destructive" />,
        info: <InfoIcon aria-hidden="true" className="size-4 text-brand-text" />,
        loading: (
          <Loader2Icon aria-hidden="true" className="size-4 animate-spin text-fg-tertiary" />
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-start gap-2.5 rounded-lg border border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-foreground shadow-float sm:w-(--width)',
          icon: 'mt-0.5 shrink-0',
          content: 'flex min-w-0 flex-col gap-0.5',
          title: 'font-medium',
          description: 'text-fg-secondary',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
