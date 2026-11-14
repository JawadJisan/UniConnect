'use client';

import { BLOOD_GROUPS, type Donor } from '@uniconnect/shared';
import { ShieldCheckIcon } from 'lucide-react';
import { useId, useMemo } from 'react';
import { BloodGroupBadge } from '@/components/blood-badges';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { useDonors } from '@/hooks/use-blood';
import { useDepartments } from '@/hooks/use-departments';
import { donorParamsFromUrl, formatBloodGroup } from '@/lib/blood';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FilterSelect, Pager } from '../../../_components/list-controls';
import { EmptyState, PhoneLink, TableSkeleton } from './list-states';
import type { Navigate } from './use-url-params';

const FILTER_KEYS = ['d_blood_group', 'd_department_id', 'd_verified_only', 'd_page'] as const;

/**
 * Donor directory (FR-BLOOD-004; D14, PRD #14): people who recorded a donation, most recent
 * verified donation first. Phone is shown to signed-in users; email never is.
 */
export function DonorsTab({ search, navigate }: { search: URLSearchParams; navigate: Navigate }) {
  const params = donorParamsFromUrl(search);
  const donors = useDonors(params);
  const departments = useDepartments();
  const id = useId();
  const verifiedOnly = params.verified_only === 'true';
  const filtered =
    params.blood_group !== undefined || params.department_id !== undefined || verifiedOnly;
  const columns = useMemo(() => buildColumns(), []);
  const set = (next: Record<string, string | undefined>) =>
    navigate({ ...next, d_page: undefined });
  const clear = () => navigate(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])));

  return (
    <>
      <div
        role="search"
        aria-label="Filter donors"
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <div className="sm:w-48">
          <FilterSelect
            id={`${id}-group`}
            label="Blood group"
            value={params.blood_group ?? ''}
            onChange={(v) => set({ d_blood_group: v })}
            options={BLOOD_GROUPS.map((g) => [g, formatBloodGroup(g)])}
            all="All blood groups"
          />
        </div>
        <div className="sm:w-56">
          <FilterSelect
            id={`${id}-dept`}
            label="Department"
            value={params.department_id ? String(params.department_id) : ''}
            onChange={(v) => set({ d_department_id: v })}
            options={(departments.data ?? []).map((d) => [String(d.id), d.name])}
            all="All departments"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={verifiedOnly}
          className={cn(
            'h-9 self-start sm:self-auto',
            verifiedOnly && 'bg-surface-3 text-foreground',
          )}
          onClick={() => set({ d_verified_only: verifiedOnly ? undefined : 'true' })}
        >
          <ShieldCheckIcon data-icon="inline-start" />
          Verified only
        </Button>
      </div>
      <p className="-mt-3 text-sm text-fg-tertiary">
        Donors appear here once they record a donation. Verified means an admin confirmed at least
        one of them.
      </p>

      {donors.isPending ? (
        <TableSkeleton label="Loading donors…" />
      ) : donors.isError ? (
        <ErrorState
          title="Couldn't load donors."
          onRetry={() => void donors.refetch()}
          retrying={donors.isFetching}
        />
      ) : donors.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No donors match these filters' : 'No donors yet'}
          text={
            filtered
              ? 'Try another blood group or department, or include unverified donors.'
              : 'The first donation someone records puts them in this list.'
          }
          onClear={filtered ? clear : undefined}
        />
      ) : (
        <div aria-busy={donors.isFetching}>
          <DataTable
            columns={columns}
            data={donors.data.data}
            caption="Donors, most recent verified donation first"
            getRowId={(d) => d.id}
            stale={donors.isPlaceholderData}
            footer={() => (
              <Pager meta={donors.data.meta} onPage={(page) => navigate({ d_page: page })} />
            )}
          />
        </div>
      )}
    </>
  );
}

function buildColumns(): DataColumn<Donor>[] {
  const col = dataColumns<Donor>();
  return [
    col.display({
      id: 'donor',
      header: 'Donor',
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.original.name} size={24} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.original.name}</span>
            {/* Phones hide the phone column; keep the number reachable. */}
            <span className="text-xs sm:hidden">
              {row.original.phone ? (
                <PhoneLink phone={row.original.phone} />
              ) : (
                <span className="text-fg-tertiary">No phone shared</span>
              )}
            </span>
          </span>
        </span>
      ),
      meta: { className: 'max-w-[12rem] sm:max-w-none' },
    }),
    col.display({
      id: 'group',
      header: 'Group',
      cell: ({ row }) => <BloodGroupBadge group={row.original.blood_group} />,
    }),
    col.display({
      id: 'department',
      header: 'Department',
      cell: ({ row }) => (
        <span className="text-fg-secondary">{row.original.department?.name ?? '—'}</span>
      ),
      meta: { className: 'hidden md:table-cell' },
    }),
    col.display({
      id: 'last',
      header: 'Last donation',
      cell: ({ row }) => (
        <span className="font-mono text-fg-secondary tabular-nums">
          {row.original.last_donation_date ? formatDate(row.original.last_donation_date) : '—'}
        </span>
      ),
      meta: { className: 'hidden lg:table-cell' },
    }),
    col.display({
      id: 'verified',
      header: 'Status',
      cell: ({ row }) =>
        row.original.verified ? (
          <Badge variant="success" className="tracking-wide uppercase">
            <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
            Verified
          </Badge>
        ) : (
          <Badge variant="secondary" className="tracking-wide uppercase">
            Unverified
          </Badge>
        ),
    }),
    col.display({
      id: 'phone',
      header: 'Phone',
      cell: ({ row }) =>
        row.original.phone ? (
          <PhoneLink phone={row.original.phone} />
        ) : (
          <span className="text-fg-tertiary">Not shared</span>
        ),
      meta: { className: 'hidden sm:table-cell' },
    }),
  ];
}
