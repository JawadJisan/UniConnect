'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { assignCommitteeSchema, type ClubDetail } from '@uniconnect/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { PersonPicker, type PickerPerson } from '@/components/person-picker';
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
import { useAssignCommittee, useCommitteeCandidates } from '@/hooks/use-committee';
import type { ApiError } from '@/lib/api';
import { applyServerError } from '@/lib/server-errors';
import { COMMITTEE_POSITIONS, currentDhakaYear } from '@/lib/terms';

type FormInput = z.input<typeof assignCommitteeSchema>;
type Values = z.output<typeof assignCommitteeSchema>;
const FIELDS = ['user_id', 'position', 'term_start_year', 'term_end_year'] as const;
const PICK_SOMEONE = 'Choose the person to assign.';

/**
 * Assign a committee member (PRD FR-COMM-002). The picker searches the club's own department
 * (the API returns no one else), and a person already seated is shown but can't be picked.
 * Assigning makes a student or faculty member a moderator.
 */
export function AssignCommitteeDialog({
  club,
  open,
  onOpenChange,
}: {
  club: Pick<ClubDetail, 'id' | 'name' | 'department'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const year = currentDhakaYear();
  const assign = useAssignCommittee(club.id);
  const [search, setSearch] = useState('');
  const candidates = useCommitteeCandidates(club.id, search);
  const [formError, setFormError] = useState<string | null>(null);
  const [chosenName, setChosenName] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, Values>({
    resolver: zodResolver(assignCommitteeSchema),
    defaultValues: {
      user_id: '',
      position: '',
      term_start_year: year,
      term_end_year: year + 1,
      is_current: true,
    },
  });
  const userId = useWatch({ control, name: 'user_id' });

  const people: PickerPerson[] = (candidates.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    avatar_url: c.avatar_url,
    sub: c.student_id ?? (c.user_type === 'faculty' ? 'FACULTY' : 'STUDENT'),
    disabledReason: c.on_committee ? 'Already on the committee' : undefined,
  }));

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await assign.mutateAsync(values);
      toast.success(`${saved.user.name} assigned as ${saved.position}.`);
      onOpenChange(false);
    } catch (thrown) {
      const err = thrown as ApiError;
      setFormError(
        applyServerError(err, setError, FIELDS, {
          ALREADY_ON_COMMITTEE: 'user_id',
          USER_NOT_IN_CLUB_DEPARTMENT: 'user_id',
          INVALID_COMMITTEE_USER: 'user_id',
          USER_SUSPENDED: 'user_id',
          USER_NOT_FOUND: 'user_id',
        }),
      );
    }
  });

  const pickerError = errors.user_id ? (userId ? errors.user_id.message : PICK_SOMEONE) : undefined;
  const err = (name: 'position' | 'term_start_year' | 'term_end_year') => errors[name]?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Assign a committee member</DialogTitle>
            <DialogDescription>
              {club.name}. Students and faculty become moderators while their term is current.
            </DialogDescription>
          </DialogHeader>

          <PersonPicker
            id="committee-person"
            label="Person"
            placeholder="Name or student ID"
            people={people}
            status={
              candidates.isError
                ? 'error'
                : candidates.isFetching
                  ? 'loading'
                  : search.length >= 2
                    ? 'ready'
                    : 'idle'
            }
            value={userId || undefined}
            onChange={(id) => {
              setChosenName(people.find((p) => p.id === id)?.name ?? '');
              setValue('user_id', id, { shouldValidate: true, shouldDirty: true });
            }}
            onSearch={setSearch}
            error={pickerError}
            emptyText={(q) =>
              `No active student or faculty in ${club.department.name} matches “${q}”.`
            }
          />

          <Field id="committee-position" label="Position" error={err('position')}>
            <Input
              {...controlProps('committee-position', { error: err('position') })}
              list="committee-positions"
              placeholder="President"
              autoComplete="off"
              maxLength={50}
              className="h-9"
              {...register('position')}
            />
            <datalist id="committee-positions">
              {COMMITTEE_POSITIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="committee-start" label="Term starts (year)" error={err('term_start_year')}>
              <Input
                {...controlProps('committee-start', { error: err('term_start_year') })}
                type="number"
                inputMode="numeric"
                min={2000}
                max={2100}
                className="h-9 font-mono"
                {...register('term_start_year', { valueAsNumber: true })}
              />
            </Field>
            <Field id="committee-end" label="Term ends (year)" error={err('term_end_year')}>
              <Input
                {...controlProps('committee-end', { error: err('term_end_year') })}
                type="number"
                inputMode="numeric"
                min={2000}
                max={2100}
                className="h-9 font-mono"
                {...register('term_end_year', { valueAsNumber: true })}
              />
            </Field>
          </div>

          {formError ? (
            <FormAlert tone="error" title="No one was assigned.">
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Assigning…' : chosenName ? `Assign ${chosenName}` : 'Assign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
