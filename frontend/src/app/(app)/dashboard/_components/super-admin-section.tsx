'use client';

import type { SuperAdminDashboard } from '@uniconnect/shared';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { useSuperAdminDashboard } from '@/hooks/use-dashboard';
import { departmentRows, roleRows, sumCounts } from '@/lib/dashboard';
import { formatBdt, formatDate, formatRelative } from '@/lib/format';
import { ActionBadge, ActorLabel, entityText } from '../../_components/audit-cells';
import {
  ADMIN_MEMBERSHIPS_HREF,
  ADMIN_USERS_HREF,
  AUDIT_LOGS_HREF,
  BLOOD_HREF,
  DEPT_ADMINS_HREF,
} from '../../_components/nav';
import { Panel } from '../../_components/panel';
import { HorizontalBarChart } from './bar-chart';
import { HealthStrip } from './health-strip';
import { EmptyLine, SectionError, SectionHeading, SectionSkeleton } from './section-state';
import { StatRow, StatTile } from './stat-tile';
import { EventStatusCounts } from './status-counts';

/** FR-DASH-004: the whole system, every department. Refreshes every minute (health strip). */
export function SuperAdminSection() {
  const view = useSuperAdminDashboard();
  return (
    <section aria-labelledby="dash-super" className="flex flex-col gap-4">
      <SectionHeading
        id="dash-super"
        title="System overview"
        tag="SYS.DASH.SUPER"
        description="Every department, live from the database."
      />
      {view.isPending ? (
        <SectionSkeleton label="Loading the system overview…" />
      ) : view.isError ? (
        <SectionError
          title="Couldn't load the system overview."
          onRetry={() => void view.refetch()}
          retrying={view.isFetching}
        />
      ) : (
        <SuperPanels data={view.data} checkedAt={view.dataUpdatedAt} />
      )}
    </section>
  );
}

function SuperPanels({ data, checkedAt }: { data: SuperAdminDashboard; checkedAt: number }) {
  return (
    <div className="flex flex-col gap-4">
      <StatRow>
        <StatTile
          index={0}
          label="Active users"
          value={sumCounts(data.users_by_role)}
          note="Across every department"
          href={ADMIN_USERS_HREF}
        />
        <StatTile
          index={1}
          label="Active memberships"
          value={data.active_memberships}
          note="Club members today"
          href={ADMIN_MEMBERSHIPS_HREF}
        />
        <StatTile
          index={2}
          label="Revenue"
          value={formatBdt(data.revenue.amount)}
          note="Completed payments, all time"
        />
        <StatTile
          index={3}
          label="Blood requests met"
          value={data.fulfilled_blood_requests}
          note="Fulfilled, all time"
          href={BLOOD_HREF}
        />
      </StatRow>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          id="dash-super-roles"
          title="Users by role"
          tag="SYS.DASH.ROLES"
          description="Active accounts."
        >
          <HorizontalBarChart
            rows={roleRows(data.users_by_role)}
            caption="Active users by role"
            unit="Users"
          />
        </Panel>

        <Panel
          id="dash-super-depts"
          title="Users by department"
          tag="SYS.DASH.DEPTS"
          description="Active accounts with a department, largest first."
        >
          {data.users_by_department.length === 0 ? (
            <EmptyLine>No departments yet.</EmptyLine>
          ) : (
            <HorizontalBarChart
              rows={departmentRows(data.users_by_department)}
              caption="Active users by department"
              unit="Users"
            />
          )}
        </Panel>

        <Panel
          id="dash-super-events"
          title="Events by status"
          tag="SYS.DASH.EVENTS"
          className="lg:col-span-2"
        >
          <EventStatusCounts counts={data.events_by_status} />
        </Panel>

        <Panel
          id="dash-super-health"
          title="System health"
          tag="SYS.DASH.HEALTH"
          className="lg:col-span-2"
        >
          <HealthStrip health={data.health} checkedAt={checkedAt} />
        </Panel>

        <Panel
          id="dash-super-terms"
          title="Department admins"
          tag="SYS.DASH.TERMS"
          description="Current terms."
          footer={
            <Link
              href={DEPT_ADMINS_HREF}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              Manage terms
            </Link>
          }
        >
          {data.dept_admin_terms.length === 0 ? (
            <EmptyLine>No department has a current admin.</EmptyLine>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {data.dept_admin_terms.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {t.user.name}
                    </span>
                    <span className="text-sm text-fg-tertiary">{t.department.name}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm text-fg-tertiary">
                    Until{' '}
                    <span className="font-mono text-fg-secondary tabular-nums">
                      {formatDate(t.end_date)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          id="dash-super-audit"
          title="Recent activity"
          tag="SYS.AUDIT.RECENT"
          description="The last 10 audit entries."
          footer={
            <Link
              href={AUDIT_LOGS_HREF}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              Open audit log
            </Link>
          }
        >
          {data.recent_audit.length === 0 ? (
            <EmptyLine>Nothing recorded yet.</EmptyLine>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {data.recent_audit.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <ActionBadge action={entry.action} />
                    <time dateTime={entry.created_at} className="shrink-0 text-xs text-fg-tertiary">
                      {formatRelative(entry.created_at)}
                    </time>
                  </span>
                  <span className="flex min-w-0 items-center justify-between gap-3 text-sm">
                    <ActorLabel actor={entry.actor} />
                    <span className="shrink-0 font-mono text-xs text-fg-tertiary">
                      {entityText(entry)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
