'use client';

import type { UnverifiedDonation } from '@uniconnect/shared';
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
import { useVerifyDonation } from '@/hooks/use-blood';
import type { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';

/** FR-BLOOD-002: verifying always goes through this confirmation (D41). */
export function VerifyDonationDialog({
  donation: d,
  onClose,
}: {
  donation: UnverifiedDonation;
  onClose: () => void;
}) {
  const verify = useVerifyDonation();
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await verify.mutateAsync(d.id);
      toast.success(`Verified ${d.donor.name}'s donation.`);
      onClose();
    } catch (thrown) {
      const e = thrown as ApiError;
      setError(
        e.status >= 400 && e.status < 500 ? e.message : "Couldn't verify right now. Try again.",
      );
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Verify this donation?</DialogTitle>
            <span className="micro-label">SYS.BLOOD.VERIFY</span>
          </div>
          <DialogDescription>
            Confirm only if you&apos;ve seen proof of the donation. {d.donor.name} shows as a
            verified donor, and their last donation date updates if this one is newer. This
            can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-1 p-4 text-sm">
          <dt className="micro-label">DONOR</dt>
          <dd className="font-medium">
            {d.donor.name}
            {d.donor.department ? (
              <span className="font-normal text-fg-tertiary"> · {d.donor.department.name}</span>
            ) : null}
          </dd>
          <dt className="micro-label">GROUP</dt>
          <dd>
            <BloodGroupBadge group={d.blood_group} />
          </dd>
          <dt className="micro-label">DONATED</dt>
          <dd className="font-mono tabular-nums">{formatDate(d.donation_date)}</dd>
          <dt className="micro-label">UNITS</dt>
          <dd className="font-mono tabular-nums">{d.units}</dd>
          {d.hospital_name ? (
            <>
              <dt className="micro-label">HOSPITAL</dt>
              <dd>{d.hospital_name}</dd>
            </>
          ) : null}
          {d.notes ? (
            <>
              <dt className="micro-label">NOTES</dt>
              <dd className="whitespace-pre-line text-fg-secondary">{d.notes}</dd>
            </>
          ) : null}
        </dl>
        {error ? (
          <FormAlert tone="error" title="Nothing changed.">
            {error}
          </FormAlert>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={verify.isPending}>
            Not now
          </Button>
          <Button onClick={() => void confirm()} disabled={verify.isPending}>
            {verify.isPending ? 'Verifying…' : 'Verify donation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
