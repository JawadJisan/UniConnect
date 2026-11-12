'use client';

import type { DeptAdminTerm, DeptAdminTermListParams } from '@uniconnect/shared';
import { ShieldPlusIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { TermStatusBadge } from '@/components/term-status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useDepartments } from '@/hooks/use-departments';
import { useDeptAdminTerms } from '@/hooks/use-dept-admin-terms';
import type { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { FilterSelect, Pager } from '../../../../_components/list-controls';
import { useProfile } from '../../../../_components/require-session';
import { AssignDeptAdminDialog } from './assign-dept-admin-dialog';
import { EndDeptAdminTermDialog } from './end-dept-admin-term-dialog';
import { RenewDeptAdminDialog } from './renew-dept-admin-dialog';

const STATUS_OPTIONS: [string, string][] = [
  ['true', 'Current'],
  ['false', 'Ended'],
];

/** Reads list params from the URL, keeping only values the API accepts. */
export function paramsFromUrl(search: URLSearchParams): DeptAdminTermListParams {
  const params: DeptAdminTermListParams = {};
  const dept = Number(search.get('department_id'));
  if (Number.isInteger(dept) && dept > 0) params.department_id = dept;
  const current = search.get('is_current');
  if (current === 'true' || current === 'false') params.is_current = current;
  const page = Number(search.get('page'));
  if (Number.isInteger(page) && page > 1) params.page = page;
  return params;
}

/**
 * /dashboard/admin/dept-admins (PRD FR-ADMIN-001–004), super admin only. Follows the admin
 * list pattern: URL filters, server pages, the previous page dimmed while the next loads.
 */
export function DeptAdminsView() {
  const profile = useProfile();
  if (profile.role !== 'super_admin') {
    return (
      <div className="container-wide py-8">
        <FormAlert tone="error" title="You don't have access to this page." className="max-w-xl">
          Department admin terms are managed by super admins.
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
  return <TermList />;
}

function TermList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = paramsFromUrl(new URLSearchParams(searchParams.toString()));
  const list = useDeptAdminTerms(params);
  const departments = useDepartments();
  const filterId = useId();
  const [assigning, setAssigning] = useState(false);
  const [renewing, setRenewing] = useState<DeptAdminTerm | null>(null);
  const [ending, setEnding] = useState<DeptAdminTerm | null>(null);

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

  const filtered = params.department_id !== undefined || params.is_current !== undefined;
  const columns = useMemo(() => buildColumns(setRenewing, setEnding), []);

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display-sm">Department admins</h1>
          <p className="text-sm text-fg-secondary">
            One current admin per department. Ending or renewing a term changes their role at once.
          </p>
        </div>
        <Button onClick={() => setAssigning(true)} className="w-fit">
          <ShieldPlusIcon data-icon="inline-start" />
          Assign dept admin
        </Button>
      </header>

      <div
        role="search"
        aria-label="Filter department admin terms"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <FilterSelect
          id={`${filterId}-dept`}
          label="Department"
          value={params.department_id ? String(params.department_id) : ''}
          onChange={(v) => navigate({ department_id: v })}
          options={(departments.data ?? []).map((d) => [String(d.id), d.name])}
          all="All departments"
        />
        <FilterSelect
          id={`${filterId}-status`}
          label="Status"
          value={params.is_current ?? ''}
          onChange={(v) => navigate({ is_current: v })}
          options={STATUS_OPTIONS}
          all="Current and ended"
        />
      </div>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState
          title={
            (list.error as ApiError).status === 403
              ? "You don't have access to department admin terms."
              : "Couldn't load department admin terms."
          }
          onRetry={(list.error as ApiError).status === 403 ? undefined : () => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : list.data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <p className="text-md font-medium">
            {filtered ? 'No terms match these filters' : 'No department admins yet'}
          </p>
          <p className="text-sm text-fg-secondary">
            {filtered
              ? 'Try fewer filters.'
              : 'Assign a faculty member to run each department’s club, memberships and committee.'}
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
            caption="Department admin terms, current first, then newest"
            getRowId={(t) => String(t.id)}
            stale={list.isPlaceholderData}
            footer={() => (
              <Pager meta={list.data.meta} onPage={(page) => navigate({ page }, true)} />
            )}
          />
        </div>
      )}

      {assigning ? (
        <AssignDeptAdminDialog open onOpenChange={(o) => !o && setAssigning(false)} />
      ) : null}
      {renewing ? (
        <RenewDeptAdminDialog term={renewing} open onOpenChange={(o) => !o && setRenewing(null)} />
      ) : null}
      {ending ? (
        <EndDeptAdminTermDialog term={ending} open onOpenChange={(o) => !o && setEnding(null)} />
      ) : null}
    </div>
  );
}

function buildColumns(
  onRenew: (t: DeptAdminTerm) => void,
  onEnd: (t: DeptAdminTerm) => void,
): DataColumn<DeptAdminTerm>[] {
  const col = dataColumns<DeptAdminTerm>();
  return [
    col.display({
      id: 'admin',
      header: 'Admin',
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.original.user.name}</span>
          <span className="truncate text-xs text-fg-tertiary">{row.original.user.email}</span>
        </span>
      ),
      meta: { className: 'max-w-[14rem] sm:max-w-none' },
    }),
    col.accessor((t) => t.department.name, {
      id: 'department',
      header: 'Department',
      meta: { className: 'hidden text-fg-secondary md:table-cell' },
    }),
    col.display({
      id: 'term',
      header: 'Term',
      cell: ({ row }) => (
        <span className="font-mono text-fg-secondary">
          {formatDate(row.original.start_date)} – {formatDate(row.original.end_date)}
        </span>
      ),
      meta: { className: 'hidden sm:table-cell' },
    }),
    col.display({
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <TermStatusBadge current={row.original.is_current} />,
    }),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        row.original.is_current ? (
          <span className="flex justify-end gap-1">
            <Button variant="secondary" size="sm" onClick={() => onRenew(row.original)}>
              Renew
              <span className="sr-only"> {row.original.user.name}&apos;s term</span>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onEnd(row.original)}>
              End early
              <span className="sr-only"> {row.original.user.name}&apos;s term</span>
            </Button>
          </span>
        ) : null,
      meta: { className: 'text-right' },
    }),
  ];
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-busy="true">
      <span className="sr-only">Loading department admin terms…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
