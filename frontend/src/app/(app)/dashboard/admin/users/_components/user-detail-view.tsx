'use client';

import type { AdminUserDetail } from '@uniconnect/shared';
import { ArrowLeftIcon, BadgeCheckIcon, RefreshCwIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { useAdminUser, useRecomputeRole } from '@/hooks/use-admin-users';
import type { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ADMIN_USERS_HREF, ROLE_LABEL, USER_TYPE_LABEL } from '../../../../_components/nav';
import { Panel } from '../../../../_components/panel';
import { useProfile } from '../../../../_components/require-session';
import { AdminEditForm } from './admin-edit-form';
import { NoAccess, StatusBadge } from './shared';
import { StatusCard } from './status-card';

/** One account, as a super admin sees it (PRD FR-USER-005). */
export function UserDetailView() {
  const profile = useProfile();
  if (profile.role !== 'super_admin') return <NoAccess />;
  return <UserDetail />;
}

function BackLink() {
  return (
    <Link
      href={ADMIN_USERS_HREF}
      className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 w-fit' })}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      All users
    </Link>
  );
}

function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useProfile();
  const user = useAdminUser(id);

  if (user.isPending) {
    return (
      <div className="container-wide flex flex-col gap-6 py-8" aria-busy="true">
        <span className="sr-only">Loading user…</span>
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72" />
          <Skeleton className="h-72 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (user.isError) {
    const status = (user.error as ApiError).status;
    return (
      <div className="container-wide flex flex-col gap-4 py-8">
        <BackLink />
        <ErrorState
          title={
            status === 404 || status === 400
              ? "This user doesn't exist."
              : status === 403
                ? "You don't have access to this user."
                : "Couldn't load this user."
          }
          onRetry={status >= 500 || status === 0 ? () => void user.refetch() : undefined}
          retrying={user.isFetching}
        />
      </div>
    );
  }

  const u = user.data;
  const isSelf = u.id === me.id;
  const isSuperAdmin = u.user_type === 'super_admin';

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <div className="flex flex-col gap-3">
        <BackLink />
        <header className="flex min-w-0 items-center gap-4">
          <Avatar name={u.name} src={u.avatar_url} size={48} />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate text-display-sm">{u.name}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
              <span className="truncate">{u.email}</span>
              <StatusBadge active={u.is_active} verified={u.email_verified} />
            </p>
          </div>
        </header>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-16">
          <AccountCard user={u} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <RoleCard user={u} />
          {isSuperAdmin ? null : <AdminEditForm user={u} />}
          <StatusCard user={u} isSelf={isSelf} />
        </div>
      </div>
    </div>
  );
}

function AccountCard({ user: u }: { user: AdminUserDetail }) {
  return (
    <Panel id="account-title" title="Account" tag="SYS.USER.ACCOUNT">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
        <dt className="text-fg-tertiary">Email</dt>
        <dd className="flex min-w-0 items-center gap-1.5 text-foreground">
          <span className="truncate" title={u.email}>
            {u.email}
          </span>
          {u.email_verified ? (
            <BadgeCheckIcon
              aria-label="Verified"
              role="img"
              className="size-4 shrink-0 text-success"
            />
          ) : (
            <span className="text-xs text-warning">Not verified</span>
          )}
        </dd>
        <dt className="text-fg-tertiary">Type</dt>
        <dd className="text-foreground">{USER_TYPE_LABEL[u.user_type]}</dd>
        <dt className="text-fg-tertiary">Department</dt>
        <dd className="text-foreground">{u.department?.name ?? 'All departments'}</dd>
        <dt className="text-fg-tertiary">Joined</dt>
        <dd className="font-mono text-foreground tabular-nums">{formatDate(u.created_at)}</dd>
        <dt className="text-fg-tertiary">Last login</dt>
        <dd className="font-mono text-foreground tabular-nums">
          {u.last_login_at ? formatDate(u.last_login_at) : 'Never'}
        </dd>
        <dt className="text-fg-tertiary">Signed in on</dt>
        <dd className="text-foreground">
          {u.active_sessions === 0
            ? 'No devices'
            : `${u.active_sessions} ${u.active_sessions === 1 ? 'device' : 'devices'}`}
        </dd>
      </dl>
    </Panel>
  );
}

/** The effective role, what grants it, and the repair action (no direct override, PRD §5). */
function RoleCard({ user: u }: { user: AdminUserDetail }) {
  const recompute = useRecomputeRole(u.id);
  const { committee, dept_admin: deptAdmin } = u.role_sources;
  const hasTerms = committee.length > 0 || deptAdmin !== null;

  async function run() {
    try {
      const result = await recompute.mutateAsync();
      if (result.changed) {
        toast.success(
          `Role changed from ${ROLE_LABEL[result.previous_role]} to ${ROLE_LABEL[result.role]}.`,
        );
      } else {
        toast.success(`Role is already correct: ${ROLE_LABEL[result.role]}.`);
      }
    } catch (err) {
      toast.error((err as ApiError).message || "Couldn't recompute the role.");
    }
  }

  return (
    <Panel
      id="role-title"
      title={`Role: ${ROLE_LABEL[u.role]}`}
      tag="SYS.USER.ROLE"
      description="The role is derived from the account type and current terms. To change it, change the term that grants it."
      footer={
        <Button variant="secondary" onClick={run} disabled={recompute.isPending}>
          <RefreshCwIcon
            data-icon="inline-start"
            className={recompute.isPending ? 'animate-spin' : undefined}
          />
          {recompute.isPending ? 'Recomputing…' : 'Recompute role'}
        </Button>
      }
    >
      {hasTerms ? (
        <ul className="flex flex-col gap-2 text-sm">
          {deptAdmin ? (
            <li className="flex flex-wrap justify-between gap-2">
              <span className="text-foreground">Department admin, {deptAdmin.department_name}</span>
              <span className="font-mono text-fg-tertiary tabular-nums">
                {formatDate(deptAdmin.start_date)} – {formatDate(deptAdmin.end_date)}
              </span>
            </li>
          ) : null}
          {committee.map((c) => (
            <li key={`${c.club_id}-${c.position}`} className="flex flex-wrap justify-between gap-2">
              <span className="text-foreground">
                {c.position}, {c.club_name}
              </span>
              <span className="font-mono text-fg-tertiary tabular-nums">
                {c.term_start_year}–{c.term_end_year}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-secondary">
          No current terms. The role follows the account type ({USER_TYPE_LABEL[u.user_type]}).
          {u.role !== u.user_type ? ' It looks out of sync: recompute it to repair.' : ''}
        </p>
      )}
    </Panel>
  );
}
