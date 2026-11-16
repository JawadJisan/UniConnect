'use client';

import type { Donation } from '@uniconnect/shared';
import Link from 'next/link';
import { useMemo } from 'react';
import { BloodGroupBadge, DonationStatusBadge } from '@/components/blood-badges';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormAlert } from '@/components/ui/form-alert';
import { useMyDonations } from '@/hooks/use-blood';
import { myDonationsPageFromUrl } from '@/lib/blood';
import { formatDate } from '@/lib/format';
import { Pager } from '../../../_components/list-controls';
import { Panel } from '../../../_components/panel';
import { useProfile } from '../../../_components/require-session';
import { EmptyState, TableSkeleton } from './list-states';
import type { Navigate } from './use-url-params';

/**
 * My donations (FR-BLOOD-003): the caller's records with their verification state. Only
 * verified donations move "last verified donation" (FR-BLOOD-002).
 */
export function MyDonationsTab({
  search,
  navigate,
  onRecord,
}: {
  search: URLSearchParams;
  navigate: Navigate;
  onRecord: () => void;
}) {
  const profile = useProfile();
  const page = myDonationsPageFromUrl(search);
  const donations = useMyDonations(page ? { page } : {});
  const columns = useMemo(() => buildColumns(), []);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <Panel id="donor-summary-title" title="You as a donor" tag="SYS.BLOOD.DONOR">
        {profile.blood_group ? (
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
            <dt className="micro-label">BLOOD GROUP</dt>
            <dd>
              <BloodGroupBadge group={profile.blood_group} />
            </dd>
            <dt className="micro-label">LAST VERIFIED</dt>
            <dd className="font-mono tabular-nums">
              {profile.last_donation_date ? formatDate(profile.last_donation_date) : 'None yet'}
            </dd>
            <dt className="micro-label">RECORDS</dt>
            <dd className="font-mono tabular-nums">
              {donations.data ? donations.data.meta.total : '—'}
            </dd>
          </dl>
        ) : (
          <FormAlert tone="info" title="Add your blood group first.">
            Donations use the blood group on your profile.
            <Link
              href="/dashboard/profile"
              className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
            >
              Open profile
            </Link>
          </FormAlert>
        )}
      </Panel>

      <section
        aria-labelledby="donation-history-title"
        className="flex min-w-0 flex-col gap-3 lg:col-span-2"
      >
        <h2 id="donation-history-title" className="text-md font-medium">
          History
        </h2>
        {donations.isPending ? (
          <TableSkeleton label="Loading your donations…" />
        ) : donations.isError ? (
          <ErrorState
            title="Couldn't load your donations."
            onRetry={() => void donations.refetch()}
            retrying={donations.isFetching}
          />
        ) : donations.data.data.length === 0 ? (
          <EmptyState
            title="No donations recorded yet"
            text="Record a donation after you give blood. Once an admin verifies it, you show as a verified donor."
            action={
              <Button variant="secondary" size="sm" onClick={onRecord}>
                Record donation
              </Button>
            }
          />
        ) : (
          <div aria-busy={donations.isFetching}>
            <DataTable
              columns={columns}
              data={donations.data.data}
              caption="Your donations, newest first"
              getRowId={(d) => String(d.id)}
              stale={donations.isPlaceholderData}
              footer={() => (
                <Pager meta={donations.data.meta} onPage={(p) => navigate({ m_page: p })} />
              )}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function buildColumns(): DataColumn<Donation>[] {
  const col = dataColumns<Donation>();
  return [
    col.display({
      id: 'date',
      header: 'Donated',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">{formatDate(row.original.donation_date)}</span>
      ),
    }),
    col.display({
      id: 'units',
      header: 'Units',
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.units}</span>,
      meta: { className: 'text-right' },
    }),
    col.display({
      id: 'hospital',
      header: 'Hospital',
      cell: ({ row }) => (
        <span className="text-fg-secondary">{row.original.hospital_name ?? '—'}</span>
      ),
      meta: { className: 'hidden sm:table-cell' },
    }),
    col.display({
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <DonationStatusBadge verified={row.original.verified} />,
    }),
    col.display({
      id: 'verified_at',
      header: 'Verified on',
      cell: ({ row }) => (
        <span className="font-mono text-fg-secondary tabular-nums">
          {row.original.verified_at ? formatDate(row.original.verified_at) : '—'}
        </span>
      ),
      meta: { className: 'hidden md:table-cell' },
    }),
  ];
}
