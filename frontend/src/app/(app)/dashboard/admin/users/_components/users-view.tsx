'use client';

import {
  ROLES,
  USER_TYPES,
  type AdminUserListParams,
  type AdminUserSummary,
  type PaginationMeta,
} from '@uniconnect/shared';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdminUsers } from '@/hooks/use-admin-users';
import { useDepartments } from '@/hooks/use-departments';
import type { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ADMIN_USERS_HREF, ROLE_LABEL, USER_TYPE_LABEL } from '../../../../_components/nav';
import { useProfile } from '../../../../_components/require-session';
import { NoAccess, StatusBadge } from './shared';

/** The filters the URL can carry. Anything else in the query string is ignored. */
const FILTER_KEYS = ['search', 'role', 'user_type', 'department_id', 'is_active'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type SortKey = 'created_at' | 'name';

const SEARCH_DELAY_MS = 300;

/** Reads list params from the URL, keeping only values the API accepts. */
export function paramsFromUrl(search: URLSearchParams): AdminUserListParams {
  const params: Record<string, string | number> = {};
  for (const key of FILTER_KEYS) {
    const value = search.get(key);
    if (value) params[key] = value;
  }
  const page = Number(search.get('page'));
  if (Number.isInteger(page) && page > 1) params.page = page;
  const sort = search.get('sort');
  if (sort === 'name' || sort === 'created_at' || sort === 'email') params.sort = sort;
  const order = search.get('order');
  if (order === 'asc' || order === 'desc') params.order = order;
  return params as AdminUserListParams;
}

/** Super admin: every account, with filters, search and paging in the URL (PRD FR-USER-005). */
export function UsersView() {
  const profile = useProfile();
  if (profile.role !== 'super_admin') return <NoAccess />;
  return <UsersList />;
}

function UsersList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = paramsFromUrl(new URLSearchParams(searchParams.toString()));
  const users = useAdminUsers(params);
  const departments = useDepartments();
  const filterId = useId();

  /** Writes params to the URL. Any filter change goes back to page 1. */
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

  // The search box updates the URL after a pause, not on every keystroke.
  const urlSearch = params.search ?? '';
  const [search, setSearch] = useState(urlSearch);
  // Back/forward or "Clear filters" changes the URL: follow it (adjusting state during render).
  const [seenUrlSearch, setSeenUrlSearch] = useState(urlSearch);
  if (seenUrlSearch !== urlSearch) {
    setSeenUrlSearch(urlSearch);
    setSearch(urlSearch);
  }
  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => navigate({ search: search.trim() }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // navigate is rebuilt each render; only the typed text should restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, urlSearch]);

  const filtered = FILTER_KEYS.some((k) => params[k as FilterKey] !== undefined);
  const sort: SortKey = params.sort === 'name' ? 'name' : 'created_at';
  const order = params.order ?? 'desc';

  function toggleSort(column: SortKey) {
    const nextOrder =
      sort === column ? (order === 'asc' ? 'desc' : 'asc') : column === 'name' ? 'asc' : 'desc';
    navigate({ sort: column, order: nextOrder });
  }

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display-sm">Users</h1>
        <p className="text-sm text-fg-secondary">
          Every account on UniConnect. Open one to suspend it, correct its details or repair its
          role.
        </p>
      </header>

      <div
        role="search"
        aria-label="Filter users"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]"
      >
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor={`${filterId}-search`} className="sr-only">
            Search by name or email
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-tertiary"
          />
          <Input
            id={`${filterId}-search`}
            type="search"
            placeholder="Search by name or email"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <FilterSelect
          id={`${filterId}-role`}
          label="Role"
          value={params.role ?? ''}
          onChange={(v) => navigate({ role: v })}
          options={ROLES.map((r) => [r, ROLE_LABEL[r]])}
          all="All roles"
        />
        <FilterSelect
          id={`${filterId}-type`}
          label="Account type"
          value={params.user_type ?? ''}
          onChange={(v) => navigate({ user_type: v })}
          options={USER_TYPES.map((t) => [t, USER_TYPE_LABEL[t]])}
          all="All types"
        />
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
          value={params.is_active === undefined ? '' : String(params.is_active)}
          onChange={(v) => navigate({ is_active: v })}
          options={[
            ['true', 'Active'],
            ['false', 'Suspended'],
          ]}
          all="Any status"
        />
      </div>

      {users.isPending ? (
        <UsersSkeleton />
      ) : users.isError ? (
        <ErrorState
          title={
            (users.error as ApiError).status === 403
              ? "You don't have access to the user list."
              : "Couldn't load users."
          }
          onRetry={
            (users.error as ApiError).status === 403 ? undefined : () => void users.refetch()
          }
          retrying={users.isFetching}
        />
      ) : users.data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <p className="text-md font-medium">
            {filtered ? 'No users match these filters' : 'No users yet'}
          </p>
          <p className="text-sm text-fg-secondary">
            {filtered
              ? 'Try a shorter search or fewer filters.'
              : 'Accounts appear here once people register.'}
          </p>
          {filtered ? (
            <Button variant="secondary" size="sm" onClick={() => router.replace(pathname)}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          className="flex flex-col gap-3"
          aria-busy={users.isFetching}
          data-stale={users.isPlaceholderData || undefined}
        >
          <div className="rounded-lg border border-border">
            <Table>
              <caption className="sr-only">
                Users, sorted by {sort === 'name' ? 'name' : 'join date'},{' '}
                {order === 'asc' ? 'ascending' : 'descending'}
              </caption>
              <TableHeader>
                <TableRow>
                  <SortHead
                    label="Name"
                    active={sort === 'name'}
                    order={order}
                    onClick={() => toggleSort('name')}
                  />
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead>Status</TableHead>
                  <SortHead
                    label="Joined"
                    active={sort === 'created_at'}
                    order={order}
                    onClick={() => toggleSort('created_at')}
                    className="hidden sm:table-cell"
                  />
                </TableRow>
              </TableHeader>
              <TableBody className={users.isPlaceholderData ? 'opacity-60' : undefined}>
                {users.data.data.map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager meta={users.data.meta} onPage={(page) => navigate({ page }, true)} />
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  all,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  all: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function SortHead({
  label,
  active,
  order,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  order: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}) {
  const Icon = order === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className}
    >
      <button
        type="button"
        onClick={onClick}
        className="-mx-1 inline-flex h-6 items-center gap-1 rounded-sm px-1 uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {label}
        {active ? <Icon aria-hidden="true" className="size-3" /> : null}
        <span className="sr-only">, sort</span>
      </button>
    </TableHead>
  );
}

function UserRow({ user }: { user: AdminUserSummary }) {
  return (
    <TableRow>
      <TableCell className="max-w-[16rem] sm:max-w-none">
        <Link
          href={`${ADMIN_USERS_HREF}/${user.id}`}
          className="group flex min-w-0 items-center gap-2.5 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Avatar name={user.name} src={user.avatar_url} size={28} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground group-hover:underline">
              {user.name}
            </span>
            <span className="truncate text-xs text-fg-tertiary">{user.email}</span>
          </span>
        </Link>
      </TableCell>
      <TableCell className="text-fg-secondary">
        {ROLE_LABEL[user.role]}
        {user.role !== user.user_type ? (
          <span className="block text-xs text-fg-tertiary">{USER_TYPE_LABEL[user.user_type]}</span>
        ) : null}
      </TableCell>
      <TableCell className="hidden text-fg-secondary md:table-cell">
        {user.department?.name ?? 'All'}
      </TableCell>
      <TableCell>
        <StatusBadge active={user.is_active} verified={user.email_verified} />
      </TableCell>
      <TableCell className="hidden font-mono text-fg-secondary sm:table-cell">
        {formatDate(user.created_at)}
      </TableCell>
    </TableRow>
  );
}

function Pager({ meta, onPage }: { meta: PaginationMeta; onPage: (page: number) => void }) {
  const first = (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
      <p className="font-mono text-fg-secondary tabular-nums" aria-live="polite">
        {first}–{last} of {meta.total}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          <ChevronLeftIcon data-icon="inline-start" />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={meta.page >= meta.total_pages}
          onClick={() => onPage(meta.page + 1)}
        >
          Next
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  );
}

function UsersSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-busy="true">
      <span className="sr-only">Loading users…</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
