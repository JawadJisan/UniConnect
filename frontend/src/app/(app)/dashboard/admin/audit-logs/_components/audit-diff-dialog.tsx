'use client';

import type { AuditLogEntry } from '@uniconnect/shared';
import { MinusIcon, PencilIcon, PlusIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { actionLabel, compactJson, jsonDiff, prettyJson, type DiffKind } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ActionBadge, ActorLabel, entityText } from '../../../../_components/audit-cells';

// DESIGN.md §7 "Audit diff". One audit row's old and new values: a key-by-key list first
// (each change named in words, not colour alone), then the raw JSON as stored.

const KIND: Record<
  Exclude<DiffKind, 'same'>,
  { word: string; Icon: typeof PlusIcon; className: string }
> = {
  added: { word: 'Added', Icon: PlusIcon, className: 'text-success' },
  removed: { word: 'Removed', Icon: MinusIcon, className: 'text-destructive' },
  changed: { word: 'Changed', Icon: PencilIcon, className: 'text-warning' },
};

export function AuditDiffDialog({ entry, onClose }: { entry: AuditLogEntry; onClose: () => void }) {
  const rows = jsonDiff(entry.old_value, entry.new_value);
  const changes = rows.filter((r) => r.kind !== 'same');
  const unchanged = rows.length - changes.length;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>{actionLabel(entry.action)}</DialogTitle>
            <span className="micro-label">SYS.AUDIT.DIFF</span>
          </div>
          <DialogDescription>
            Entry #{entry.id}, recorded{' '}
            <span className="font-mono tabular-nums">{formatDateTime(entry.created_at)}</span>{' '}
            (Dhaka time).
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-1 p-4 text-sm">
          <dt className="micro-label">ACTION</dt>
          <dd className="min-w-0">
            <ActionBadge action={entry.action} />
          </dd>
          <dt className="micro-label">ACTOR</dt>
          <dd className="min-w-0">
            <ActorLabel actor={entry.actor} />
          </dd>
          <dt className="micro-label">ENTITY</dt>
          <dd className="font-mono">{entityText(entry)}</dd>
          <dt className="micro-label">IP</dt>
          <dd className="font-mono text-fg-secondary">{entry.ip_address ?? '—'}</dd>
        </dl>

        <section aria-labelledby="audit-changes" className="flex flex-col gap-2">
          <h3 id="audit-changes" className="text-sm font-medium">
            Changes
          </h3>
          {changes.length === 0 ? (
            <p className="text-sm text-fg-tertiary">
              {rows.length === 0 ? 'This entry stores no values.' : 'No field changed.'}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {changes.map((row) => {
                const kind = KIND[row.kind as Exclude<DiffKind, 'same'>];
                return (
                  <li key={row.key} className="flex flex-col gap-1 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className={cn('flex items-center gap-1', kind.className)}>
                        <kind.Icon aria-hidden="true" className="size-3.5" />
                        {kind.word}
                      </span>
                      <code className="font-mono text-foreground">{row.key}</code>
                    </span>
                    <span className="font-mono text-xs break-all text-fg-secondary">
                      {row.kind === 'added' ? (
                        compactJson(row.after)
                      ) : row.kind === 'removed' ? (
                        <s>{compactJson(row.before)}</s>
                      ) : (
                        <>
                          <s className="text-fg-tertiary">{compactJson(row.before)}</s>
                          <span aria-hidden="true"> → </span>
                          <span className="sr-only"> to </span>
                          {compactJson(row.after)}
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {unchanged > 0 ? (
            <p className="text-xs text-fg-tertiary">
              {unchanged} unchanged {unchanged === 1 ? 'field' : 'fields'} not listed.
            </p>
          ) : null}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <RawBlock title="Before" value={entry.old_value} />
          <RawBlock title="After" value={entry.new_value} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RawBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="micro-label">{title}</figcaption>
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-surface-1 p-3 font-mono text-xs text-fg-secondary">
        {prettyJson(value)}
      </pre>
    </figure>
  );
}
