'use client';

import { FROM_AFTER_TO, type AuditLogEntry } from '@uniconnect/shared';
import { XIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditLogs } from '@/hooks/use-audit-logs';
import type { ApiError } from '@/lib/api';
import { actionGroups, AUDIT_FILTER_KEYS, auditParamsFromUrl, rangeInvalid } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import { ActionBadge, ActorLabel, entityText } from '../../../../_components/audit-cells';
import { Pager } from '../../../../_components/list-controls';
import { useProfile } from '../../../../_components/require-session';
import { AuditDiffDialog } from './audit-diff-dialog';

/** Typing in the entity filter waits this long before it reaches the URL. */
const ENTITY_DELAY_MS = 400;

const GROUPS = actionGroups();

/** /dashboard/admin/audit-logs (PRD FR-AUDIT-002; DECISIONS D42, D43): super admin only. */
export function AuditLogsView() {
  const profile = useProfile();
  if (profile.role !== 'super_admin') {
    return (
      <div className="container-wide py-8">
        <FormAlert tone="error" title="You don't have access to this page." className="max-w-xl">
          The audit log is for the super admin.
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
  return <AuditLogList />;
}

function AuditLogList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = new URLSearchParams(searchParams.toString());
  const params = auditParamsFromUrl(search);
  /** Display only: the actor's name, set when a name in the table was clicked. */
  const actorName = params.user_id ? search.get('actor') : null;
  const badRange = rangeInvalid(params);
  const list = useAuditLogs(params, { enabled: !badRange });
  const id = useId();
  const [inspecting, setInspecting] = useState<AuditLogEntry | null>(null);

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

  // The entity filter is typed: keep the text locally, push it to the URL after a pause.
  const [entity, setEntity] = useState(params.entity_type ?? '');
  const urlEntity = params.entity_type ?? '';
  useEffect(() => {
    const text = entity.trim();
    if (text === urlEntity) return;
    const timer = setTimeout(() => navigate({ entity_type: text }), ENTITY_DELAY_MS);
    return () => clearTimeout(timer);
    // navigate is rebuilt each render from the same URL; the text is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, urlEntity]);

  // The two dates go to the URL together: a change to one carries the other's current value,
  // so a quick second edit can't merge onto a URL that hasn't caught up with the first.
  const [from, setFrom] = useState(params.from ?? '');
  const [to, setTo] = useState(params.to ?? '');
  function changeDates(next: { from: string; to: string }) {
    setFrom(next.from);
    setTo(next.to);
    navigate({ from: next.from, to: next.to });
  }

  const filtered = AUDIT_FILTER_KEYS.some((k) => params[k] !== undefined);
  const columns = useMemo(
    () =>
      buildColumns(setInspecting, (actor) => navigate({ user_id: actor.id, actor: actor.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams],
  );

  function clearAll() {
    setEntity('');
    setFrom('');
    setTo('');
    router.replace(pathname, { scroll: false });
  }

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display-sm">Audit log</h1>
          <p className="text-sm text-fg-secondary">
            Every recorded change, newest first. Times are Dhaka time.
          </p>
        </div>
        <span className="micro-label">SYS.AUDIT.LOG</span>
      </header>

      <div role="search" aria-label="Filter the audit log" className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-action`} className="micro-label">
              Action
            </label>
            <NativeSelect
              id={`${id}-action`}
              value={params.action ?? ''}
              onChange={(e) => navigate({ action: e.target.value })}
            >
              <option value="">Any action</option>
              {GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.actions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-entity`} className="micro-label">
              Entity type
            </label>
            <Input
              id={`${id}-entity`}
              value={entity}
              maxLength={50}
              placeholder="e.g. Event"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setEntity(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-from`} className="micro-label">
              From
            </label>
            <Input
              id={`${id}-from`}
              type="date"
              value={from}
              max={to || undefined}
              aria-invalid={badRange || undefined}
              aria-describedby={badRange ? `${id}-range` : undefined}
              onChange={(e) => changeDates({ from: e.target.value, to })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-to`} className="micro-label">
              To
            </label>
            <Input
              id={`${id}-to`}
              type="date"
              value={to}
              min={from || undefined}
              aria-invalid={badRange || undefined}
              aria-describedby={badRange ? `${id}-range` : undefined}
              onChange={(e) => changeDates({ from, to: e.target.value })}
            />
          </div>
        </div>

        {badRange ? (
          <p id={`${id}-range`} role="alert" className="text-sm text-destructive">
            {FROM_AFTER_TO}
          </p>
        ) : null}

        {params.user_id || filtered ? (
          <div className="flex flex-wrap items-center gap-2">
            {params.user_id ? (
              <span className="flex h-7 items-center gap-1 rounded-md border border-border bg-surface-1 pr-1 pl-2.5 text-sm">
                <span className="text-fg-tertiary">Actor:</span>
                <span className="text-foreground">{actorName ?? 'one person'}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove the actor filter"
                  onClick={() => navigate({ user_id: undefined, actor: undefined })}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </span>
            ) : null}
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>

      {badRange ? null : list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        (list.error as ApiError).status === 400 ? (
          <FormAlert tone="error" title="These filters can't be used." className="max-w-xl">
            {(list.error as ApiError).fields[0]?.message ?? (list.error as ApiError).message}
          </FormAlert>
        ) : (
          <ErrorState
            title={
              (list.error as ApiError).status === 403
                ? "You don't have access to the audit log."
                : "Couldn't load the audit log."
            }
            onRetry={
              (list.error as ApiError).status === 403 ? undefined : () => void list.refetch()
            }
            retrying={list.isFetching}
          />
        )
      ) : list.data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <p className="text-md font-medium">
            {filtered ? 'No entries match these filters' : 'Nothing recorded yet'}
          </p>
          <p className="text-sm text-fg-secondary">
            {filtered
              ? 'Try a wider date range or fewer filters.'
              : 'Entries appear as people sign in and change things.'}
          </p>
          {filtered ? (
            <Button variant="secondary" size="sm" onClick={clearAll}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <div aria-busy={list.isFetching}>
          <DataTable
            columns={columns}
            data={list.data.data}
            caption="Audit log entries, newest first"
            getRowId={(e) => String(e.id)}
            stale={list.isPlaceholderData}
            footer={() => (
              <Pager meta={list.data.meta} onPage={(page) => navigate({ page }, true)} />
            )}
          />
        </div>
      )}

      {inspecting ? (
        <AuditDiffDialog entry={inspecting} onClose={() => setInspecting(null)} />
      ) : null}
    </div>
  );
}

function buildColumns(
  onInspect: (entry: AuditLogEntry) => void,
  onActor: (actor: NonNullable<AuditLogEntry['actor']>) => void,
): DataColumn<AuditLogEntry>[] {
  const col = dataColumns<AuditLogEntry>();
  return [
    col.display({
      id: 'time',
      header: 'Time',
      cell: ({ row }) => (
        <time
          dateTime={row.original.created_at}
          className="font-mono whitespace-nowrap text-fg-secondary tabular-nums"
        >
          {formatDateTime(row.original.created_at)}
        </time>
      ),
    }),
    col.display({
      id: 'actor',
      header: 'Actor',
      cell: ({ row }) => {
        const actor = row.original.actor;
        if (!actor) return <ActorLabel actor={null} />;
        return (
          <button
            type="button"
            onClick={() => onActor(actor)}
            className="min-w-0 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_span.truncate]:underline-offset-4 hover:[&_span.truncate]:underline"
            title={`Show only ${actor.name}'s entries`}
          >
            <ActorLabel actor={actor} />
            <span className="sr-only">, show only their entries</span>
          </button>
        );
      },
      meta: { className: 'max-w-[16rem]' },
    }),
    col.display({
      id: 'action',
      header: 'Action',
      cell: ({ row }) => <ActionBadge action={row.original.action} />,
    }),
    col.display({
      id: 'entity',
      header: 'Entity',
      cell: ({ row }) => (
        <span className="font-mono text-fg-secondary">{entityText(row.original)}</span>
      ),
      meta: { className: 'hidden sm:table-cell' },
    }),
    col.display({
      id: 'ip',
      header: 'IP',
      cell: ({ row }) => (
        <span className="font-mono text-fg-tertiary">{row.original.ip_address ?? '—'}</span>
      ),
      meta: { className: 'hidden lg:table-cell' },
    }),
    col.display({
      id: 'inspect',
      header: () => <span className="sr-only">Details</span>,
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => onInspect(row.original)}>
          Inspect
          <span className="sr-only"> entry {row.original.id}</span>
        </Button>
      ),
      meta: { className: 'text-right' },
    }),
  ];
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-busy="true">
      <span className="sr-only">Loading the audit log…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
