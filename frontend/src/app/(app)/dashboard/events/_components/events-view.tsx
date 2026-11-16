'use client';

import { EVENT_LIST_STATUSES, EVENT_VISIBILITIES, type EventListParams } from '@uniconnect/shared';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { m } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useClubs } from '@/hooks/use-clubs';
import { useDepartments } from '@/hooks/use-departments';
import { useEvents } from '@/hooks/use-events';
import { canOrganize, VISIBILITY_LABEL } from '@/lib/events';
import { duration, ease } from '@/lib/motion';
import { FilterSelect, Pager } from '../../../_components/list-controls';
import { NEW_EVENT_HREF } from '../../../_components/nav';
import { useProfile } from '../../../_components/require-session';
import { EventCard } from './event-card';

/** Filters the URL can carry. Anything else in the query string is ignored. */
const FILTER_KEYS = ['search', 'visibility', 'department_id', 'club_id'] as const;
type ListStatus = (typeof EVENT_LIST_STATUSES)[number];

/** With no status in the URL the list shows upcoming events; `status=all` lifts the filter. */
export const DEFAULT_STATUS: ListStatus = 'upcoming';
const ANY_STATUS = 'all';

const STATUS_LABEL: Record<ListStatus, string> = {
  upcoming: 'Upcoming',
  past: 'Past',
  published: 'Published',
  draft: 'Drafts',
  cancelled: 'Cancelled',
};
/** Drafts and the raw lifecycle statuses are organizer views. */
const MEMBER_STATUSES: readonly ListStatus[] = ['upcoming', 'past'];

const SEARCH_DELAY_MS = 300;

/** Reads list params from the URL, keeping only values the API accepts. */
export function paramsFromUrl(search: URLSearchParams): EventListParams {
  const params: Record<string, string | number> = {};
  for (const key of FILTER_KEYS) {
    const value = search.get(key);
    if (value) params[key] = value;
  }
  const status = search.get('status');
  if (status === null) params.status = DEFAULT_STATUS;
  else if ((EVENT_LIST_STATUSES as readonly string[]).includes(status)) params.status = status;
  const page = Number(search.get('page'));
  if (Number.isInteger(page) && page > 1) params.page = page;
  return params as EventListParams;
}

const list = { show: { transition: { staggerChildren: 0.04 } } };
const item = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } },
};

/** Browse events (PRD FR-EVENT-006): only what the caller may see, filters in the URL. */
export function EventsView() {
  const profile = useProfile();
  const organizer = canOrganize(profile.role);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = paramsFromUrl(new URLSearchParams(searchParams.toString()));
  const events = useEvents(params);
  const departments = useDepartments();
  const clubs = useClubs();
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

  const statuses = organizer ? EVENT_LIST_STATUSES : MEMBER_STATUSES;
  const filtered =
    FILTER_KEYS.some((k) => params[k] !== undefined) || params.status !== DEFAULT_STATUS;

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display-sm">Events</h1>
          <p className="text-sm text-fg-secondary">
            Events you can join, from your department and others. Members-only events show when you
            can register for them.
          </p>
        </div>
        {organizer ? (
          <Link href={NEW_EVENT_HREF} className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            New event
          </Link>
        ) : null}
      </header>

      <div
        role="search"
        aria-label="Filter events"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]"
      >
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor={`${filterId}-search`} className="sr-only">
            Search events
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-tertiary"
          />
          <Input
            id={`${filterId}-search`}
            type="search"
            placeholder="Search by title or description"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <FilterSelect
          id={`${filterId}-status`}
          label="When"
          value={params.status ?? ''}
          onChange={(v) => navigate({ status: v === '' ? ANY_STATUS : v })}
          options={statuses.map((s) => [s, STATUS_LABEL[s]])}
          all="Any time"
        />
        <FilterSelect
          id={`${filterId}-visibility`}
          label="Visibility"
          value={params.visibility ?? ''}
          onChange={(v) => navigate({ visibility: v })}
          options={EVENT_VISIBILITIES.map((v) => [v, VISIBILITY_LABEL[v]])}
          all="Any visibility"
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
          id={`${filterId}-club`}
          label="Organizing club"
          value={params.club_id ? String(params.club_id) : ''}
          onChange={(v) => navigate({ club_id: v })}
          options={(clubs.data?.data ?? []).map((c) => [String(c.id), c.name])}
          all="All clubs"
        />
      </div>

      {events.isPending ? (
        <div aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <span className="sr-only">Loading events…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-xl" />
          ))}
        </div>
      ) : events.isError ? (
        <ErrorState
          title="Couldn't load events."
          onRetry={() => void events.refetch()}
          retrying={events.isFetching}
        />
      ) : events.data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <p className="text-md font-medium">
            {filtered ? 'No events match these filters' : 'No upcoming events'}
          </p>
          <p className="text-sm text-fg-secondary">
            {filtered
              ? 'Try a shorter search or fewer filters.'
              : 'Published events you can join appear here.'}
          </p>
          {filtered ? (
            <Button variant="secondary" size="sm" onClick={() => router.replace(pathname)}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          className="flex flex-col gap-4"
          aria-busy={events.isFetching}
          data-stale={events.isPlaceholderData || undefined}
        >
          <m.ul
            key={JSON.stringify(params)}
            initial="hidden"
            animate="show"
            variants={list}
            className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${events.isPlaceholderData ? 'opacity-60' : ''}`}
          >
            {events.data.data.map((event) => (
              <m.li key={event.id} variants={item} className="min-w-0">
                <EventCard event={event} />
              </m.li>
            ))}
          </m.ul>
          <Pager meta={events.data.meta} onPage={(page) => navigate({ page }, true)} />
        </div>
      )}
    </div>
  );
}
