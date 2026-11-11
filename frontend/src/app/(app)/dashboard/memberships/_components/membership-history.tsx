'use client';

import type { ClubDetail, MembershipSummary } from '@uniconnect/shared';
import { useState } from 'react';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { MembershipStatusBadge } from '@/components/membership-status-badge';
import { formatBdt, formatDate } from '@/lib/format';
import { PAYMENT_LABEL, PLAN_LABEL } from '@/lib/membership';
import { Pager } from '../../../_components/list-controls';
import { Panel } from '../../../_components/panel';

const PAGE_SIZE = 10;
const col = dataColumns<MembershipSummary>();

const COLUMNS: DataColumn<MembershipSummary>[] = [
  col.accessor((m) => m.club.name, {
    id: 'club',
    header: 'Club',
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
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
    meta: { className: 'hidden md:table-cell' },
  }),
  col.display({
    id: 'transaction',
    header: 'Transaction',
    cell: ({ row }) =>
      row.original.payment ? (
        <span
          className="block max-w-[12rem] truncate font-mono text-xs text-fg-tertiary"
          title={row.original.payment.transaction_id}
        >
          {row.original.payment.transaction_id}
        </span>
      ) : null,
    meta: { className: 'hidden lg:table-cell' },
  }),
];

/** Every membership the student has had, newest first (PRD FR-MEM-004). */
export function MembershipHistory({
  memberships,
  club,
  className,
}: {
  memberships: MembershipSummary[];
  club: ClubDetail;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const total = memberships.length;

  return (
    <Panel
      id="membership-history-title"
      title="History"
      tag="SYS.MEMBERSHIP.HISTORY"
      description="Every membership and checkout, with what was paid."
      className={className}
    >
      {total === 0 ? (
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="font-medium">No memberships yet</p>
          <p className="text-fg-secondary">
            Memberships of {club.name} you buy or renew appear here, with their payments.
          </p>
        </div>
      ) : (
        <DataTable
          columns={COLUMNS}
          data={memberships}
          caption="Your memberships, newest first"
          getRowId={(m) => String(m.id)}
          pageSize={PAGE_SIZE}
          pageIndex={page}
          footer={(pageCount) =>
            pageCount > 1 ? (
              <Pager
                meta={{ page: page + 1, limit: PAGE_SIZE, total, total_pages: pageCount }}
                onPage={(next) => setPage(next - 1)}
              />
            ) : null
          }
        />
      )}
    </Panel>
  );
}
