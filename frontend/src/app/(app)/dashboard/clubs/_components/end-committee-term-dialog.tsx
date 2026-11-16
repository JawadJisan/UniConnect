'use client';

import type { CommitteeEntry } from '@uniconnect/shared';
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
import { useEndCommitteeTerm } from '@/hooks/use-committee';
import type { ApiError } from '@/lib/api';

/**
 * Confirms PATCH /clubs/:id/committee/:memberId/end-term (PRD FR-COMM-003). The role is
 * recomputed from every term the person still holds, so the dialog says "unless".
 */
export function EndCommitteeTermDialog({
  clubId,
  member,
  open,
  onOpenChange,
}: {
  clubId: number;
  member: CommitteeEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const end = useEndCommitteeTerm(clubId);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await end.mutateAsync(member.id);
      toast.success(`${member.user.name}'s term as ${member.position} ended.`);
      onOpenChange(false);
    } catch (thrown) {
      const e = thrown as ApiError;
      setError(
        e.status === 409 || e.status === 404 || e.status === 403
          ? e.message
          : "Couldn't end the term right now. Try again.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            End {member.user.name}&apos;s term as {member.position}?
          </DialogTitle>
          <DialogDescription>
            They stop being on the committee now and lose moderator access, unless they hold another
            current term. The row stays in the committee history.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <FormAlert tone="error" title="The term didn't end.">
            {error}
          </FormAlert>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={end.isPending}>
            Keep them
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={end.isPending}>
            {end.isPending ? 'Ending…' : 'End term'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
