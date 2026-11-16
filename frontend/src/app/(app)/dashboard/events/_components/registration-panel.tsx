'use client';

import type { EventDetail } from '@uniconnect/shared';
import { useState } from 'react';
import { RegistrationStatusBadge } from '@/components/event-status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/form-alert';
import { toast } from '@/components/ui/sonner';
import { useCancelRegistration, useRegister } from '@/hooks/use-events';
import type { ApiError } from '@/lib/api';
import { BLOCKED_REASON_TEXT } from '@/lib/events';
import { Panel } from '../../../_components/panel';

/** What went wrong, in words the attendee can act on. */
function registerProblem(err: ApiError): { title: string; body?: string; retry: boolean } {
  if (err.code === 'EVENT_BUSY') {
    return {
      title: 'Many people are registering right now.',
      body: 'Your seat was not taken. Try again in a moment.',
      retry: true,
    };
  }
  if (err.code === 'EVENT_FULL') return { title: 'This event is full.', retry: false };
  if (err.status === 0 || err.status >= 500) {
    return { title: "Couldn't reach UniConnect.", body: err.message, retry: true };
  }
  return { title: err.message, retry: false };
}

/**
 * Register or cancel (PRD FR-EVENT-007/008). The detail's `can_register` and
 * `register_blocked_reason` come from the same rule the API enforces, so the panel never offers
 * an action the API would refuse for a known reason; a race (the last seat) still can be.
 */
export function RegistrationPanel({ event }: { event: EventDetail }) {
  const register = useRegister(event.id);
  const [problem, setProblem] = useState<ReturnType<typeof registerProblem> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const mine = event.my_registration;
  const started = new Date(event.start_date) <= new Date();

  async function onRegister() {
    setProblem(null);
    try {
      await register.mutateAsync();
      toast.success(`You're registered for ${event.title}.`);
    } catch (thrown) {
      setProblem(registerProblem(thrown as ApiError));
    }
  }

  let body;
  let footer;
  if (mine && mine.status !== 'cancelled') {
    body = (
      <div className="flex flex-col gap-3 text-sm">
        <p className="flex items-center gap-2">
          <span className="text-fg-secondary">Your registration</span>
          <RegistrationStatusBadge status={mine.status} />
        </p>
        {mine.status === 'registered' && started ? (
          <p className="text-fg-tertiary">
            The event has started, so the registration can no longer be cancelled.
          </p>
        ) : null}
        {mine.status === 'no_show' ? (
          <p className="text-fg-tertiary">{BLOCKED_REASON_TEXT.no_show}</p>
        ) : null}
      </div>
    );
    if (mine.status === 'registered') {
      footer = (
        <Button variant="ghost" disabled={started} onClick={() => setConfirming(true)}>
          Cancel registration
        </Button>
      );
    }
  } else if (event.can_register) {
    body = (
      <p className="text-sm text-fg-secondary">
        {event.is_paid
          ? 'Registering here costs nothing. The fee is paid at the venue.'
          : 'This event is free.'}{' '}
        One seat per person.
      </p>
    );
    footer = (
      <Button onClick={() => void onRegister()} disabled={register.isPending}>
        {register.isPending ? 'Registering…' : 'Register'}
      </Button>
    );
  } else {
    const reason = event.register_blocked_reason ?? 'not_open';
    body = <FormAlert tone="info" title={BLOCKED_REASON_TEXT[reason]} />;
  }

  return (
    <Panel id="event-register-title" title="Registration" tag="SYS.EVENT.REGISTER" footer={footer}>
      <div className="flex flex-col gap-3">
        {problem ? (
          <FormAlert tone="error" title={problem.title}>
            {problem.body}
            {problem.retry ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={register.isPending}
                onClick={() => void onRegister()}
              >
                Try again
              </Button>
            ) : null}
          </FormAlert>
        ) : null}
        {body}
      </div>
      {mine ? (
        <CancelRegistrationDialog event={event} open={confirming} onOpenChange={setConfirming} />
      ) : null}
    </Panel>
  );
}

function CancelRegistrationDialog({
  event,
  open,
  onOpenChange,
}: {
  event: EventDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cancel = useCancelRegistration(event.id);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await cancel.mutateAsync();
      toast.success('Registration cancelled.');
      onOpenChange(false);
    } catch (thrown) {
      const e = thrown as ApiError;
      setError(
        e.code === 'EVENT_BUSY'
          ? 'Many people are registering right now. Try again in a moment.'
          : e.status >= 400 && e.status < 500
            ? e.message
            : "Couldn't cancel right now. Try again.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel your registration for {event.title}?</DialogTitle>
          <DialogDescription>
            Your seat is released for someone else. You can register again while the event is open
            and has seats.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <FormAlert tone="error" title="The registration wasn't cancelled.">
            {error}
          </FormAlert>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cancel.isPending}>
            Keep my seat
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={cancel.isPending}>
            {cancel.isPending ? 'Cancelling…' : 'Cancel registration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
