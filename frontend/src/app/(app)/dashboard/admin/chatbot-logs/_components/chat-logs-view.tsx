'use client';

import { FROM_AFTER_TO, type ChatLogEntry } from '@uniconnect/shared';
import { SearchIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatLogs } from '@/hooks/use-chatbot';
import type { ApiError } from '@/lib/api';
import { rangeInvalid } from '@/lib/audit';
import { CHAT_LOG_FILTER_KEYS, chatLogParamsFromUrl } from '@/lib/chatbot';
import { formatDateTime } from '@/lib/format';
import { ActorLabel } from '../../../../_components/audit-cells';
import { Pager } from '../../../../_components/list-controls';
import { useProfile } from '../../../../_components/require-session';
import { ChatLogDialog } from './chat-log-dialog';

/** Typing in the search waits this long before it reaches the URL. */
const SEARCH_DELAY_MS = 400;

/** /dashboard/admin/chatbot-logs (PRD FR-AI-002; DECISIONS D44, D45): super admin only. */
export function ChatLogsView() {
  const profile = useProfile();
  if (profile.role !== 'super_admin') {
    return (
      <div className="container-wide py-8">
        <FormAlert tone="error" title="You don't have access to this page." className="max-w-xl">
          Chatbot logs are for the super admin.
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
  return <ChatLogList />;
}

function ChatLogList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = new URLSearchParams(searchParams.toString());
  const params = chatLogParamsFromUrl(search);
  /** Display only: the asker's name, set when a name in the table was clicked. */
  const userName = params.user_id ? search.get('user') : null;
  const badRange = rangeInvalid(params);
  const list = useChatLogs(params, { enabled: !badRange });
  const id = useId();
  const [reading, setReading] = useState<ChatLogEntry | null>(null);

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

  // The search is typed: keep the text locally, push it to the URL after a pause.
  const [text, setText] = useState(params.search ?? '');
  const urlText = params.search ?? '';
  useEffect(() => {
    const value = text.trim();
    if (value === urlText) return;
    const timer = setTimeout(() => navigate({ search: value }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // navigate is rebuilt each render from the same URL; the text is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, urlText]);

  // Both dates go to the URL together, as in the audit log (D43).
  const [from, setFrom] = useState(params.from ?? '');
  const [to, setTo] = useState(params.to ?? '');
  function changeDates(next: { from: string; to: string }) {
    setFrom(next.from);
    setTo(next.to);
    navigate({ from: next.from, to: next.to });
  }

  const filtered = CHAT_LOG_FILTER_KEYS.some((k) => params[k] !== undefined);
  const columns = useMemo(
    () => buildColumns(setReading, (user) => navigate({ user_id: user.id, user: user.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams],
  );

  function clearAll() {
    setText('');
    setFrom('');
    setTo('');
    router.replace(pathname, { scroll: false });
  }

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display-sm">Chatbot logs</h1>
          <p className="text-sm text-fg-secondary">
            Questions asked of the assistant, newest first. Times are Dhaka time. Kept for 90 days.
          </p>
        </div>
        <span className="micro-label">SYS.AI.LOGS</span>
      </header>

      <div role="search" aria-label="Filter the chatbot logs" className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
            <label htmlFor={`${id}-search`} className="micro-label">
              Question
            </label>
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                id={`${id}-search`}
                type="search"
                value={text}
                maxLength={100}
                placeholder="Search questions"
                autoComplete="off"
                onChange={(e) => setText(e.target.value)}
              />
            </InputGroup>
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

        {filtered ? (
          <div className="flex flex-wrap items-center gap-2">
            {params.user_id ? (
              <span className="flex h-7 items-center gap-1 rounded-md border border-border bg-surface-1 pr-1 pl-2.5 text-sm">
                <span className="text-fg-tertiary">User:</span>
                <span className="text-foreground">{userName ?? 'one person'}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove the user filter"
                  onClick={() => navigate({ user_id: undefined, user: undefined })}
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
                ? "You don't have access to the chatbot logs."
                : "Couldn't load the chatbot logs."
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
            {filtered ? 'No questions match these filters' : 'No questions asked yet'}
          </p>
          <p className="text-sm text-fg-secondary">
            {filtered
              ? 'Try a wider date range or a shorter search.'
              : 'Questions appear here once people use the assistant on their overview.'}
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
            caption="Chatbot questions, newest first"
            getRowId={(e) => String(e.id)}
            stale={list.isPlaceholderData}
            footer={() => (
              <Pager meta={list.data.meta} onPage={(page) => navigate({ page }, true)} />
            )}
          />
        </div>
      )}

      {reading ? <ChatLogDialog entry={reading} onClose={() => setReading(null)} /> : null}
    </div>
  );
}

function buildColumns(
  onRead: (entry: ChatLogEntry) => void,
  onUser: (user: ChatLogEntry['user']) => void,
): DataColumn<ChatLogEntry>[] {
  const col = dataColumns<ChatLogEntry>();
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
      id: 'user',
      header: 'User',
      cell: ({ row }) => {
        const user = row.original.user;
        return (
          <button
            type="button"
            onClick={() => onUser(user)}
            className="min-w-0 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_span.truncate]:underline-offset-4 hover:[&_span.truncate]:underline"
            title={`Show only ${user.name}'s questions`}
          >
            <ActorLabel actor={user} />
            <span className="sr-only">, show only their questions</span>
          </button>
        );
      },
      meta: { className: 'max-w-[14rem]' },
    }),
    col.display({
      id: 'question',
      header: 'Question',
      cell: ({ row }) => (
        <p className="line-clamp-2 min-w-[12rem] text-foreground">{row.original.question}</p>
      ),
    }),
    col.display({
      id: 'answer',
      header: 'Answer',
      cell: ({ row }) => (
        <p className="line-clamp-2 min-w-[14rem] text-fg-secondary">{row.original.answer}</p>
      ),
      meta: { className: 'hidden md:table-cell' },
    }),
    col.display({
      id: 'view',
      header: () => <span className="sr-only">Details</span>,
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => onRead(row.original)}>
          View
          <span className="sr-only"> question {row.original.id}</span>
        </Button>
      ),
      meta: { className: 'text-right' },
    }),
  ];
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-busy="true">
      <span className="sr-only">Loading the chatbot logs…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
