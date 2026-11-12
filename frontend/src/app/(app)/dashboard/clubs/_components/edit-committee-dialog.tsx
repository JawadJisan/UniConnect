'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CommitteeEntry, UpdateCommitteeInput } from '@uniconnect/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { controlProps, Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { useUpdateCommittee } from '@/hooks/use-committee';
import type { ApiError } from '@/lib/api';
import { applyServerError } from '@/lib/server-errors';
import { COMMITTEE_POSITIONS } from '@/lib/terms';

// The form always holds all three fields; only the changed ones are sent, which the shared
// updateCommitteeSchema then validates on the server.
const year = z
  .number('Year must be a number.')
  .int('Year must be a whole number.')
  .min(2000, 'Year must be 2000 or later.')
  .max(2100, 'Year must be 2100 or earlier.');
const formSchema = z
  .object({
    position: z
      .string()
      .trim()
      .min(2, 'Position must be at least 2 characters.')
      .max(50, 'Position must be at most 50 characters.'),
    term_start_year: year,
    term_end_year: year,
  })
  .refine((v) => v.term_end_year >= v.term_start_year, {
    message: 'The end year cannot be before the start year.',
    path: ['term_end_year'],
  });
type Values = z.infer<typeof formSchema>;
const FIELDS = ['position', 'term_start_year', 'term_end_year'] as const;

/** Edit a committee row's position or years (PRD FR-COMM-004). The role never changes here. */
export function EditCommitteeDialog({
  clubId,
  member,
  open,
  onOpenChange,
}: {
  clubId: number;
  member: CommitteeEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateCommittee(clubId);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields, isDirty, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      position: member.position,
      term_start_year: member.term_start_year,
      term_end_year: member.term_end_year,
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const body: UpdateCommitteeInput = {};
    if (dirtyFields.position) body.position = values.position;
    if (dirtyFields.term_start_year) body.term_start_year = values.term_start_year;
    if (dirtyFields.term_end_year) body.term_end_year = values.term_end_year;
    try {
      await update.mutateAsync({ memberId: member.id, body });
      toast.success(`${member.user.name}'s position updated.`);
      onOpenChange(false);
    } catch (thrown) {
      setFormError(applyServerError(thrown as ApiError, setError, FIELDS));
    }
  });

  const err = (name: (typeof FIELDS)[number]) => errors[name]?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit {member.user.name}&apos;s position</DialogTitle>
            <DialogDescription>
              Changes the title and term years only. Use End term to remove someone.
            </DialogDescription>
          </DialogHeader>

          <Field id="edit-position" label="Position" error={err('position')}>
            <Input
              {...controlProps('edit-position', { error: err('position') })}
              list="edit-committee-positions"
              autoComplete="off"
              maxLength={50}
              className="h-9"
              {...register('position')}
            />
            <datalist id="edit-committee-positions">
              {COMMITTEE_POSITIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="edit-start" label="Term starts (year)" error={err('term_start_year')}>
              <Input
                {...controlProps('edit-start', { error: err('term_start_year') })}
                type="number"
                inputMode="numeric"
                className="h-9 font-mono"
                {...register('term_start_year', { valueAsNumber: true })}
              />
            </Field>
            <Field id="edit-end" label="Term ends (year)" error={err('term_end_year')}>
              <Input
                {...controlProps('edit-end', { error: err('term_end_year') })}
                type="number"
                inputMode="numeric"
                className="h-9 font-mono"
                {...register('term_end_year', { valueAsNumber: true })}
              />
            </Field>
          </div>

          {formError ? (
            <FormAlert tone="error" title="Nothing was changed.">
              {formError}
            </FormAlert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={isDirty ? 'default' : 'secondary'}
              disabled={!isDirty || isSubmitting}
            >
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
