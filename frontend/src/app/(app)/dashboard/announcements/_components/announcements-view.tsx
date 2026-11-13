'use client';

import type { Announcement, AnnouncementListParams } from '@uniconnect/shared';
import { PinIcon, PlusIcon } from 'lucide-react';
import { m } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { useAnnouncements, useTogglePin } from '@/hooks/use-announcements';
import { useClubs, useMyClub } from '@/hooks/use-clubs';
import { useDepartments } from '@/hooks/use-departments';
import { canPost } from '@/lib/announcements';
import type { ApiError } from '@/lib/api';
import { duration, ease } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { FilterSelect, Pager } from '../../../_components/list-controls';
import { useProfile } from '../../../_components/require-session';
import { AnnouncementCard } from './announcement-card';
import { AnnouncementDialog } from './announcement-dialog';
import { DeleteAnnouncementDialog } from './delete-announcement-dialog';

const ID_KEYS = ['club_id', 'department_id'] as const;

/** Reads list params from the URL, keeping only values the API accepts. */
export function paramsFromUrl(search: URLSearchParams): AnnouncementListParams {
  const params: Record<string, string | number> = {};
  for (const key of ID_KEYS) {
    const value = Number(search.get(key));
    if (Number.isInteger(value) && value > 0) params[key] = value;
  }
  if (search.get('is_pinned') === 'true') params.is_pinned = 'true';
  const page = Number(search.get('page'));
  if (Number.isInteger(page) && page > 1) params.page = page;
  return params as AnnouncementListParams;
}

const list = { show: { transition: { staggerChildren: 0.04 } } };
const item = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } },
};

type Open =
  { kind: 'create' } | { kind: 'edit'; a: Announcement } | { kind: 'delete'; a: Announcement };

/** The announcements feed (PRD FR-ANNOUNCE-002): pinned first, filters in the URL. */
export function AnnouncementsView() {
  const profile = useProfile();
  const superAdmin = profile.role === 'super_admin';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = paramsFromUrl(new URLSearchParams(searchParams.toString()));
  const announcements = useAnnouncements(params);
  const myClub = useMyClub();
  const clubs = useClubs();
  const departments = useDepartments();
  const pin = useTogglePin();
  const [open, setOpen] = useState<Open | null>(null);
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

  async function togglePin(a: Announcement) {
    try {
      const saved = await pin.mutateAsync(a.id);
      toast.success(saved.is_pinned ? 'Pinned.' : 'Unpinned.');
    } catch (thrown) {
      const e = thrown as ApiError;
      toast.error(e.status >= 400 && e.status < 500 ? e.message : "Couldn't save right now.");
    }
  }

  // Everyone but a super admin filters by their own department or club; the API already limits
  // the feed to what they may see (D15).
  const myDepartmentId = profile.department?.id;
  const myClubId = myClub.data?.id;
  const scopeValue =
    params.department_id !== undefined && params.department_id === myDepartmentId
      ? 'department'
      : params.club_id !== undefined && params.club_id === myClubId
        ? 'club'
        : '';
  const pinnedOnly = params.is_pinned === 'true';
  const filtered = params.club_id !== undefined || params.department_id !== undefined || pinnedOnly;

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display-sm">Announcements</h1>
          <p className="text-sm text-fg-secondary">
            {superAdmin
              ? 'Every department and club announcement. Pinned posts come first.'
              : 'News from your department and the clubs you belong to. Pinned posts come first.'}
          </p>
        </div>
        {canPost(profile.role) ? (
          <Button onClick={() => setOpen({ kind: 'create' })}>
            <PlusIcon data-icon="inline-start" />
            New announcement
          </Button>
        ) : null}
      </header>

      <div
        role="search"
        aria-label="Filter announcements"
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
      >
        {superAdmin ? (
          <>
            <div className="sm:w-56">
              <FilterSelect
                id={`${filterId}-dept`}
                label="Department"
                value={params.department_id ? String(params.department_id) : ''}
                onChange={(v) => navigate({ department_id: v, club_id: undefined })}
                options={(departments.data ?? []).map((d) => [String(d.id), d.name])}
                all="All departments"
              />
            </div>
            <div className="sm:w-56">
              <FilterSelect
                id={`${filterId}-club`}
                label="Club"
                value={params.club_id ? String(params.club_id) : ''}
                onChange={(v) => navigate({ club_id: v, department_id: undefined })}
                options={(clubs.data?.data ?? []).map((c) => [String(c.id), c.name])}
                all="All clubs"
              />
            </div>
          </>
        ) : (
          <div className="sm:w-56">
            <FilterSelect
              id={`${filterId}-scope`}
              label="Show"
              value={scopeValue}
              onChange={(v) =>
                navigate({
                  department_id: v === 'department' ? myDepartmentId : undefined,
                  club_id: v === 'club' ? myClubId : undefined,
                })
              }
              options={[
                ...(myDepartmentId
                  ? ([['department', 'My department']] as [string, string][])
                  : []),
                ...(myClubId ? ([['club', 'My club']] as [string, string][]) : []),
              ]}
              all="All announcements"
            />
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={pinnedOnly}
          className={cn(
            'h-9 self-start sm:self-auto',
            pinnedOnly && 'bg-surface-3 text-foreground',
          )}
          onClick={() => navigate({ is_pinned: pinnedOnly ? undefined : 'true' })}
        >
          <PinIcon data-icon="inline-start" />
          Pinned only
        </Button>
      </div>

      {announcements.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">Loading announcements…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : announcements.isError ? (
        <ErrorState
          title="Couldn't load announcements."
          onRetry={() => void announcements.refetch()}
          retrying={announcements.isFetching}
        />
      ) : announcements.data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-6">
          <p className="text-md font-medium">
            {filtered ? 'No announcements match these filters' : 'No announcements yet'}
          </p>
          <p className="text-sm text-fg-secondary">
            {filtered
              ? 'Try another filter, or show everything.'
              : canPost(profile.role)
                ? 'Post the first one with New announcement.'
                : 'Posts from your department and your clubs appear here.'}
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
          aria-busy={announcements.isFetching}
          data-stale={announcements.isPlaceholderData || undefined}
        >
          <m.ul
            key={JSON.stringify(params)}
            initial="hidden"
            animate="show"
            variants={list}
            className={cn('flex flex-col gap-4', announcements.isPlaceholderData && 'opacity-60')}
          >
            {announcements.data.data.map((a) => (
              <m.li key={a.id} variants={item} className="min-w-0">
                <AnnouncementCard
                  announcement={a}
                  actions={{
                    onEdit: (x) => setOpen({ kind: 'edit', a: x }),
                    onDelete: (x) => setOpen({ kind: 'delete', a: x }),
                    onTogglePin: (x) => void togglePin(x),
                    pinningId: pin.isPending ? (pin.variables ?? null) : null,
                  }}
                />
              </m.li>
            ))}
          </m.ul>
          <Pager meta={announcements.data.meta} onPage={(page) => navigate({ page }, true)} />
        </div>
      )}

      {open?.kind === 'create' ? (
        <AnnouncementDialog mode="create" onClose={() => setOpen(null)} />
      ) : open?.kind === 'edit' ? (
        <AnnouncementDialog mode="edit" announcement={open.a} onClose={() => setOpen(null)} />
      ) : open?.kind === 'delete' ? (
        <DeleteAnnouncementDialog announcement={open.a} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
