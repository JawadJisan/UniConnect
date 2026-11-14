import type { EventStatus } from '@uniconnect/shared';
import { EventStatusBadge } from '@/components/event-status-badge';
import { statusRows } from '@/lib/dashboard';

/** Events by lifecycle status as a definition list: badge, then the count in mono. */
export function EventStatusCounts({ counts }: { counts: Record<EventStatus, number> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {statusRows(counts).map(([status, count]) => (
        <div
          key={status}
          className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-1 p-3"
        >
          <dt>
            <EventStatusBadge status={status} />
          </dt>
          <dd className="font-mono text-xl text-foreground tabular-nums">{count}</dd>
        </div>
      ))}
    </dl>
  );
}
