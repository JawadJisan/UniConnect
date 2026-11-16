'use client';

import type { GenerateEventDescriptionInput } from '@uniconnect/shared';
import { LoaderCircleIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGenerateEventDescription } from '@/hooks/use-chatbot';
import { aiErrorMessage, type AiError } from '@/lib/chatbot';

// FR-AI-003 (DECISIONS D44, D45): a 2–3 sentence draft from the form's own fields. It only
// fills the description; the organizer reviews it and saves as usual.

/** The form's values, as far as they are filled in. */
export interface DraftSource {
  title: string;
  clubName: string;
  /** ISO with offset, or empty when the start isn't set. */
  date: string;
  venue: string;
}

const HINT_ID = 'event-draft-hint';
const ERROR_ID = 'event-draft-error';

/** What's still missing before a draft can be asked for, in the form's words. */
export function missingForDraft(source: DraftSource): string[] {
  const missing: string[] = [];
  if (!source.title.trim()) missing.push('a title');
  if (!source.date) missing.push('a start time');
  if (!source.venue.trim()) missing.push('a venue');
  if (!source.clubName.trim()) missing.push('the organizing club');
  return missing;
}

function list(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

export function DraftDescriptionButton({
  source,
  hasDescription,
  onDraft,
}: {
  source: DraftSource;
  hasDescription: boolean;
  onDraft: (text: string) => void;
}) {
  const draft = useGenerateEventDescription();
  const [confirming, setConfirming] = useState(false);
  const missing = missingForDraft(source);
  const ready = missing.length === 0;
  const error = draft.error as AiError | null;

  function run() {
    setConfirming(false);
    const input: GenerateEventDescriptionInput = {
      title: source.title.trim(),
      club_name: source.clubName.trim(),
      date: source.date,
      venue: source.venue.trim(),
    };
    draft.mutate(input, { onSuccess: onDraft });
  }

  const describedBy = [ready ? null : HINT_ID, error ? ERROR_ID : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {ready ? (
          <span className="text-xs text-fg-tertiary">
            Uses the title, club, start time and venue.
          </span>
        ) : (
          <span id={HINT_ID} className="text-xs text-fg-tertiary">
            Add {list(missing)} to draft a description.
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!ready || draft.isPending}
          aria-describedby={describedBy || undefined}
          onClick={() => (hasDescription ? setConfirming(true) : run())}
        >
          {draft.isPending ? (
            <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
          ) : (
            <SparklesIcon aria-hidden="true" />
          )}
          {draft.isPending ? 'Drafting…' : 'Draft with AI'}
        </Button>
      </div>
      {error ? (
        <p id={ERROR_ID} role="alert" className="text-sm text-destructive">
          {aiErrorMessage(error)}
        </p>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <DialogTitle>Replace the current description?</DialogTitle>
              <span className="micro-label">SYS.AI.DRAFT</span>
            </div>
            <DialogDescription>
              The draft replaces what you&apos;ve written. Nothing is saved until you save the
              event.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Keep mine
            </Button>
            <Button type="button" onClick={run}>
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
