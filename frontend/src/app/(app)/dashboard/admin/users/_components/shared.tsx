import { BanIcon, CircleCheckIcon, MailWarningIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';

/**
 * Shown to anyone but a super admin. The sidebar never links here for them, and the API answers
 * 403 regardless; this only keeps a typed URL from showing a broken page.
 */
export function NoAccess() {
  return (
    <div className="container-wide py-8">
      <FormAlert tone="error" title="You don't have access to this page." className="max-w-xl">
        User management is for super admins.
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
        >
          Back to overview
        </Link>
      </FormAlert>
    </div>
  );
}

/** One status per row (DESIGN.md): suspended outranks unverified, which outranks active. */
export function StatusBadge({ active, verified }: { active: boolean; verified: boolean }) {
  if (!active) {
    return (
      <Badge variant="destructive">
        <BanIcon data-icon="inline-start" aria-hidden="true" />
        Suspended
      </Badge>
    );
  }
  if (!verified) {
    return (
      <Badge variant="warning">
        <MailWarningIcon data-icon="inline-start" aria-hidden="true" />
        Unverified
      </Badge>
    );
  }
  return (
    <Badge variant="success">
      <CircleCheckIcon data-icon="inline-start" aria-hidden="true" />
      Active
    </Badge>
  );
}
