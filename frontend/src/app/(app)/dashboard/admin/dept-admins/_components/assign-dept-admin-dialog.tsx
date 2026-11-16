'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { assignDeptAdminSchema } from '@uniconnect/shared';
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
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/sonner';
import { useAdminUsers } from '@/hooks/use-admin-users';
import { useDepartments } from '@/hooks/use-departments';
import { useAssignDeptAdmin } from '@/hooks/use-dept-admin-terms';
import type { ApiError } from '@/lib/api';
import { applyServerError } from '@/lib/server-errors';
import { oneYearTermEnd, todayInDhaka } from '@/lib/terms';

type FormInput = z.input<typeof assignDeptAdminSchema>;
type Values = z.output<typeof assignDeptAdminSchema>;
const FIELDS = ['user_id', 'department_id', 'start_date', 'end_date'] as const;
const PICK_SOMEONE = 'Choose the faculty member to assign.';
const PICKER_LIMIT = 10;

/**
 * Appoint a department admin (PRD FR-ADMIN-001). Department first, then a faculty member of
 * that department (user_type, so a faculty moderator qualifies). The term must include today.
 */
export function AssignDeptAdminDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = todayInDhaka();
  const departments = useDepartments();
  const assign = useAssignDeptAdmin();
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, Values>({
    resolver: zodResolver(assignDeptAdminSchema),
    defaultValues: {
      user_id: '',
      department_id: undefined,
      start_date: today,
      end_date: oneYearTermEnd(today),
    },
  });
  const departmentId = useWatch({ control, name: 'department_id' });
  const userId = useWatch({ control, name: 'user_id' });
  const hasDepartment = typeof departmentId === 'number' && departmentId > 0;
  const departmentName = departments.data?.find((d) => d.id === departmentId)?.name ?? '';

  const searching = hasDepartment && search.length >= 2;
  const faculty = useAdminUsers(
    {
      user_type: 'faculty',
      is_active: 'true',
      department_id: hasDepartment ? departmentId : undefined,
      search,
      limit: PICKER_LIMIT,
    },
    { enabled: searching },
  );
  const people: PickerPerson[] = searching
    ? (faculty.data?.data ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        avatar_url: u.avatar_url,
        sub: u.email,
        disabledReason: u.role === 'dept_admin' ? 'Already a dept admin' : undefined,
      }))
    : [];

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const term = await assign.mutateAsync(values);
      toast.success(`${term.user.name} is now the ${term.department.name} department admin.`);
      onOpenChange(false);
    } catch (thrown) {
      setFormError(
        applyServerError(thrown as ApiError, setError, FIELDS, {
          NOT_FACULTY: 'user_id',
          USER_NOT_IN_DEPARTMENT: 'user_id',
          USER_HAS_ADMIN_TERM: 'user_id',
          USER_SUSPENDED: 'user_id',
          USER_NOT_FOUND: 'user_id',
          DEPARTMENT_NOT_FOUND: 'department_id',
        }),
      );
    }
  });

  const pickerError = errors.user_id ? (userId ? errors.user_id.message : PICK_SOMEONE) : undefined;
  const deptError = errors.department_id ? 'Choose a department.' : undefined;
  const err = (name: 'start_date' | 'end_date') => errors[name]?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Assign a department admin</DialogTitle>
            <DialogDescription>
              They manage the department&apos;s club, memberships and committee until the term ends.
              A department has one current admin.
            </DialogDescription>
          </DialogHeader>

          <Field id="dept-admin-department" label="Department" error={deptError}>
            <NativeSelect
              {...controlProps('dept-admin-department', { error: deptError })}
              value={hasDepartment ? String(departmentId) : ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                setValue('department_id', id > 0 ? id : (undefined as unknown as number), {
                  shouldValidate: Boolean(errors.department_id),
                });
                // A different department means a different set of people.
                setValue('user_id', '');
              }}
            >
              <option value="">Choose a department</option>
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <PersonPicker
            key={hasDepartment ? departmentId : 'none'}
            id="dept-admin-person"
            label="Faculty member"
            placeholder="Name or email"
            people={people}
            status={
              !searching
                ? 'idle'
                : faculty.isError
                  ? 'error'
                  : faculty.isFetching
                    ? 'loading'
                    : 'ready'
            }
            value={userId || undefined}
            onChange={(id) => setValue('user_id', id, { shouldValidate: true, shouldDirty: true })}
            onSearch={setSearch}
            error={pickerError}
            disabled={!hasDepartment}
            disabledHint="Choose a department first."
            emptyText={(q) => `No active faculty in ${departmentName} matches “${q}”.`}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="dept-admin-start" label="Starts" error={err('start_date')}>
              <Input
                {...controlProps('dept-admin-start', { error: err('start_date') })}
                type="date"
                max={today}
                className="h-9 font-mono"
                {...register('start_date')}
              />
            </Field>
            <Field id="dept-admin-end" label="Last day" error={err('end_date')}>
              <Input
                {...controlProps('dept-admin-end', { error: err('end_date') })}
                type="date"
                min={today}
                className="h-9 font-mono"
                {...register('end_date')}
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
              {isSubmitting ? 'Assigning…' : 'Assign dept admin'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
