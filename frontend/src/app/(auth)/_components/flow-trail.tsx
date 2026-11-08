'use client';

import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';

export const SIGN_UP_FLOW = ['Register', 'Verify email', 'Sign in'] as const;
export const RESET_FLOW = ['Request link', 'Check inbox', 'New password'] as const;

export interface Trail {
  steps: readonly string[];
  /** Index of the step this page is on. */
  current: number;
  /**
   * How many steps from the start the page knows are done. Only what the page can show is
   * ticked: a cold visit to /login ticks nothing, a visit after verifying ticks two.
   */
  done?: number;
  label: string;
}

/** Where the visitor stands on a multi-page flow. Real state, read by screen readers too. */
export function FlowTrail({ steps, current, done = 0, label }: Trail) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-xs">
        {steps.map((step, index) => {
          const isDone = index < done && index !== current;
          const active = index === current;
          return (
            <Fragment key={step}>
              {index > 0 ? (
                <li aria-hidden="true" className="text-fg-tertiary">
                  <ChevronRightIcon className="size-3" />
                </li>
              ) : null}
              <li
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'inline-flex items-center gap-1',
                  active ? 'text-foreground' : isDone ? 'text-fg-secondary' : 'text-fg-tertiary',
                )}
              >
                {isDone ? <CheckIcon aria-hidden="true" className="size-3 text-success" /> : null}
                {/* Static, so the mark is identical on every page and before hydration. Positioned
                    below the label without padding, so ticks and chevrons stay on its line. */}
                <span className="relative">
                  {step}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-brand-text"
                    />
                  ) : null}
                </span>
                {isDone ? <span className="sr-only">(done)</span> : null}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
