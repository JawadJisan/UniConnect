'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { renewDeptAdminSchema, type DeptAdminTerm } from '@uniconnect/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
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
import { useRenewDeptAdminTerm } from '@/hooks/use-dept-admin-terms';
import type { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { applyServerError } from '@/lib/server-errors';
import { addYears, todayInDhaka } from '@/lib/terms';

type Values = z.infer<typeof renewDeptAdminSchema>;
const FIELDS = ['start_date', 'end_date'] as const;

/**
 * Renew a current term (PRD FR-ADMIN-003): the old term closes and the new one opens in one
 * transaction, so the role stays dept_admin the whole time.
 */
export function RenewDeptAdminDialog({
  term,
  open,
  onOpenChange,
}: {
  term: DeptAdminTerm;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = todayInDhaka();
  const renew = useRenewDeptAdminTerm();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(renewDeptAdminSchema),
    defaultValues: { start_date: today, end_date: addYears(term.end_date, 1) },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const next = await renew.mutateAsync({ id: term.id, body: values });
      toast.success(`${term.user.name}'s term renewed until ${formatDate(next.end_date)}.`);
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
            <DialogTitle>Renew {term.user.name}&apos;s term</DialogTitle>
            <DialogDescription>
              {term.department.name}. The current term (until {formatDate(term.end_date)}) is
              replaced by this one. Their role stays department admin throughout.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="renew-start" label="New term starts" error={err('start_date')}>
              <Input
                {...controlProps('renew-start', { error: err('start_date') })}
                type="date"
                max={today}
                className="h-9 font-mono"
                {...register('start_date')}
              />
            </Field>
            <Field id="renew-end" label="Last day" error={err('end_date')}>
              <Input
                {...controlProps('renew-end', { error: err('end_date') })}
                type="date"
                min={today}
                className="h-9 font-mono"
                {...register('end_date')}
              />
            </Field>
          </div>
          {formError ? (
            <FormAlert tone="error" title="The term wasn't renewed.">
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
              {isSubmitting ? 'Renewing…' : 'Renew term'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
