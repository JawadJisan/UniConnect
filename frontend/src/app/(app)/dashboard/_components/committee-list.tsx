import type { CommitteeEntry } from '@uniconnect/shared';
import { Avatar } from '@/components/ui/avatar';
import { EmptyLine } from './section-state';

/** The current committee as a compact roster: avatar, name, position, term years. */
export function CommitteeList({ entries }: { entries: CommitteeEntry[] }) {
  if (entries.length === 0) {
    return <EmptyLine>No one holds a committee position right now.</EmptyLine>;
  }
  return (
    <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((e) => (
        <li key={e.id} className="flex min-w-0 items-center gap-3">
          <Avatar name={e.user.name} src={e.user.avatar_url} size={32} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{e.user.name}</span>
            <span className="truncate text-sm text-fg-tertiary">
              {e.position} ·{' '}
              <span className="font-mono tabular-nums">
                {e.term_start_year}–{e.term_end_year}
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
