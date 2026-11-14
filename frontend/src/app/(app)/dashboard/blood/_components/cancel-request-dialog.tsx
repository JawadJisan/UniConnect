'use client';

import type { BloodRequest } from '@uniconnect/shared';
import { useState } from 'react';
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
import { useCancelRequest } from '@/hooks/use-blood';
import type { ApiError } from '@/lib/api';
import { useProfile } from '../../../_components/require-session';
import { refusalMessage } from './fulfill-request-dialog';

/** FR-BLOOD-008: the requester, their dept_admin or a super_admin cancels, after confirming. */
export function CancelRequestDialog({
  request: r,
  onClose,
}: {
  request: BloodRequest;
  onClose: () => void;
}) {
  const profile = useProfile();
  const cancel = useCancelRequest();
  const [error, setError] = useState<string | null>(null);
  const own = r.requester.id === profile.id;

  async function confirm() {
    setError(null);
    try {
      await cancel.mutateAsync(r.id);
      toast.success('Request cancelled.');
      onClose();
    } catch (thrown) {
      setError(refusalMessage(thrown as ApiError, 'cancel this request'));
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this request?</DialogTitle>
          <DialogDescription>
            The request for {r.patient_name} leaves the open list for everyone
            {own ? '' : `, and ${r.requester.name} can't reopen it`}. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <FormAlert tone="error" title="Nothing changed.">
            {error}
          </FormAlert>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={cancel.isPending}>
            Keep it open
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={cancel.isPending}>
            {cancel.isPending ? 'Cancelling…' : 'Cancel request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
