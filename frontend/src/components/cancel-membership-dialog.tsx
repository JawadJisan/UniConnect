'use client';

import type { MembershipSummary } from '@uniconnect/shared';
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
import { useCancelMembership } from '@/hooks/use-memberships';
import type { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';

/**
 * Confirms PATCH /memberships/:id/cancel (PRD FR-MEM-003). Used by the student on their own
 * membership and by admins in the memberships list. There is no refund in V1 (PRD #8), and the
 * dialog says so before anything changes.
 */
export function CancelMembershipDialog({
  membership: m,
  memberName,
  open,
  onOpenChange,
}: {
  membership: MembershipSummary;
  /** Set when an admin cancels someone else's membership. */
  memberName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cancel = useCancelMembership();
  const [error, setError] = useState<string | null>(null);
  const checkout = m.status === 'pending';
  const whose = memberName ? `${memberName}'s` : 'your';

  async function confirm() {
    setError(null);
    try {
      await cancel.mutateAsync(m.id);
      toast.success(checkout ? 'Checkout cancelled.' : 'Membership cancelled.');
      onOpenChange(false);
    } catch (err) {
      const e = err as ApiError;
      setError(
        e.status === 409 || e.status === 404 ? e.message : "Couldn't cancel right now. Try again.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {checkout ? 'Cancel this checkout?' : `Cancel ${whose} ${m.club.name} membership?`}
          </DialogTitle>
          <DialogDescription>
            {checkout
              ? "The unpaid checkout closes. If a payment for it still arrives, it won't start a membership."
              : m.status === 'scheduled'
                ? `The renewal that starts on ${formatDate(m.start_date)} won't start. Memberships are not refunded.`
                : `Membership ends now instead of on ${formatDate(m.end_date)}. Memberships are not refunded.`}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <FormAlert tone="error" title="Nothing was cancelled.">
            {error}
          </FormAlert>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cancel.isPending}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={cancel.isPending}>
            {cancel.isPending ? 'Cancelling…' : checkout ? 'Cancel checkout' : 'Cancel membership'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
