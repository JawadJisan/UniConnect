'use client';

import type { BloodRequest } from '@uniconnect/shared';
import { useState } from 'react';
import { BloodGroupBadge } from '@/components/blood-badges';
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
import { useFulfillRequest } from '@/hooks/use-blood';
import type { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';

/** The API's refusal in words; a 5xx gets a generic retry message. */
export function refusalMessage(e: ApiError, action: string): string {
  return e.status >= 400 && e.status < 500 ? e.message : `Couldn't ${action} right now. Try again.`;
}

/** FR-BLOOD-007: fulfilling always goes through this confirmation (D41). */
export function FulfillRequestDialog({
  request: r,
  onClose,
}: {
  request: BloodRequest;
  onClose: () => void;
}) {
  const fulfill = useFulfillRequest();
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await fulfill.mutateAsync(r.id);
      toast.success('Marked as fulfilled. Thank you.');
      onClose();
    } catch (thrown) {
      setError(refusalMessage(thrown as ApiError, 'fulfill this request'));
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Fulfill this request?</DialogTitle>
            <span className="micro-label">SYS.BLOOD.FULFILL</span>
          </div>
          <DialogDescription>
            {r.requester.name} is told you fulfilled it, and the request closes for everyone. It
            doesn&apos;t record a donation: after you donate, add it under My donations so an admin
            can verify it.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-1 p-4 text-sm">
          <dt className="micro-label">PATIENT</dt>
          <dd className="font-medium">{r.patient_name}</dd>
          <dt className="micro-label">GROUP</dt>
          <dd>
            <BloodGroupBadge group={r.blood_group} />
          </dd>
          <dt className="micro-label">UNITS</dt>
          <dd className="font-mono tabular-nums">{r.units_needed}</dd>
          <dt className="micro-label">HOSPITAL</dt>
          <dd>{r.hospital_name}</dd>
          <dt className="micro-label">NEEDED BY</dt>
          <dd className="font-mono tabular-nums">{formatDate(r.required_by_date)}</dd>
        </dl>
        {error ? (
          <FormAlert tone="error" title="Nothing changed.">
            {error}
          </FormAlert>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={fulfill.isPending}>
            Not now
          </Button>
          <Button onClick={() => void confirm()} disabled={fulfill.isPending}>
            {fulfill.isPending ? 'Saving…' : 'Mark as fulfilled'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
