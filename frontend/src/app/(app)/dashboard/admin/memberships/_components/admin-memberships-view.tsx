'use client';

import {
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_TYPES,
  type AdminMembershipListParams,
  type AdminMembershipRow,
} from '@uniconnect/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { CancelMembershipDialog } from '@/components/cancel-membership-dialog';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { MembershipStatusBadge } from '@/components/membership-status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useClubs } from '@/hooks/use-clubs';
import { useAdminMemberships } from '@/hooks/use-memberships';
import type { ApiError } from '@/lib/api';
import { formatBdt, formatDate } from '@/lib/format';
import { CANCELLABLE, PAYMENT_LABEL, PLAN_LABEL, STATUS_META } from '@/lib/membership';
import { FilterSelect, Pager } from '../../../../_components/list-controls';
import { useProfile } from '../../../../_components/require-session';

const FILTER_KEYS = ['status', 'type', 'club_id'] as const;

/** Reads list params from the URL, keeping only values the API accepts. */
export function paramsFromUrl(search: URLSearchParams): AdminMembershipListParams {
  const params: AdminMembershipListParams = {};
  const status = search.get('status');
  if (status && (MEMBERSHIP_STATUSES as readonly string[]).includes(status)) {
    params.status = status as AdminMembershipListParams['status'];
  }
  const type = search.get('type');
  if (type && (MEMBERSHIP_TYPES as readonly string[]).includes(type)) {
    params.type = type as AdminMembershipListParams['type'];
  }
  const club = Number(search.get('club_id'));
  if (Number.isInteger(club) && club > 0) params.club_id = club;
  const page = Number(search.get('page'));
  if (Number.isInteger(page) && page > 1) params.page = page;
  return params;
}

/**
 * /dashboard/admin/memberships (PRD FR-MEM-005). A dept_admin sees their department's club only
 * (the API filters; there is no club picker for them), a super admin every club.
 */
