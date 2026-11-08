'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  BLOOD_GROUPS,
  registerFacultySchema,
  registerStudentSchema,
  type Department,
  type RegisterStudentInput,
} from '@uniconnect/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { controlProps, Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, toApiError } from '@/lib/api';
import { describePassword, PASSWORD_HINT } from '../_components/password-hint';
import { PasswordInput } from '../_components/password-input';

export type AccountKind = 'student' | 'faculty';

type StudentOnly = 'academic_session' | 'current_year' | 'current_semester' | 'student_id';

/** Student fields are a superset of faculty ones; the faculty schema rejects the extras. */
type FormValues = Omit<RegisterStudentInput, StudentOnly> &
  Partial<Pick<RegisterStudentInput, StudentOnly>>;

const toNumber = (v: unknown) => (v === '' || v === undefined ? undefined : Number(v));
const toOptional = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** Where a server error code belongs on the form. */
const CODE_FIELD: Record<string, keyof FormValues> = {
  EMAIL_TAKEN: 'email',
  STUDENT_ID_TAKEN: 'student_id',
  DEPARTMENT_NOT_FOUND: 'department_id',
};

/**
 * Plain wording for Zod's generic issues (empty, wrong type, not an option, too long). Custom
 * messages from the shared schemas (password policy, session and student ID formats) and
 * server messages pass through unchanged.
 */
const PLAIN: Partial<Record<keyof FormValues, string>> = {
  name: 'Enter your full name, 2 to 100 characters.',
  email: 'Enter a valid email address, like name@example.com.',
  department_id: 'Choose your department.',
  student_id: 'Enter your student ID, up to 50 characters.',
  academic_session: 'Enter your session as two years, like 2024-2025.',
  current_year: 'Choose your current year.',
  current_semester: 'Choose your current semester.',
  blood_group: 'Choose your blood group.',
  phone: 'Enter 10 to 15 digits, with an optional leading +.',
};
const GENERIC_ISSUES = new Set(['too_small', 'too_big', 'invalid_type', 'invalid_value']);

const ORDINAL = ['1st', '2nd', '3rd', '4th'];

function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await api.get<{ data: Department[] }>('/v1/departments')).data.data,
  });
}

export function RegisterForm({ kind }: { kind: AccountKind }) {
  const router = useRouter();
  const departments = useDepartments();
  const [formError, setFormError] = useState<string | null>(null);
  const student = kind === 'student';

  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(
      student ? registerStudentSchema : registerFacultySchema,
    ) as unknown as Resolver<FormValues>,
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await api.post(`/v1/auth/register/${kind}`, values);
      router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
    } catch (thrown) {
      const err = toApiError(thrown);
      const field = CODE_FIELD[err.code];
      if (field) {
        setError(field, { message: err.message }, { shouldFocus: true });
        return;
      }
      if (err.fields.length) {
        err.fields.forEach((f, i) =>
          setError(f.path as keyof FormValues, { message: f.message }, { shouldFocus: i === 0 }),
        );
        return;
      }
      setFormError(
        err.status === 429
          ? 'Too many sign-up attempts from this network. Try again in an hour.'
          : err.message,
      );
    }
  }

  const err = (name: keyof FormValues) => {
    const e = errors[name];
    if (!e) return undefined;
    // Client and server both reject a weak password with the same generic sentence.
    if (name === 'password') return describePassword(getValues('password'));
    // The shared format message's example (2022-2023) differs from the hint's; keep one.
    if (name === 'academic_session' && e.type) return PLAIN.academic_session;
    const generic =
      GENERIC_ISSUES.has(String(e.type)) || (name === 'email' && e.type === 'invalid_format');
    return (generic && PLAIN[name]) || e.message;
  };
  const deptError =
    err('department_id') ??
    (departments.isError ? "Couldn't load departments. Reload the page to try again." : undefined);

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8">
      {formError ? <FormAlert tone="error" title={formError} /> : null}

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 text-md font-semibold">Your account</legend>
        <Field id="name" label="Full name" error={err('name')}>
          <Input
            {...controlProps('name', { error: err('name') })}
            {...register('name')}
            autoComplete="name"
            className="h-9"
          />
        </Field>
        <Field id="email" label="Email" error={err('email')}>
          <Input
            {...controlProps('email', { error: err('email') })}
            {...register('email')}
            type="email"
            autoComplete="email"
            className="h-9"
          />
        </Field>
        <Field id="password" label="Password" description={PASSWORD_HINT} error={err('password')}>
          <PasswordInput
            {...controlProps('password', { error: err('password'), description: true })}
            {...register('password')}
            autoComplete="new-password"
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 text-md font-semibold">
          {student ? 'Studies' : 'Where you teach'}
        </legend>
        <Field id="department_id" label="Department" error={deptError}>
          <NativeSelect
            {...controlProps('department_id', { error: deptError })}
            {...register('department_id', { setValueAs: toNumber })}
            defaultValue=""
            disabled={departments.isPending}
          >
            <option value="" disabled>
              {departments.isPending ? 'Loading departments…' : 'Choose your department'}
            </option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.description ? `${d.name} (${d.description})` : d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {student ? (
          <>
            <Field id="student_id" label="Student ID" error={err('student_id')}>
              <Input
                {...controlProps('student_id', { error: err('student_id') })}
                {...register('student_id')}
                autoComplete="off"
                spellCheck={false}
                className="h-9 font-mono"
              />
            </Field>
            <Field
              id="academic_session"
              label="Academic session"
              description="The year you started and the year after, for example 2024-2025."
              error={err('academic_session')}
            >
              <Input
                {...controlProps('academic_session', {
                  error: err('academic_session'),
                  description: true,
                })}
                {...register('academic_session')}
                inputMode="numeric"
                className="h-9 font-mono"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field id="current_year" label="Year" error={err('current_year')}>
                <NativeSelect
                  {...controlProps('current_year', { error: err('current_year') })}
                  {...register('current_year', { setValueAs: toNumber })}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose
                  </option>
                  {ORDINAL.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label} year
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="current_semester" label="Semester" error={err('current_semester')}>
                <NativeSelect
                  {...controlProps('current_semester', { error: err('current_semester') })}
                  {...register('current_semester', { setValueAs: toNumber })}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose
                  </option>
                  <option value={1}>1st semester</option>
                  <option value={2}>2nd semester</option>
                </NativeSelect>
              </Field>
            </div>
          </>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 text-md font-semibold">Blood donation and contact</legend>
        <Field
          id="blood_group"
          label="Blood group"
          description="Used by the blood donation network."
          error={err('blood_group')}
        >
          <NativeSelect
            {...controlProps('blood_group', { error: err('blood_group'), description: true })}
            {...register('blood_group')}
            defaultValue=""
          >
            <option value="" disabled>
              Choose your blood group
            </option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="phone" label="Phone" optional error={err('phone')}>
          <Input
            {...controlProps('phone', { error: err('phone') })}
            {...register('phone', { setValueAs: toOptional })}
            type="tel"
            autoComplete="tel"
            placeholder="+8801XXXXXXXXX"
            className="h-9 font-mono"
          />
        </Field>
      </fieldset>

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-sm text-fg-tertiary">
          We&apos;ll email you a link to confirm your address before you can log in.
        </p>
      </div>
    </form>
  );
}
