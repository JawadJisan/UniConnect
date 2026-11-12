'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  academicSessionSchema,
  BLOOD_GROUPS,
  bloodGroupSchema,
  nameSchema,
  phoneSchema,
  studentIdSchema,
  type AdminUserDetail,
} from '@uniconnect/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { controlProps, Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/sonner';
import { useAdminUpdateUser } from '@/hooks/use-admin-users';
import { useDepartments } from '@/hooks/use-departments';
import type { ApiError } from '@/lib/api';
import { Panel } from '../../../../_components/panel';
import { applyServerError } from '@/lib/server-errors';

const FORM_ID = 'admin-edit-form';
const ORDINAL = ['1st', '2nd', '3rd', '4th'];

// Mirrors adminUpdateUserSchema; the form holds strings. Academic fields are validated only
// for students (they aren't rendered otherwise, and the API rejects them for anyone else).
const base = {
  name: nameSchema,
  phone: z.union([z.literal(''), phoneSchema]),
  blood_group: bloodGroupSchema,
  department_id: z.coerce.number().int().positive(),
};
const studentSchema = z.object({
  ...base,
  student_id: studentIdSchema,
  academic_session: academicSessionSchema,
  current_year: z.coerce.number().int().min(1).max(4),
  current_semester: z.coerce.number().int().min(1).max(2),
});
const staffSchema = z.object(base);

type FormInput = z.input<typeof studentSchema>;
type Values = z.output<typeof studentSchema>;
const FIELDS = [
  'name',
  'phone',
  'blood_group',
  'department_id',
  'student_id',
  'academic_session',
  'current_year',
  'current_semester',
] as const;

function toValues(u: AdminUserDetail): FormInput {
  return {
    name: u.name,
    phone: u.phone ?? '',
    blood_group: u.blood_group ?? 'A+',
    department_id: String(u.department?.id ?? ''),
    student_id: u.student_id ?? '',
    academic_session: u.academic_session ?? '',
    current_year: String(u.current_year ?? ''),
    current_semester: String(u.current_semester ?? ''),
  };
}

/**
 * A super admin correcting a user's details (PRD FR-USER-002 "when assisting", DECISIONS D29).
 * Only changed fields are sent. Moving departments is refused while the user holds a term or
 * an open membership, since those belong to the old department.
 */
export function AdminEditForm({ user: u }: { user: AdminUserDetail }) {
  const student = u.user_type === 'student';
  const update = useAdminUpdateUser(u.id);
  const departments = useDepartments();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, dirtyFields, isDirty, isSubmitting },
  } = useForm<FormInput, unknown, Values>({
    resolver: zodResolver((student ? studentSchema : staffSchema) as typeof studentSchema),
    defaultValues: toValues(u),
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const body: Record<string, unknown> = {};
    for (const field of FIELDS) {
      if (!dirtyFields[field]) continue;
      body[field] = field === 'phone' && values.phone === '' ? null : values[field];
    }
    if (Object.keys(body).length === 0) return;

    try {
      const saved = await update.mutateAsync(body);
      reset(toValues(saved));
      toast.success(`Saved ${saved.name}'s details.`);
    } catch (thrown) {
      const err = thrown as ApiError;
      setFormError(
        err.code === 'DEPARTMENT_CHANGE_BLOCKED'
          ? err.message
          : applyServerError(err, setError, FIELDS, {
              STUDENT_ID_TAKEN: 'student_id',
              DEPARTMENT_NOT_FOUND: 'department_id',
            }),
      );
    }
  }

  const err = (name: (typeof FIELDS)[number]) => errors[name]?.message;

  return (
    <Panel
      id="details-title"
      title="Details"
      tag="SYS.USER.DETAILS"
      description="Correct what the user can't change themselves. Every change is audited."
      footer={
        <>
          {isDirty ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset(toValues(u));
                setFormError(null);
              }}
            >
              Discard
            </Button>
          ) : null}
          <Button
            type="submit"
            form={FORM_ID}
            variant={isDirty ? 'default' : 'secondary'}
            disabled={!isDirty || isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Save details'}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-x-5 gap-y-4 sm:grid-cols-2"
      >
        {formError ? <FormAlert tone="error" title={formError} className="sm:col-span-2" /> : null}
        <Field id="admin-name" label="Full name" error={err('name')} className="sm:col-span-2">
          <Input
            {...controlProps('admin-name', { error: err('name') })}
            {...register('name')}
            className="h-9"
          />
        </Field>
        <Field id="admin-phone" label="Phone" optional error={err('phone')}>
          <Input
            {...controlProps('admin-phone', { error: err('phone') })}
            {...register('phone')}
            type="tel"
            inputMode="tel"
            className="h-9 font-mono"
          />
        </Field>
        <Field id="admin-blood" label="Blood group" error={err('blood_group')}>
          <NativeSelect
            {...controlProps('admin-blood', { error: err('blood_group') })}
            {...register('blood_group')}
          >
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          id="admin-dept"
          label="Department"
          description="Blocked while they hold a committee or admin term, or a club membership."
          error={err('department_id')}
          className="sm:col-span-2"
        >
          <NativeSelect
            {...controlProps('admin-dept', { error: err('department_id'), description: true })}
            {...register('department_id')}
          >
            {departments.data ? null : (
              <option value={String(u.department?.id ?? '')}>{u.department?.name ?? '…'}</option>
            )}
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {student ? (
          <>
            <Field id="admin-student-id" label="Student ID" error={err('student_id')}>
              <Input
                {...controlProps('admin-student-id', { error: err('student_id') })}
                {...register('student_id')}
                className="h-9 font-mono"
              />
            </Field>
            <Field id="admin-session" label="Academic session" error={err('academic_session')}>
              <Input
                {...controlProps('admin-session', { error: err('academic_session') })}
                {...register('academic_session')}
                placeholder="2024-2025"
                className="h-9 font-mono"
              />
            </Field>
            <Field id="admin-year" label="Year" error={err('current_year')}>
              <NativeSelect
                {...controlProps('admin-year', { error: err('current_year') })}
                {...register('current_year')}
              >
                {ORDINAL.map((label, i) => (
                  <option key={label} value={String(i + 1)}>
                    {label} year
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="admin-semester" label="Semester" error={err('current_semester')}>
              <NativeSelect
                {...controlProps('admin-semester', { error: err('current_semester') })}
                {...register('current_semester')}
              >
                <option value="1">1st semester</option>
                <option value="2">2nd semester</option>
              </NativeSelect>
            </Field>
          </>
        ) : null}
      </form>
    </Panel>
  );
}
