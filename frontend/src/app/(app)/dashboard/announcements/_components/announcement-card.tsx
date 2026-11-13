'use client';

import type { Announcement } from '@uniconnect/shared';
import { PencilIcon, PinIcon, PinOffIcon, Trash2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { scopeLabel } from '@/lib/announcements';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Posts longer than this, or with more lines, start clamped with "Show more". */
const CLAMP_CHARS = 480;
const CLAMP_LINES = 6;

export interface CardActions {
  onEdit: (a: Announcement) => void;
  onDelete: (a: Announcement) => void;
  onTogglePin: (a: Announcement) => void;
  /** The id whose pin toggle is running, so only that button shows it. */
  pinningId: number | null;
}

/**
 * One announcement (DESIGN.md "Announcement card"). The body is plain text, never HTML.
 * Actions follow the API's `can_pin` and `can_manage` flags, so the UI never repeats the rules.
 */
export function AnnouncementCard({
  announcement: a,
  actions,
}: {
  announcement: Announcement;
  actions: CardActions;
}) {
  const titleId = useId();
  const long = a.content.length > CLAMP_CHARS || a.content.split('\n').length > CLAMP_LINES;
  const [expanded, setExpanded] = useState(false);
  const edited = a.updated_at !== a.created_at;
  const hasActions = a.can_pin || a.can_manage;
  const pinning = actions.pinningId === a.id;

  return (
    <article aria-labelledby={titleId}>
      <Card className={cn('gap-4', a.is_pinned && 'border-border-strong')}>
        <CardHeader>
          <h2 id={titleId} className="text-md leading-snug font-medium tracking-tight">
            {a.title}
          </h2>
          <CardAction>
            <span className="micro-label">
              {a.is_pinned ? 'SYS.ANNOUNCE.PINNED' : 'SYS.ANNOUNCE.POST'}
            </span>
          </CardAction>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-fg-tertiary">
            <Badge variant="outline" className="font-mono tracking-wide uppercase">
              {scopeLabel(a)}
            </Badge>
            {a.is_pinned ? (
              <Badge variant="secondary" className="font-mono tracking-wide uppercase">
                <PinIcon data-icon="inline-start" aria-hidden="true" />
                Pinned
              </Badge>
            ) : null}
            <span>
              <span className="text-fg-secondary">{a.author.name}</span>
              {' · '}
              <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>
                {formatRelative(a.created_at)}
              </time>
              {edited ? <span title={formatDateTime(a.updated_at)}> · edited</span> : null}
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-2">
          <p
            className={cn(
              'text-sm break-words whitespace-pre-line text-fg-secondary',
              long && !expanded && 'line-clamp-6',
            )}
          >
            {a.content}
          </p>
          {long ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : 'Show more'}
            </Button>
          ) : null}
        </CardContent>
        {hasActions ? (
          <CardFooter className="justify-end gap-1 bg-surface-1 py-2">
            {a.can_pin ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pinning}
                aria-label={`${a.is_pinned ? 'Unpin' : 'Pin'} ${a.title}`}
                onClick={() => actions.onTogglePin(a)}
              >
                {a.is_pinned ? (
                  <PinOffIcon data-icon="inline-start" />
                ) : (
                  <PinIcon data-icon="inline-start" />
                )}
                {pinning ? 'Saving…' : a.is_pinned ? 'Unpin' : 'Pin'}
              </Button>
            ) : null}
            {a.can_manage ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${a.title}`}
                  onClick={() => actions.onEdit(a)}
                >
                  <PencilIcon data-icon="inline-start" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Delete ${a.title}`}
                  onClick={() => actions.onDelete(a)}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Delete
                </Button>
              </>
            ) : null}
          </CardFooter>
        ) : null}
      </Card>
    </article>
  );
}
