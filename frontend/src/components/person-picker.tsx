'use client';

import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { errorId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface PickerPerson {
  id: string;
  name: string;
  avatar_url: string | null;
  /** Mono line under the name: student ID, or the account type. */
  sub: string;
  /** Shown instead of a radio when this person can't be picked, in words. */
  disabledReason?: string;
}

export type PickerStatus = 'idle' | 'loading' | 'error' | 'ready';

/** Characters typed before a search runs. */
export const PICKER_MIN_CHARS = 2;
const SEARCH_DELAY_MS = 300;

/**
 * Search, then choose one person (DESIGN.md §7 "Person picker"). Results are native radios
 * drawn as rows, so arrow keys move between them and Enter submits the surrounding form; no
 * combobox library. The parent owns the query: it receives the debounced text in `onSearch`.
 */
export function PersonPicker({
  id,
  label,
  placeholder,
  people,
  status,
  value,
  onChange,
  onSearch,
  error,
  disabled,
  disabledHint,
  emptyText,
}: {
  id: string;
  label: string;
  placeholder: string;
  people: PickerPerson[];
  status: PickerStatus;
  value: string | undefined;
  onChange: (id: string) => void;
  /** Called with the trimmed text 300ms after typing stops. */
  onSearch: (text: string) => void;
  error?: string;
  disabled?: boolean;
  /** Why the picker is disabled, e.g. "Choose a department first." */
  disabledHint?: string;
  emptyText: (search: string) => string;
}) {
  const [text, setText] = useState('');
  const trimmed = text.trim();

  useEffect(() => {
    const timer = setTimeout(() => onSearch(trimmed), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [trimmed, onSearch]);

  // The chosen person stays named even after a new search drops them from the results.
  const [chosen, setChosen] = useState<PickerPerson | null>(null);
  const selected = value ? (people.find((p) => p.id === value) ?? chosen) : null;

  const tooShort = trimmed.length < PICKER_MIN_CHARS;
  const hintId = `${id}-hint`;

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium text-foreground">{label}</legend>
      <div className="relative">
        <label htmlFor={`${id}-search`} className="sr-only">
          {label}: search
        </label>
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-tertiary"
        />
        <Input
          id={`${id}-search`}
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          maxLength={100}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={[hintId, error ? errorId(id) : null].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          className="h-9 pl-8"
        />
      </div>

      <div id={hintId} aria-live="polite" className="min-h-0">
        {disabled && disabledHint ? (
          <p className="text-sm text-fg-tertiary">{disabledHint}</p>
        ) : tooShort ? (
          <p className="text-sm text-fg-tertiary">
            Type at least {PICKER_MIN_CHARS} characters to search.
          </p>
        ) : status === 'loading' && people.length === 0 ? (
          <div className="flex flex-col gap-2 py-1" aria-busy="true">
            <span className="sr-only">Searching…</span>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
          </div>
        ) : status === 'error' ? (
          <p className="text-sm text-destructive">Couldn&apos;t search right now. Try again.</p>
        ) : people.length === 0 && status === 'ready' ? (
          <p className="text-sm text-fg-tertiary">{emptyText(trimmed)}</p>
        ) : null}
      </div>

      {!tooShort && people.length > 0 ? (
        <div
          role="radiogroup"
          aria-label={`${label}: results`}
          className={cn(
            'flex max-h-56 flex-col overflow-y-auto rounded-lg border border-border',
            status === 'loading' && 'opacity-60',
          )}
        >
          {people.map((p) => {
            const radioId = `${id}-${p.id}`;
            const unavailable = Boolean(p.disabledReason);
            return (
              <label
                key={p.id}
                htmlFor={radioId}
                className={cn(
                  'flex min-h-10 cursor-pointer items-center gap-3 border-b border-border px-3 py-1.5 last:border-b-0',
                  'transition-colors duration-(--duration-fast) hover:bg-surface-2',
                  'has-checked:bg-brand-tint has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-inset',
                  unavailable && 'cursor-not-allowed opacity-60 hover:bg-transparent',
                )}
              >
                <input
                  id={radioId}
                  type="radio"
                  name={id}
                  value={p.id}
                  checked={value === p.id}
                  disabled={unavailable}
                  onChange={() => {
                    setChosen(p);
                    onChange(p.id);
                  }}
                  className="size-4 shrink-0 accent-brand"
                />
                <Avatar name={p.name} src={p.avatar_url} size={24} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{p.name}</span>
                  <span className="truncate font-mono text-xs text-fg-tertiary">{p.sub}</span>
                </span>
                {p.disabledReason ? (
                  <span className="shrink-0 text-xs text-fg-tertiary">{p.disabledReason}</span>
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}

      {selected ? (
        <p className="text-sm text-fg-secondary" aria-live="polite">
          Selected: <span className="font-medium text-foreground">{selected.name}</span>{' '}
          <span className="font-mono text-xs text-fg-tertiary">{selected.sub}</span>
        </p>
      ) : null}

      {error ? (
        <p id={errorId(id)} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
