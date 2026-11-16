import type { UserProfile } from '@uniconnect/shared';
import { BadgeCheckIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { ROLE_LABEL, USER_TYPE_LABEL } from '../../../_components/nav';
import { Panel } from '../../../_components/panel';
import { AvatarUpload } from './avatar-upload';

/** Who the account is: photo, name, email, role and department. Only the photo is editable. */
export function IdentityCard({ profile }: { profile: UserProfile }) {
  return (
    <Panel id="identity-title" title="Photo and identity" tag="SYS.PROFILE.AVATAR">
      <div className="flex flex-col gap-5">
        <AvatarUpload profile={profile} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 border-t border-border pt-4 text-sm">
          <dt className="text-fg-tertiary">Email</dt>
          <dd className="flex min-w-0 items-center gap-1.5 text-foreground">
            <span className="truncate" title={profile.email}>
              {profile.email}
            </span>
            {profile.email_verified ? (
              <BadgeCheckIcon
                aria-label="Verified"
                role="img"
                className="size-4 shrink-0 text-success"
              />
            ) : null}
          </dd>
          <dt className="text-fg-tertiary">Role</dt>
          <dd>
            <Badge variant="default">{ROLE_LABEL[profile.role]}</Badge>
          </dd>
          <dt className="text-fg-tertiary">Account</dt>
          <dd className="text-foreground">{USER_TYPE_LABEL[profile.user_type]}</dd>
          <dt className="text-fg-tertiary">Department</dt>
          <dd className="text-foreground">{profile.department?.name ?? 'All departments'}</dd>
          <dt className="text-fg-tertiary">Joined</dt>
          <dd className="font-mono text-foreground tabular-nums">
            {formatDate(profile.created_at)}
          </dd>
        </dl>
        <p className="text-xs text-fg-tertiary">
          Email, account type and department can&apos;t be changed here.
          {profile.user_type !== 'super_admin' ? ' Ask your department admin if one is wrong.' : ''}
        </p>
      </div>
    </Panel>
  );
}
