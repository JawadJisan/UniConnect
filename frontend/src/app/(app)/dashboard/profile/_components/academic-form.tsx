'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { academicSessionSchema, studentIdSchema, type UserProfile } from '@uniconnect/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { controlProps, Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/sonner';
import { useUpdateMe } from '@/hooks/use-me';
import type { ApiError } from '@/lib/api';
import { Panel } from '../../../_components/panel';
import { applyServerError } from './server-errors';

const FORM_ID = 'academic-form';
const ORDINAL = ['1st', '2nd', '3rd', '4th'];

// Mirrors the academic part of updateStudentProfileSchema. Selects hold strings.
const schema = z.object({
  student_id: studentIdSchema,
  academic_session: academicSessionSchema,
  current_year: z.coerce.number().int().min(1).max(4),
  current_semester: z.coerce.number().int().min(1).max(2),
});
type Input = z.input<typeof schema>;
type Values = z.output<typeof schema>;
const FIELDS = ['student_id', 'academic_session', 'current_year', 'current_semester'] as const;

const PLAIN: Record<keyof Values, string> = {
  student_id: 'Enter your student ID, up to 50 characters.',
  academic_session: 'Enter your session as two years, like 2024-2025.',
  current_year: 'Choose your current year.',
  current_semester: 'Choose your current semester.',
};

function toValues(p: UserProfile): Input {
  return {
    student_id: p.student_id ?? '',
    academic_session: p.academic_session ?? '',
    current_year: String(p.current_year ?? ''),
    current_semester: String(p.current_semester ?? ''),
  };
}

/** Student ID, session, year and semester. Rendered for `user_type = student` only. */
export function AcademicForm({ profile }: { profile: UserProfile }) {
  const update = useUpdateMe();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, dirtyFields, isDirty, isSubmitting },
  } = useForm<Input, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(profile),
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const body: Record<string, unknown> = {};
    for (const field of FIELDS) if (dirtyFields[field]) body[field] = values[field];
    if (Object.keys(body).length === 0) return;

    try {
      const saved = await update.mutateAsync(body);
      reset(toValues(saved));
      toast.success('Academic details saved.');
    } catch (thrown) {
      setFormError(
        applyServerError(thrown as ApiError, setError, FIELDS, { STUDENT_ID_TAKEN: 'student_id' }),
      );
    }
  }

  const err = (name: keyof Values) => {
    const e = errors[name];
    if (!e) return undefined;
    // Server messages and the shared schemas' own format messages pass through.
    if (e.type === 'server' || !e.type || e.type === 'invalid_format') {
      return name === 'academic_session' && e.type ? PLAIN.academic_session : e.message;
    }
    return PLAIN[name];
  };

  return (
    <Panel
      id="academic-title"
      title="Academic details"
      tag="SYS.PROFILE.ACADEMIC"
      footer={
        <>
          {isDirty ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset(toValues(profile));
                setFormError(null);
              }}
            >
              Discard
            </Button>
          ) : null}
          <Button
            type="submit"
            form={FORM_ID}
            // One indigo primary per view (DESIGN.md §7): a save is primary only while its
            // form has unsaved changes.
            variant={isDirty ? 'default' : 'secondary'}
            disabled={!isDirty || isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Save academic details'}
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
        <Field
          id="student_id"
          label="Student ID"
          description="Unique within your department."
          error={err('student_id')}
        >
          <Input
            {...controlProps('student_id', { error: err('student_id'), description: true })}
            {...register('student_id')}
            autoComplete="off"
            spellCheck={false}
            className="h-9 font-mono"
          />
        </Field>
        <Field
          id="academic_session"
          label="Academic session"
          description="For example 2024-2025."
          error={err('academic_session')}
        >
          <Input
            {...controlProps('academic_session', {
              error: err('academic_session'),
              description: true,
            })}
            {...register('academic_session')}
            inputMode="numeric"
            autoComplete="off"
            className="h-9 font-mono"
          />
        </Field>
        <Field id="current_year" label="Current year" error={err('current_year')}>
          <NativeSelect
            {...controlProps('current_year', { error: err('current_year') })}
            {...register('current_year')}
          >
            {ORDINAL.map((label, i) => (
              <option key={label} value={String(i + 1)}>
                {label} year
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="current_semester" label="Current semester" error={err('current_semester')}>
          <NativeSelect
            {...controlProps('current_semester', { error: err('current_semester') })}
            {...register('current_semester')}
          >
            {ORDINAL.slice(0, 2).map((label, i) => (
              <option key={label} value={String(i + 1)}>
                {label} semester
              </option>
            ))}
          </NativeSelect>
        </Field>
      </form>
    </Panel>
  );
}
