'use client';

import type { EventDetail } from '@uniconnect/shared';
import { PencilIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { useEventLifecycle, type LifecycleAction } from '@/hooks/use-events';
import type { ApiError } from '@/lib/api';
import { Panel } from '../../../_components/panel';

const COPY: Record<
  LifecycleAction,
  { title: string; body: string; confirm: string; busy: string; done: string; keep: string }
> = {
  publish: {
    title: 'Publish this event?',
    body: 'Eligible users of the listed departments get an email, and registration opens. After publishing, the dates, visibility and departments can no longer change.',
    confirm: 'Publish event',
    busy: 'Publishing…',
    done: 'Event published.',
    keep: 'Not yet',
  },
  cancel: {
    title: 'Cancel this event?',
    body: 'Registration closes and everyone registered gets an email. Their registrations stay on record. This cannot be undone.',
    confirm: 'Cancel event',
    busy: 'Cancelling…',
    done: 'Event cancelled.',
    keep: 'Keep the event',
  },
  complete: {
    title: 'Mark this event completed?',
    body: 'Anyone still registered but not checked in is marked as a no-show. Check-in closes. This cannot be undone.',
    confirm: 'Mark completed',
    busy: 'Saving…',
    done: 'Event marked completed.',
    keep: 'Not yet',
  },
};

/**
 * Organizer controls (PRD FR-EVENT-003/004/005/012), shown only when the API says the caller
 * manages the event. Every lifecycle change goes through a confirm dialog.
 */
export function ManagePanel({ event }: { event: EventDetail }) {
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const now = new Date();
  const started = new Date(event.start_date) <= now;
  const ended = new Date(event.end_date) <= now;
  const open = event.status === 'draft' || event.status === 'published';

  return (
    <Panel
      id="event-manage-title"
      title="Manage"
      tag="SYS.EVENT.MANAGE"
      description={
        event.status === 'draft'
          ? 'Only organizers can see this draft. Publish it to open registration.'
          : event.status === 'published'
            ? 'Registration is open until the event ends.'
            : 'This event is closed. Its registrations stay available.'
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap gap-2">
          {event.status === 'draft' ? (
            <Button disabled={started} onClick={() => setAction('publish')}>
              Publish
            </Button>
          ) : null}
          {open ? (
            <Link
              href={`/dashboard/events/${event.id}/edit`}
              className={buttonVariants({ variant: 'secondary' })}
            >
              <PencilIcon data-icon="inline-start" />
              Edit
            </Link>
          ) : null}
          {event.status !== 'draft' ? (
            <Link
              href={`/dashboard/events/${event.id}/registrations`}
              className={buttonVariants({ variant: 'secondary' })}
            >
              <UsersIcon data-icon="inline-start" />
              Registrations &amp; check-in
            </Link>
          ) : null}
          {event.status === 'published' ? (
            <Button variant="secondary" disabled={!ended} onClick={() => setAction('complete')}>
              Mark completed
            </Button>
          ) : null}
          {open ? (
            <Button variant="destructive" onClick={() => setAction('cancel')}>
              Cancel event
            </Button>
          ) : null}
        </div>
        {event.status === 'draft' && started ? (
          <p className="text-fg-tertiary">
            The start time has passed, so this draft can&apos;t be published. Edit the dates first.
          </p>
        ) : null}
        {event.status === 'published' && !ended ? (
          <p className="text-fg-tertiary">You can mark the event completed once it has ended.</p>
        ) : null}
      </div>
      {action ? (
        <LifecycleDialog event={event} action={action} onClose={() => setAction(null)} />
      ) : null}
    </Panel>
  );
}

function LifecycleDialog({
  event,
  action,
  onClose,
}: {
  event: EventDetail;
  action: LifecycleAction;
  onClose: () => void;
}) {
  const change = useEventLifecycle(event.id);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[action];

  async function confirm() {
    setError(null);
    try {
      await change.mutateAsync(action);
      toast.success(copy.done);
      onClose();
    } catch (thrown) {
      const e = thrown as ApiError;
      setError(
        e.status >= 400 && e.status < 500 ? e.message : "Couldn't save right now. Try again.",
      );
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        {error ? (
          <FormAlert tone="error" title="Nothing changed.">
            {error}
          </FormAlert>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={change.isPending}>
            {copy.keep}
          </Button>
          <Button
            variant={action === 'cancel' ? 'destructive' : 'default'}
            onClick={() => void confirm()}
            disabled={change.isPending}
          >
            {change.isPending ? copy.busy : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