export function AdminMembershipsView() {
  const profile = useProfile();
  if (profile.role !== 'dept_admin' && profile.role !== 'super_admin') {
    return (
      <div className="container-wide py-8">
        <FormAlert tone="error" title="You don't have access to this page." className="max-w-xl">
          Membership records are for department admins and super admins.
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
  return <MembershipList allClubs={profile.role === 'super_admin'} />;
}

function MembershipList({ allClubs }: { allClubs: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = paramsFromUrl(new URLSearchParams(searchParams.toString()));
  if (!allClubs) delete params.club_id;
  const list = useAdminMemberships(params);
  const filterId = useId();
  const [cancelling, setCancelling] = useState<AdminMembershipRow | null>(null);

  function navigate(next: Record<string, string | number | undefined>, keepPage = false) {
    const merged = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') merged.delete(key);
      else merged.set(key, String(value));
    }
    if (!keepPage) merged.delete('page');
    const query = merged.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const filtered = FILTER_KEYS.some((k) => params[k] !== undefined);
  const columns = useMemo(() => buildColumns(allClubs, setCancelling), [allClubs]);

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display-sm">Memberships</h1>
        <p className="text-sm text-fg-secondary">
          {allClubs
            ? 'Every club membership and its payment, across departments.'
            : "Your department's club memberships and their payments."}
        </p>
      </header>

      <div
        role="search"
        aria-label="Filter memberships"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <FilterSelect
          id={`${filterId}-status`}
          label="Status"
          value={params.status ?? ''}
          onChange={(v) => navigate({ status: v })}
          options={MEMBERSHIP_STATUSES.map((s) => [s, STATUS_META[s].label])}
          all="Any status"
        />
        <FilterSelect
          id={`${filterId}-type`}
          label="Plan"
          value={params.type ?? ''}
          onChange={(v) => navigate({ type: v })}
          options={MEMBERSHIP_TYPES.map((t) => [t, PLAN_LABEL[t]])}
          all="All plans"
        />
        {allClubs ? (
          <ClubFilter
            id={`${filterId}-club`}
            value={params.club_id ? String(params.club_id) : ''}
            onChange={(v) => navigate({ club_id: v })}
          />
        ) : null}
      </div>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState
          title={
            (list.error as ApiError).status === 403
              ? "You don't have access to membership records."
              : "Couldn't load memberships."
          }
          onRetry={(list.error as ApiError).status === 403 ? undefined : () => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : list.data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <p className="text-md font-medium">
            {filtered ? 'No memberships match these filters' : 'No memberships yet'}
          </p>
          <p className="text-sm text-fg-secondary">
            {filtered
              ? 'Try fewer filters.'
              : 'Memberships appear here once students start a checkout.'}
          </p>
          {filtered ? (
            <Button variant="secondary" size="sm" onClick={() => router.replace(pathname)}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <div aria-busy={list.isFetching}>
          <DataTable
            columns={columns}
            data={list.data.data}
            caption="Memberships, newest first"
            getRowId={(m) => String(m.id)}
            stale={list.isPlaceholderData}
            footer={() => (
              <Pager meta={list.data.meta} onPage={(page) => navigate({ page }, true)} />
            )}
          />
        </div>
      )}

      {cancelling ? (
        <CancelMembershipDialog
          membership={cancelling}
          memberName={cancelling.user.name}
          open
          onOpenChange={(open) => {
            if (!open) setCancelling(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ClubFilter({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const clubs = useClubs();
  return (
    <FilterSelect
      id={id}
      label="Club"
      value={value}
      onChange={onChange}
      options={(clubs.data?.data ?? []).map((c) => [String(c.id), c.name])}
      all="All clubs"
    />
  );
}

function buildColumns(
  allClubs: boolean,
  onCancel: (row: AdminMembershipRow) => void,
): DataColumn<AdminMembershipRow>[] {
  const col = dataColumns<AdminMembershipRow>();
  return [
    col.display({
      id: 'member',
      header: 'Member',
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.original.user.name}</span>
          <span className="truncate text-xs text-fg-tertiary">
            {row.original.user.student_id ?? row.original.user.email}
          </span>
        </span>
      ),
      meta: { className: 'max-w-[14rem] sm:max-w-none' },
    }),
    ...(allClubs
      ? [
          col.accessor((m) => m.club.name, {
            id: 'club',
            header: 'Club',
            meta: { className: 'hidden text-fg-secondary md:table-cell' },
          }),
        ]
      : []),
    col.display({ id: 'type', header: 'Plan', cell: ({ row }) => PLAN_LABEL[row.original.type] }),
    col.display({
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <MembershipStatusBadge status={row.original.status} />,
    }),
    col.display({
      id: 'period',
      header: 'Period',
      cell: ({ row }) => (
        <span className="font-mono text-fg-secondary">
          {formatDate(row.original.start_date)} – {formatDate(row.original.end_date)}
        </span>
      ),
      meta: { className: 'hidden sm:table-cell' },
    }),
    col.display({
      id: 'amount',
      header: 'Amount',
      cell: ({ row }) => (
        <span className="font-mono">
          {row.original.payment ? formatBdt(row.original.payment.amount) : '—'}
        </span>
      ),
      meta: { className: 'text-right' },
    }),
    col.display({
      id: 'payment',
      header: 'Payment',
      cell: ({ row }) => (
        <span className="text-fg-secondary">
          {row.original.payment ? PAYMENT_LABEL[row.original.payment.status] : '—'}
        </span>
      ),
      meta: { className: 'hidden lg:table-cell' },
    }),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        CANCELLABLE.includes(row.original.status) ? (
          <Button variant="ghost" size="sm" onClick={() => onCancel(row.original)}>
            Cancel
            <span className="sr-only"> {row.original.user.name}&apos;s membership</span>
          </Button>
        ) : null,
      meta: { className: 'text-right' },
    }),
  ];
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-busy="true">
      <span className="sr-only">Loading memberships…</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
