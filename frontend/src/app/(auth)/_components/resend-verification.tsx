'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toApiError } from '@/lib/api';
import { authClient, VERIFY_CALLBACK_URL } from '@/lib/auth-client';

/** The backend allows one verification email per address every 5 minutes. */
export const RESEND_WINDOW_SECONDS = 5 * 60;

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; until: number }
  | { kind: 'limited' }
  | { kind: 'error'; message: string };

function useSecondsLeft(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  // `now` was last set before the send, so clamp to the window: never show more than 5:00.
  if (until === null) return 0;
  return Math.min(RESEND_WINDOW_SECONDS, Math.max(0, Math.ceil((until - now) / 1000)));
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface ResendVerificationProps {
  email: string;
  variant?: 'secondary' | 'outline';
  className?: string;
}

/** Asks for a new verification link, with the cooldown and limit stated in words. */
export function ResendVerification({
  email,
  variant = 'secondary',
  className,
}: ResendVerificationProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const secondsLeft = useSecondsLeft(state.kind === 'sent' ? state.until : null);
  const coolingDown = state.kind === 'sent' && secondsLeft > 0;

  async function resend() {
    setState({ kind: 'sending' });
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: VERIFY_CALLBACK_URL,
    });
    if (!error) {
      setState({ kind: 'sent', until: Date.now() + RESEND_WINDOW_SECONDS * 1000 });
      return;
    }
    const err = toApiError(error);
    setState(err.status === 429 ? { kind: 'limited' } : { kind: 'error', message: err.message });
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          variant={variant}
          size="lg"
          onClick={resend}
          disabled={state.kind === 'sending' || coolingDown}
        >
          {state.kind === 'sending' ? 'Sending…' : 'Resend verification email'}
        </Button>
        {coolingDown ? (
          <span className="font-mono text-xs text-fg-tertiary tabular-nums">
            Next link in {clock(secondsLeft)}
          </span>
        ) : null}
      </div>
      <p role="status" className="mt-2 text-sm text-fg-secondary empty:hidden">
        {state.kind === 'sent'
          ? `Sent. Check ${email} for a new link.`
          : state.kind === 'limited'
            ? 'A link was sent to this address in the last 5 minutes. Wait a few minutes, then try again.'
            : state.kind === 'error'
              ? state.message
              : ''}
      </p>
    </div>
  );
}
