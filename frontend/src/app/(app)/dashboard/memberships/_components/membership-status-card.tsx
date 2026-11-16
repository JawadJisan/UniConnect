'use client';

import type { ClubDetail, MembershipSummary } from '@uniconnect/shared';
import { useState } from 'react';
import { CancelMembershipDialog } from '@/components/cancel-membership-dialog';
import { MembershipStatusBadge } from '@/components/membership-status-badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import {
  addDays,
  daysLeft,
  formatDaysLeft,
  membershipActions,
  PLAN_LABEL,
  type MembershipState,
} from '@/lib/membership';
import { Panel } from '../../../_components/panel';
import { ClubLogo } from '../../clubs/_components/club-logo';
import { PlanDialog, type PlanDialogMode } from './plan-dialog';

/**
 * The student's standing with their department's club (PRD FR-MEM-001–003). The actions follow
 * the API's one-active, one-open-row rule (ADR 0001), so a button shown here is one the API
 * normally accepts; when it doesn't, the dialog shows its message.
 */
export function MembershipStatusCard({
  club,
  state,
}: {
  club: ClubDetail;
  state: MembershipState;
}) {
  const actions = membershipActions(state);
  const [plan, setPlan] = useState<PlanDialogMode | null>(null);
  const [cancelling, setCancelling] = useState<MembershipSummary | null>(null);
  const shown = state.active ?? state.scheduled ?? state.pending;
  const hasFee = club.membership_fee_monthly !== null || club.membership_fee_yearly !== null;

  const footer = (
    <>
      {actions.cancelCheckout ? (
        <Button variant="secondary" onClick={() => setCancelling(actions.cancelCheckout!)}>
          Cancel checkout
        </Button>
      ) : null}
      {actions.cancel ? (
        <Button variant="ghost" onClick={() => setCancelling(actions.cancel!)}>
          Cancel membership
        </Button>
      ) : null}
      {actions.renewFrom ? (
        <Button
          disabled={!hasFee}
          onClick={() => setPlan({ kind: 'renew', from: actions.renewFrom! })}
        >
          Renew
        </Button>
      ) : null}
      {actions.purchase ? (
        <Button disabled={!hasFee} onClick={() => setPlan({ kind: 'purchase' })}>
          Purchase membership
        </Button>
      ) : null}
    </>
  );

  return (
    <Panel
      id="membership-status-title"
      title={
        <span className="flex min-w-0 items-center gap-3">
          <ClubLogo name={club.name} src={club.logo_url} size={40} />
          <span className="truncate">{club.name}</span>
        </span>
      }
      tag="SYS.MEMBERSHIP.STATUS"
      footer={footer}
    >
      {shown ? (
        <MembershipFacts membership={shown} state={state} />
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">You&apos;re not a member of {club.name}.</p>
          <p className="text-fg-secondary">
            {state.latest
              ? `Your last membership ${state.latest.status === 'expired' ? 'ended' : 'was cancelled'} on ${formatDate(state.latest.end_date)}.`
              : 'Members can join members-only events. Pick a monthly or yearly plan.'}
          </p>
        </div>
      )}

      {!hasFee && (actions.purchase || actions.renewFrom) ? (
        <p className="mt-4 text-sm text-fg-tertiary">
          Your department admin hasn&apos;t set a membership fee yet, so memberships can&apos;t be
          bought.
        </p>
      ) : null}
      {state.active && state.scheduled ? (
        <p className="mt-4 text-sm text-fg-secondary">
          Your renewal is paid and starts on{' '}
          <span className="font-mono text-foreground">
            {formatDate(state.scheduled.start_date)}
          </span>
          .
        </p>
      ) : null}
      {state.pending && shown !== state.pending ? (
        <p className="mt-4 text-sm text-fg-secondary">
          A renewal checkout is waiting for payment. It closes 30 minutes after it started.
        </p>
      ) : null}

      {plan ? (
        <PlanDialog
          club={club}
          mode={plan}
          open
          onOpenChange={(open) => {
            if (!open) setPlan(null);
          }}
        />
      ) : null}
      {cancelling ? (
        <CancelMembershipDialog
          membership={cancelling}
          open
          onOpenChange={(open) => {
            if (!open) setCancelling(null);
          }}
        />
      ) : null}
    </Panel>
  );
}

function MembershipFacts({
  membership: m,
  state,
}: {
  membership: MembershipSummary;
  state: MembershipState;
}) {
  const left = daysLeft(m.end_date);
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-6 gap-y-3 text-sm">
      <dt className="micro-label">STATUS</dt>
      <dd>
        <MembershipStatusBadge status={m.status} />
      </dd>
      <dt className="micro-label">PLAN</dt>
      <dd>{PLAN_LABEL[m.type]}</dd>
      <dt className="micro-label">PERIOD</dt>
      <dd className="font-mono text-fg-secondary">
        {formatDate(m.start_date)} – {formatDate(m.end_date)}
      </dd>
      {m.status === 'active' ? (
        <>
          <dt className="micro-label">EXPIRES IN</dt>
          <dd className="font-mono">{formatDaysLeft(left)}</dd>
        </>
      ) : null}
      {m.status === 'scheduled' ? (
        <>
          <dt className="micro-label">STARTS</dt>
          <dd className="font-mono">{formatDate(m.start_date)}</dd>
        </>
      ) : null}
      {m.status === 'pending' && m === state.pending ? (
        <dd className="col-span-2 text-fg-secondary">
          Checkout in progress. It closes 30 minutes after it started; if you paid, the membership
          starts as soon as the payment is confirmed.
        </dd>
      ) : null}
      {m.status === 'active' && left <= 7 && !state.scheduled ? (
        <dd className="col-span-2 text-fg-secondary">
          Renew now and the new period starts on {formatDate(addDays(m.end_date, 1))}, with no gap.
        </dd>
      ) : null}
    </dl>
  );
}
