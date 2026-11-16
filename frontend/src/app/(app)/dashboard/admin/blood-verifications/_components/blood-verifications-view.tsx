'use client';

import type { UnverifiedDonation } from '@uniconnect/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { BloodGroupBadge } from '@/components/blood-badges';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnverifiedDonations } from '@/hooks/use-blood';
import { useDepartments } from '@/hooks/use-departments';
import type { ApiError } from '@/lib/api';
import { canVerify, unverifiedParamsFromUrl } from '@/lib/blood';
import { formatDate } from '@/lib/format';
import { FilterSelect, Pager } from '../../../../_components/list-controls';
import { useProfile } from '../../../../_components/require-session';
import { VerifyDonationDialog } from './verify-donation-dialog';

/**
 * /dashboard/admin/blood-verifications (PRD FR-BLOOD-002, -010; D41). A dept_admin sees their
 * department's unverified donations (the API scopes it; no department picker), a super admin
 * every department. Oldest first, so nothing waits forever.
 */
export function BloodVerificationsView() {
  const profile = useProfile();
  if (!canVerify(profile.role)) {
    return (
      <div className="container-wide py-8">
        <FormAlert tone="error" title="You don't have access to this page." className="max-w-xl">
          Blood donations are verified by department admins and super admins.
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
  return <Queue allDepartments={profile.role === 'super_admin'} myId={profile.id} />;
}

function Queue({ allDepartments, myId }: { allDepartments: boolean; myId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = unverifiedParamsFromUrl(new URLSearchParams(searchParams.toString()));
  if (!allDepartments) delete params.department_id;
  const list = useUnverifiedDonations(params);
  const departments = useDepartments();
  const filterId = useId();
  const [verifying, setVerifying] = useState<UnverifiedDonation | null>(null);

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

  const filtered = params.department_id !== undefined;
  const columns = useMemo(
    () => buildColumns(allDepartments, myId, setVerifying),
    [allDepartments, myId],
  );

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display-sm">Blood verifications</h1>
        <p className="text-sm text-fg-secondary">
          {allDepartments
            ? 'Donations waiting for verification, across departments. Oldest first.'
            : 'Donations from your department waiting for verification. Oldest first.'}{' '}
          A verified donation updates the donor&apos;s last donation date.
        </p>
      </header>

      {allDepartments ? (
        <div role="search" aria-label="Filter donations" className="sm:w-56">
          <FilterSelect
            id={`${filterId}-dept`}
            label="Department"
            value={params.department_id ? String(params.department_id) : ''}
            onChange={(v) => navigate({ department_id: v })}
            options={(departments.data ?? []).map((d) => [String(d.id), d.name])}
            all="All departments"
          />
        </div>
      ) : null}

      {list.isPending ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-busy="true">
          <span className="sr-only">Loading donations…</span>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState
          title={
            (list.error as ApiError).status === 403
              ? "You don't have access to blood verifications."
              : "Couldn't load donations."
          }
          onRetry={(list.error as ApiError).status === 403 ? undefined : () => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : list.data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <p className="text-md font-medium">
            {filtered ? 'Nothing waiting in this department' : 'Nothing to verify'}
          </p>
          <p className="text-sm text-fg-secondary">
            {filtered
              ? 'Try another department.'
              : 'Donations appear here when donors record them.'}
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
            caption="Unverified donations, oldest first"
            getRowId={(d) => String(d.id)}
            stale={list.isPlaceholderData}
            footer={() => (
              <Pager meta={list.data.meta} onPage={(page) => navigate({ page }, true)} />
            )}
          />
        </div>
      )}

      {verifying ? (
        <VerifyDonationDialog donation={verifying} onClose={() => setVerifying(null)} />
      ) : null}
    </div>
  );
}

function buildColumns(
  allDepartments: boolean,
  myId: string,
  onVerify: (d: UnverifiedDonation) => void,
): DataColumn<UnverifiedDonation>[] {
  const col = dataColumns<UnverifiedDonation>();
  return [
    col.display({
      id: 'donor',
      header: 'Donor',
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.original.donor.name}</span>
          {row.original.donor.student_id ? (
            <span className="truncate font-mono text-xs text-fg-tertiary">
              {row.original.donor.student_id}
            </span>
          ) : null}
        </span>
      ),
      meta: { className: 'max-w-[12rem] sm:max-w-none' },
    }),
    ...(allDepartments
      ? [
          col.display({
            id: 'department',
            header: 'Department',
            cell: ({ row }) => (
              <span className="text-fg-secondary">
                {row.original.donor.department?.name ?? '—'}
              </span>
            ),
            meta: { className: 'hidden md:table-cell' },
          }),
        ]
      : []),
    col.display({
      id: 'group',
      header: 'Group',
      cell: ({ row }) => <BloodGroupBadge group={row.original.blood_group} />,
    }),
    col.display({
      id: 'date',
      header: 'Donated',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">{formatDate(row.original.donation_date)}</span>
      ),
      meta: { className: 'hidden sm:table-cell' },
    }),
    col.display({
      id: 'units',
      header: 'Units',
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.units}</span>,
      meta: { className: 'hidden sm:table-cell text-right' },
    }),
    col.display({
      id: 'hospital',
      header: 'Hospital',
      cell: ({ row }) => (
        <span className="text-fg-secondary">{row.original.hospital_name ?? '—'}</span>
      ),
      meta: { className: 'hidden lg:table-cell' },
    }),
    col.display({
      id: 'recorded',
      header: 'Recorded',
      cell: ({ row }) => (
        <span className="font-mono text-fg-secondary tabular-nums">
          {formatDate(row.original.created_at)}
        </span>
      ),
      meta: { className: 'hidden lg:table-cell' },
    }),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        row.original.donor.id === myId ? (
          // Visible but disabled, with the reason in words (DESIGN.md "Admin record").
          <span className="flex flex-col items-end gap-1">
            <Button
              variant="secondary"
              size="sm"
              disabled
              aria-describedby={`own-${row.original.id}`}
            >
              Verify
              <span className="sr-only"> your own donation</span>
            </Button>
            <span id={`own-${row.original.id}`} className="text-xs text-fg-tertiary">
              You can&apos;t verify your own donation.
            </span>
          </span>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => onVerify(row.original)}>
            Verify
            <span className="sr-only"> {row.original.donor.name}&apos;s donation</span>
          </Button>
        ),
      meta: { className: 'text-right' },
    }),
  ];
}
