'use client';

import { BLOOD_GROUPS, BLOOD_REQUEST_STATUSES, type BloodRequest } from '@uniconnect/shared';
import { useId, useMemo, useState } from 'react';
import { BloodGroupBadge, BloodRequestStatusBadge } from '@/components/blood-badges';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { useBloodRequests } from '@/hooks/use-blood';
import { useDepartments } from '@/hooks/use-departments';
import {
  formatBloodGroup,
  REQUEST_STATUS_META,
  requestParamsFromUrl,
  todayInDhaka,
} from '@/lib/blood';
import { formatDate } from '@/lib/format';
import { FilterSelect, Pager } from '../../../_components/list-controls';
import { CancelRequestDialog } from './cancel-request-dialog';
import { FulfillRequestDialog } from './fulfill-request-dialog';
import { EmptyState, PhoneLink, TableSkeleton } from './list-states';
import type { Navigate } from './use-url-params';

const FILTER_KEYS = ['r_status', 'r_blood_group', 'r_department_id', 'r_page'] as const;

/** Requests (FR-BLOOD-006): pending by default, soonest deadline first. */
export function RequestsTab({ search, navigate }: { search: URLSearchParams; navigate: Navigate }) {
  const params = requestParamsFromUrl(search);
  const requests = useBloodRequests(params);
  const departments = useDepartments();
  const id = useId();
  const [open, setOpen] = useState<{ kind: 'fulfill' | 'cancel'; r: BloodRequest } | null>(null);

  const status = params.status ?? 'pending';
  const filtered =
    params.status !== undefined ||
    params.blood_group !== undefined ||
    params.department_id !== undefined;
  const columns = useMemo(() => buildColumns(status !== 'pending', setOpen), [status]);
  const set = (next: Record<string, string | undefined>) =>
    navigate({ ...next, r_page: undefined });
  const clear = () => navigate(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])));

  return (
    <>
      <div
        role="search"
        aria-label="Filter blood requests"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <FilterSelect
          id={`${id}-status`}
          label="Status"
          value={params.status && params.status !== 'pending' ? params.status : ''}
          onChange={(v) => set({ r_status: v })}
          options={BLOOD_REQUEST_STATUSES.filter((s) => s !== 'pending').map((s) => [
            s,
            REQUEST_STATUS_META[s].label,
          ])}
          all="Pending"
        />
        <FilterSelect
          id={`${id}-group`}
          label="Blood group"
          value={params.blood_group ?? ''}
          onChange={(v) => set({ r_blood_group: v })}
          options={BLOOD_GROUPS.map((g) => [g, formatBloodGroup(g)])}
          all="All blood groups"
        />
        <FilterSelect
          id={`${id}-dept`}
          label="Requester's department"
          value={params.department_id ? String(params.department_id) : ''}
          onChange={(v) => set({ r_department_id: v })}
          options={(departments.data ?? []).map((d) => [String(d.id), d.name])}
          all="All departments"
        />
      </div>

      {requests.isPending ? (
        <TableSkeleton label="Loading blood requests…" />
      ) : requests.isError ? (
        <ErrorState
          title="Couldn't load blood requests."
          onRetry={() => void requests.refetch()}
          retrying={requests.isFetching}
        />
      ) : requests.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No requests match these filters' : 'No open blood requests'}
          text={
            filtered
              ? 'Try fewer filters.'
              : 'When someone needs blood, their request appears here. Post one with New blood request.'
          }
          onClear={filtered ? clear : undefined}
        />
      ) : (
        <div aria-busy={requests.isFetching}>
          <DataTable
            columns={columns}
            data={requests.data.data}
            caption={`${REQUEST_STATUS_META[status].label} blood requests, soonest needed first`}
            getRowId={(r) => String(r.id)}
            stale={requests.isPlaceholderData}
            footer={() => (
              <Pager meta={requests.data.meta} onPage={(page) => navigate({ r_page: page })} />
            )}
          />
        </div>
      )}

      {open?.kind === 'fulfill' ? (
        <FulfillRequestDialog request={open.r} onClose={() => setOpen(null)} />
      ) : open?.kind === 'cancel' ? (
        <CancelRequestDialog request={open.r} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

function buildColumns(
  showStatus: boolean,
  onOpen: (o: { kind: 'fulfill' | 'cancel'; r: BloodRequest }) => void,
): DataColumn<BloodRequest>[] {
  const col = dataColumns<BloodRequest>();
  const today = todayInDhaka();
  return [
    col.display({
      id: 'patient',
      header: 'Patient',
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.original.patient_name}</span>
          <span className="truncate text-xs text-fg-secondary">{row.original.hospital_name}</span>
          {/* Phones hide the date and contact columns; keep both reachable here. */}
          <span className="flex flex-wrap gap-x-2 text-xs sm:hidden">
            <span className="font-mono text-fg-secondary tabular-nums">
              By {formatDate(row.original.required_by_date)}
            </span>
            <PhoneLink phone={row.original.contact_phone} />
          </span>
          {row.original.reason ? (
            <span className="truncate text-xs text-fg-tertiary" title={row.original.reason}>
              {row.original.reason}
            </span>
          ) : null}
        </span>
      ),
      meta: { className: 'max-w-[12rem] sm:max-w-[18rem]' },
    }),
    col.display({
      id: 'group',
      header: 'Group',
      cell: ({ row }) => <BloodGroupBadge group={row.original.blood_group} />,
    }),
    col.display({
      id: 'units',
      header: 'Units',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">{row.original.units_needed}</span>
      ),
      meta: { className: 'text-right' },
    }),
    col.display({
      id: 'needed',
      header: 'Needed by',
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-fg-secondary tabular-nums">
            {formatDate(row.original.required_by_date)}
          </span>
          {row.original.status === 'pending' && row.original.required_by_date === today ? (
            <Badge variant="warning">Today</Badge>
          ) : null}
        </span>
      ),
      meta: { className: 'hidden sm:table-cell' },
    }),
    col.display({
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => <PhoneLink phone={row.original.contact_phone} />,
      meta: { className: 'hidden sm:table-cell' },
    }),
    col.display({
      id: 'requester',
      header: 'Requested by',
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{row.original.requester.name}</span>
          <span className="truncate text-xs text-fg-tertiary">
            {row.original.requester.department?.name ?? 'All departments'}
          </span>
        </span>
      ),
      meta: { className: 'hidden md:table-cell' },
    }),
    ...(showStatus
      ? [
          col.display({
            id: 'status',
            header: 'Status',
            cell: ({ row }) => <BloodRequestStatusBadge status={row.original.status} />,
          }),
        ]
      : []),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <span className="flex justify-end gap-1.5">
          {row.original.can_fulfill ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpen({ kind: 'fulfill', r: row.original })}
            >
              Fulfill
              <span className="sr-only"> the request for {row.original.patient_name}</span>
            </Button>
          ) : null}
          {row.original.can_cancel ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpen({ kind: 'cancel', r: row.original })}
            >
              Cancel
              <span className="sr-only"> the request for {row.original.patient_name}</span>
            </Button>
          ) : null}
        </span>
      ),
      meta: { className: 'text-right' },
    }),
  ];
}
