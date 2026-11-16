import type { SuperAdminDashboard } from '@uniconnect/shared';
import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from 'lucide-react';
import { queueTone, type Tone } from '@/lib/dashboard';
import { cn } from '@/lib/utils';

// DESIGN.md §7 "Health strip": DB, Redis and each BullMQ queue (FR-DASH-004, D42). State is
// always an icon and a word as well as a colour. A queue that couldn't be read is a warning,
// not an error toast: the rest of the dashboard still loaded.

const TONE_STYLE: Record<Tone, { text: string; Icon: typeof CircleCheckIcon }> = {
  success: { text: 'text-success', Icon: CircleCheckIcon },
  warning: { text: 'text-warning', Icon: TriangleAlertIcon },
  destructive: { text: 'text-destructive', Icon: CircleAlertIcon },
  secondary: { text: 'text-fg-tertiary', Icon: CircleCheckIcon },
};

function State({ tone, word }: { tone: Tone; word: string }) {
  const { text, Icon } = TONE_STYLE[tone];
  return (
    <span className={cn('flex items-center gap-1 text-sm', text)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {word}
    </span>
  );
}

export function HealthStrip({
  health,
  checkedAt,
}: {
  health: SuperAdminDashboard['health'];
  /** When the figures were fetched, ms since epoch. */
  checkedAt: number;
}) {
  const services: [string, 'ok' | 'error'][] = [
    ['Database', health.db],
    ['Redis', health.redis],
  ];
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-3 sm:grid-cols-2">
        {services.map(([name, state]) => (
          <li
            key={name}
            className="flex items-center justify-between rounded-md border border-border bg-surface-1 px-3 py-2.5"
          >
            <span className="text-sm text-foreground">{name}</span>
            <State
              tone={state === 'ok' ? 'success' : 'destructive'}
              word={state === 'ok' ? 'Up' : 'Down'}
            />
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="sr-only">Background job queues and their job counts</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="micro-label px-3 py-2 text-left">
                Queue
              </th>
              <th scope="col" className="micro-label px-3 py-2 text-left">
                State
              </th>
              {(['Waiting', 'Active', 'Delayed', 'Failed'] as const).map((h) => (
                <th key={h} scope="col" className="micro-label px-3 py-2 text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {health.queues.map((q) => {
              const tone = queueTone(q);
              const word =
                q.state === 'unavailable' ? 'No answer' : q.counts?.failed ? 'Has failures' : 'OK';
              return (
                <tr key={q.name} className="border-b border-border last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-mono font-normal">
                    {q.name}
                  </th>
                  <td className="px-3 py-2">
                    <State tone={tone} word={word} />
                  </td>
                  {(['waiting', 'active', 'delayed', 'failed'] as const).map((k) => (
                    <td
                      key={k}
                      className={cn(
                        'px-3 py-2 text-right font-mono tabular-nums',
                        k === 'failed' && q.counts?.failed
                          ? 'text-destructive'
                          : 'text-fg-secondary',
                      )}
                    >
                      {q.counts ? q.counts[k] : '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-tertiary">
        Checked{' '}
        <time dateTime={new Date(checkedAt).toISOString()} className="font-mono tabular-nums">
          {new Intl.DateTimeFormat('en-GB', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Dhaka',
          }).format(checkedAt)}
        </time>
        . Refreshes every minute.
      </p>
    </div>
  );
}
