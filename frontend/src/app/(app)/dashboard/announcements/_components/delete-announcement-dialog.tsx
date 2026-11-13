'use client';

import type { Announcement } from '@uniconnect/shared';
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
import { useDeleteAnnouncement } from '@/hooks/use-announcements';
import type { ApiError } from '@/lib/api';

/** FR-ANNOUNCE-003: a delete always goes through this confirmation. */
export function DeleteAnnouncementDialog({
  announcement,
  onClose,
}: {
  announcement: Announcement;
  onClose: () => void;
}) {
  const remove = useDeleteAnnouncement();
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await remove.mutateAsync(announcement.id);
      toast.success('Announcement deleted.');
      onClose();
    } catch (thrown) {
      const e = thrown as ApiError;
      setError(
        e.status >= 400 && e.status < 500 ? e.message : "Couldn't delete right now. Try again.",
      );
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this announcement?</DialogTitle>
          <DialogDescription>
            &ldquo;{announcement.title}&rdquo; is removed for everyone. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <FormAlert tone="error" title="Nothing changed.">
            {error}
          </FormAlert>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={remove.isPending}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={remove.isPending}>
            {remove.isPending ? 'Deleting…' : 'Delete announcement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
