'use client';

import type { PaginationMeta } from '@uniconnect/shared';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

// Controls shared by the workspace's list pages (admin users, memberships): DESIGN.md
// "Admin list". The label is visually hidden; the first option names the unfiltered state.

export function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  all,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  all: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** "21–40 of 134" in mono, with Previous and Next. */
export function Pager({ meta, onPage }: { meta: PaginationMeta; onPage: (page: number) => void }) {
  const first = (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
      <p className="font-mono text-fg-secondary tabular-nums" aria-live="polite">
        {first}–{last} of {meta.total}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          <ChevronLeftIcon data-icon="inline-start" />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={meta.page >= meta.total_pages}
          onClick={() => onPage(meta.page + 1)}
        >
          Next
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  );
}
