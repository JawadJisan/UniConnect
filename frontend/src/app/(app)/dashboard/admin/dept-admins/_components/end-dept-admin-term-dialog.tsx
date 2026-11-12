'use client';

import type { DeptAdminTerm } from '@uniconnect/shared';
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
import { useEndDeptAdminTerm } from '@/hooks/use-dept-admin-terms';
import type { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';

/** Confirms PATCH /admin/dept-admin-terms/:id/end (PRD FR-ADMIN-002). */
export function EndDeptAdminTermDialog({
  term,
  open,
  onOpenChange,
}: {
  term: DeptAdminTerm;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const end = useEndDeptAdminTerm();
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await end.mutateAsync(term.id);
      toast.success(`${term.user.name} is no longer the ${term.department.name} department admin.`);
      onOpenChange(false);
    } catch (thrown) {
      const e = thrown as ApiError;
      setError(
        e.status === 409 || e.status === 404
          ? e.message
          : "Couldn't end the term right now. Try again.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End {term.user.name}&apos;s term early?</DialogTitle>
          <DialogDescription>
            The term was due to run until {formatDate(term.end_date)}. They lose department admin
            access now and go back to faculty, or moderator if they still hold a committee position.{' '}
            {term.department.name} has no admin until you assign one.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <FormAlert tone="error" title="The term didn't end.">
            {error}
          </FormAlert>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={end.isPending}>
            Keep the term
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={end.isPending}>
            {end.isPending ? 'Ending…' : 'End term'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
