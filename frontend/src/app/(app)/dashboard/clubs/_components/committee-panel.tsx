'use client';

import type { ClubDetail, CommitteeEntry, CommitteeMember } from '@uniconnect/shared';
import { UserPlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { dataColumns, DataTable, type DataColumn } from '@/components/data-table';
import { TermStatusBadge } from '@/components/term-status-badge';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCommittee } from '@/hooks/use-committee';
import { Pager } from '../../../_components/list-controls';
import { Panel } from '../../../_components/panel';
import { AssignCommitteeDialog } from './assign-committee-dialog';
import { EditCommitteeDialog } from './edit-committee-dialog';
import { EndCommitteeTermDialog } from './end-committee-term-dialog';

const PAGE_SIZE = 10;
type Show = 'current' | 'all';

/**
 * The club's committee (PRD FR-COMM-001–004, DESIGN.md §7 "Committee panel"). Viewers see the
 * current members from the club detail they already have. The club's editors see current and
 * past rows from GET /committee, and assign, edit and end terms from here.
 */
export function CommitteePanel({ club, editable }: { club: ClubDetail; editable: boolean }) {
  if (!editable) {
    return (
      <Panel
        id="club-committee-title"
        title="Committee"
        tag="SYS.CLUB.COMMITTEE"
        description="Current positions only."
      >
        <CurrentCommittee members={club.committee} />
      </Panel>
    );
  }
  return <ManagedCommittee club={club} />;
}

function ManagedCommittee({ club }: { club: ClubDetail }) {
  const committee = useCommittee(club.id);
  const [show, setShow] = useState<Show>('current');
  const [page, setPage] = useState(0);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState<CommitteeEntry | null>(null);
  const [ending, setEnding] = useState<CommitteeEntry | null>(null);

  const rows = useMemo(
    () => (committee.data ?? []).filter((m) => show === 'all' || m.is_current),
    [committee.data, show],
  );
  const columns = useMemo(() => buildColumns(setEditing, setEnding), []);

  function changeShow(next: Show) {
    setShow(next);
    setPage(0);
  }

  return (
    <Panel
      id="club-committee-title"
      title="Committee"
      tag="SYS.CLUB.COMMITTEE"
      description="Assigning someone makes them a moderator while their term is current."
      footer={
        <Button size="sm" onClick={() => setAssigning(true)}>
          <UserPlusIcon data-icon="inline-start" />
          Assign member
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div
          role="group"
          aria-label="Show"
          className="flex w-fit gap-1 rounded-md border border-border p-0.5"
        >
          {(['current', 'all'] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={show === value}
              onClick={() => changeShow(value)}
              className="aria-pressed:bg-surface-3 aria-pressed:text-foreground"
            >
              {value === 'current' ? 'Current' : 'All terms'}
            </Button>
          ))}
        </div>

        {committee.isPending ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <span className="sr-only">Loading committee…</span>
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : committee.isError ? (
          <ErrorState
            title="Couldn't load the committee."
            onRetry={() => void committee.refetch()}
            retrying={committee.isFetching}
          />
        ) : rows.length === 0 ? (
          <p className="text-sm text-fg-secondary">
            {show === 'current'
              ? 'No one holds a position right now. Assign the first member below.'
              : 'No committee terms recorded yet.'}
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            caption={
              show === 'current'
                ? 'Current committee members'
                : 'Committee terms, current first, then newest'
            }
            getRowId={(m) => String(m.id)}
            pageSize={PAGE_SIZE}
            pageIndex={page}
            footer={(pageCount) =>
              pageCount > 1 ? (
                <Pager
                  meta={{
                    page: page + 1,
                    limit: PAGE_SIZE,
                    total: rows.length,
                    total_pages: pageCount,
                  }}
                  onPage={(next) => setPage(next - 1)}
                />
              ) : null
            }
          />
        )}
      </div>

      {assigning ? (
        <AssignCommitteeDialog club={club} open onOpenChange={(o) => !o && setAssigning(false)} />
      ) : null}
      {editing ? (
        <EditCommitteeDialog
          clubId={club.id}
          member={editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      ) : null}
      {ending ? (
        <EndCommitteeTermDialog
          clubId={club.id}
          member={ending}
          open
          onOpenChange={(o) => !o && setEnding(null)}
        />
      ) : null}
    </Panel>
  );
}

function buildColumns(
  onEdit: (m: CommitteeEntry) => void,
  onEnd: (m: CommitteeEntry) => void,
): DataColumn<CommitteeEntry>[] {
  const col = dataColumns<CommitteeEntry>();
  return [
    col.display({
      id: 'member',
      header: 'Member',
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={row.original.user.name} src={row.original.user.avatar_url} size={24} />
          <span className="truncate">{row.original.user.name}</span>
        </span>
      ),
      meta: { className: 'max-w-[12rem] sm:max-w-none' },
    }),
    col.accessor('position', {
      header: 'Position',
      meta: { className: 'text-fg-secondary' },
    }),
    col.display({
      id: 'term',
      header: 'Term',
      cell: ({ row }) => (
        <span className="font-mono text-fg-secondary">
          {row.original.term_start_year}–{row.original.term_end_year}
        </span>
      ),
      meta: { className: 'hidden sm:table-cell' },
    }),
    col.display({
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <TermStatusBadge current={row.original.is_current} />,
      meta: { className: 'hidden md:table-cell' },
    }),
    col.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <span className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(row.original)}>
            Edit
            <span className="sr-only"> {row.original.user.name}&apos;s position</span>
          </Button>
          {row.original.is_current ? (
            <Button variant="destructive" size="sm" onClick={() => onEnd(row.original)}>
              End term
              <span className="sr-only"> for {row.original.user.name}</span>
            </Button>
          ) : null}
        </span>
      ),
      meta: { className: 'text-right' },
    }),
  ];
}

/** The read-only list for viewers: current rows only, dense, one member per row. */
function CurrentCommittee({ members }: { members: CommitteeMember[] }) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-fg-secondary">
        No committee members yet. The department admin assigns them.
      </p>
    );
  }
  return (
    <div className="-mx-5">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Member</TableHead>
            <TableHead>Position</TableHead>
            <TableHead className="hidden pr-5 sm:table-cell">Term</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="pl-5">
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={m.user.name} src={m.user.avatar_url} size={24} />
                  <span className="truncate">{m.user.name}</span>
                </span>
              </TableCell>
              <TableCell className="text-fg-secondary">{m.position}</TableCell>
              <TableCell className="hidden pr-5 font-mono text-fg-secondary sm:table-cell">
                {m.term_start_year}–{m.term_end_year}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
