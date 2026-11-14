'use client';

import type { ChatLogEntry } from '@uniconnect/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABEL } from '../../../../_components/nav';

// DESIGN.md §7 "Chatbot logs". One logged question and its full answer. Never an email.

export function ChatLogDialog({ entry, onClose }: { entry: ChatLogEntry; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Question #{entry.id}</DialogTitle>
            <span className="micro-label">SYS.AI.LOG</span>
          </div>
          <DialogDescription>
            Stored with email addresses and phone numbers removed.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-1 p-4 text-sm">
          <dt className="micro-label">TIME</dt>
          <dd className="font-mono tabular-nums">
            <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
          </dd>
          <dt className="micro-label">USER</dt>
          <dd className="min-w-0 truncate">{entry.user.name}</dd>
          <dt className="micro-label">ROLE</dt>
          <dd>{ROLE_LABEL[entry.user.role]}</dd>
        </dl>

        <TextBlock title="QUESTION" text={entry.question} />
        <TextBlock title="ANSWER" text={entry.answer} />
      </DialogContent>
    </Dialog>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="micro-label">{title}</figcaption>
      <p className="max-h-60 overflow-y-auto rounded-md border border-border bg-surface-1 p-3 text-sm whitespace-pre-line break-words text-foreground">
        {text}
      </p>
    </figure>
  );
}
