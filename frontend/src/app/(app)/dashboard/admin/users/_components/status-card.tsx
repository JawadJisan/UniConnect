'use client';

import type { AdminUserDetail } from '@uniconnect/shared';
import { useId, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { useSetUserStatus } from '@/hooks/use-admin-users';
import type { ApiError } from '@/lib/api';
import { Panel } from '../../../../_components/panel';

const REASON_MAX = 500;

/**
 * Suspend or activate. Suspending signs the user out everywhere at once (their sessions are
 * deleted in the same transaction). Super admins, including the caller, can't be changed here.
 */
export function StatusCard({ user: u, isSelf }: { user: AdminUserDetail; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const locked = isSelf || u.user_type === 'super_admin';
  const suspending = u.is_active;

  return (
    <Panel
      id="status-title"
      title="Account status"
      tag="SYS.USER.STATUS"
      description={
        u.is_active
          ? 'Active. Suspending blocks sign-in and signs them out on every device.'
          : 'Suspended. They cannot sign in until the account is activated.'
      }
      footer={
        <Button
          variant={suspending ? 'destructive' : 'secondary'}
          disabled={locked}
          onClick={() => setOpen(true)}
        >
          {suspending ? 'Suspend account' : 'Activate account'}
        </Button>
      }
    >
      <p className="text-sm text-fg-secondary">
        {isSelf
          ? 'This is your own account. Another super admin would have to change its status.'
          : u.user_type === 'super_admin'
            ? 'Super admin accounts cannot be suspended from here.'
            : suspending
              ? 'Use this for misuse or a compromised account. Their data stays; only access stops.'
              : 'Activating lets them sign in again with their existing password.'}
      </p>
      {locked ? null : (
        <StatusDialog user={u} open={open} onOpenChange={setOpen} suspending={suspending} />
      )}
    </Panel>
  );
}

function StatusDialog({
  user: u,
  open,
  onOpenChange,
  suspending,
}: {
  user: AdminUserDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suspending: boolean;
}) {
  const setStatus = useSetUserStatus(u.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();

  async function confirm() {
    setError(null);
    try {
      await setStatus.mutateAsync({
        is_active: !suspending,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.success(suspending ? `${u.name} is suspended.` : `${u.name} is active again.`, {
        description: suspending ? 'They were signed out on every device.' : undefined,
      });
      setReason('');
      onOpenChange(false);
    } catch (err) {
      const e = err as ApiError;
      setError(
        e.status >= 500 || e.status === 0 ? "Couldn't save right now. Try again." : e.message,
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{suspending ? `Suspend ${u.name}?` : `Activate ${u.name}?`}</DialogTitle>
          <DialogDescription>
            {suspending
              ? 'They will be signed out on every device and cannot sign in until you activate the account.'
              : 'They will be able to sign in again.'}
          </DialogDescription>
        </DialogHeader>
        {error ? <FormAlert tone="error" title={error} /> : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium">
            Reason{' '}
            <span className="font-normal text-fg-tertiary">(optional, kept in the audit log)</span>
          </label>
          <Textarea
            id={reasonId}
            value={reason}
            maxLength={REASON_MAX}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={suspending ? 'destructive' : 'default'}
            onClick={confirm}
            disabled={setStatus.isPending}
          >
            {setStatus.isPending
              ? suspending
                ? 'Suspending…'
                : 'Activating…'
              : suspending
                ? 'Suspend'
                : 'Activate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
