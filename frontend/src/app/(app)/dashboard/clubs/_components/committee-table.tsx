import type { CommitteeMember } from '@uniconnect/shared';
import { Avatar } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** The club's current committee (is_current rows only), dense, one member per row. */
export function CommitteeTable({ members }: { members: CommitteeMember[] }) {
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
