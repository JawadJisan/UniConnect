'use client';

import type { DeptAdminDashboard } from '@uniconnect/shared';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { useDeptAdminDashboard } from '@/hooks/use-dashboard';
import { daysLeftTone, roleRows, sumCounts } from '@/lib/dashboard';
import { formatDate } from '@/lib/format';
import { formatDaysLeft } from '@/lib/membership';
import {
  ADMIN_MEMBERSHIPS_HREF,
  ANNOUNCEMENTS_HREF,
  BLOOD_VERIFICATIONS_HREF,
  MY_CLUB_HREF,
} from '../../_components/nav';
import { Panel } from '../../_components/panel';
import { HorizontalBarChart } from './bar-chart';
import { CommitteeList } from './committee-list';
import { SectionError, SectionHeading, SectionSkeleton } from './section-state';
import { StatRow, StatTile } from './stat-tile';
import { EventStatusCounts } from './status-counts';

/** FR-DASH-003: every figure is the caller's own department. */
export function DeptAdminSection() {
  const view = useDeptAdminDashboard();
  return (
    <section aria-labelledby="dash-dept" className="flex flex-col gap-4">
      <SectionHeading
        id="dash-dept"
        title={view.data ? `${view.data.department.name} department` : 'Your department'}
        tag="SYS.DASH.DEPT"
        description="Your department and its club, as department admin."
      />
      {view.isPending ? (
        <SectionSkeleton label="Loading your department…" />
      ) : view.isError ? (
        <SectionError
          title="Couldn't load your department's figures."
          onRetry={() => void view.refetch()}
          retrying={view.isFetching}
        />
      ) : (
        <DeptPanels data={view.data} />
      )}
    </section>
  );
}

function DeptPanels({ data }: { data: DeptAdminDashboard }) {
  const pending = data.pending_blood_verifications;
  return (
    <div className="flex flex-col gap-4">
      <TermBanner term={data.admin_term} />

      <StatRow>
        <StatTile
          index={0}
          label="Active users"
          value={sumCounts(data.users_by_role)}
          note="In your department"
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
          label="Announcements"
          value={data.announcements_this_month}
          note="Posted this month"
          href={ANNOUNCEMENTS_HREF}
        />
        <StatTile
          index={3}
          label="Blood verifications"
          value={pending}
          note={pending > 0 ? 'Waiting for you to verify' : 'Nothing waiting'}
          href={BLOOD_VERIFICATIONS_HREF}
          attention={pending > 0}
        />
      </StatRow>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          id="dash-dept-roles"
          title="Users by role"
          tag="SYS.DASH.ROLES"
          description="Active accounts in your department."
        >
          <HorizontalBarChart
            rows={roleRows(data.users_by_role).filter((r) => r.key !== 'super_admin')}
            caption="Active users in your department by role"
            unit="Users"
          />
        </Panel>

        <Panel
          id="dash-dept-events"
          title="Events this month"
          tag="SYS.DASH.EVENTS"
          description={`${data.events_this_month.total} of your club's events start this month.`}
        >
          <EventStatusCounts counts={data.events_this_month.by_status} />
        </Panel>

        <Panel
          id="dash-dept-committee"
          title={
            <span className="flex items-center gap-2">
              Club committee
              {data.committee.vacant ? (
                <Badge variant="warning" className="uppercase">
                  Vacant
                </Badge>
              ) : null}
            </span>
          }
          tag="SYS.DASH.COMMITTEE"
          className="lg:col-span-2"
          footer={
            <Link href={MY_CLUB_HREF} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {data.committee.vacant ? 'Assign a committee' : 'Open club page'}
            </Link>
          }
        >
          {data.committee.vacant ? (
            <p className="text-sm text-fg-secondary">
              Your club has no current committee, so no one can run its events. Assign members on
              the club page.
            </p>
          ) : (
            <CommitteeList entries={data.committee.current} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function TermBanner({ term }: { term: DeptAdminDashboard['admin_term'] }) {
  if (!term) {
    return (
      <p className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-fg-secondary">
        No current admin term is on record for you.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="micro-label">Your term</span>
        <span className="font-mono text-foreground tabular-nums">
          {formatDate(term.start_date)} – {formatDate(term.end_date)}
        </span>
      </span>
      <Badge variant={daysLeftTone(term.days_left)}>
        {formatDaysLeft(term.days_left)}
        {term.days_left > 0 ? ' left' : ''}
      </Badge>
    </div>
  );
}
