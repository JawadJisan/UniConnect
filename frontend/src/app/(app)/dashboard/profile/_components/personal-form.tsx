'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  BLOOD_GROUPS,
  bloodGroupSchema,
  nameSchema,
  phoneSchema,
  type UserProfile,
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
import { useUpdateMe } from '@/hooks/use-me';
import type { ApiError } from '@/lib/api';
import { Panel } from '../../../_components/panel';
import { applyServerError } from './server-errors';

const FORM_ID = 'personal-form';

// The form holds strings; an empty phone means "clear it" and an empty blood group (only a
// super admin can have none) means "leave it unset".
const schema = z.object({
  name: nameSchema,
  phone: z.union([z.literal(''), phoneSchema]),
  blood_group: z.union([z.literal(''), bloodGroupSchema]),
});
type Values = z.infer<typeof schema>;
const FIELDS = ['name', 'phone', 'blood_group'] as const;

const PLAIN: Record<keyof Values, string> = {
  name: 'Enter your full name, 2 to 100 characters.',
  phone: 'Enter 10 to 15 digits, with an optional leading +.',
  blood_group: 'Choose your blood group.',
};

function toValues(p: UserProfile): Values {
  return { name: p.name, phone: p.phone ?? '', blood_group: p.blood_group ?? '' };
}

/** Name, phone and blood group: the fields every user type can change. */
export function PersonalForm({ profile }: { profile: UserProfile }) {
  const update = useUpdateMe();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, dirtyFields, isDirty, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(profile) });

  async function onSubmit(values: Values) {
    setFormError(null);
    const body: Record<string, unknown> = {};
    if (dirtyFields.name) body.name = values.name;
    if (dirtyFields.phone) body.phone = values.phone === '' ? null : values.phone;
    if (dirtyFields.blood_group && values.blood_group !== '') body.blood_group = values.blood_group;
    if (Object.keys(body).length === 0) return;

    try {
      const saved = await update.mutateAsync(body);
      reset(toValues(saved));
      toast.success('Personal details saved.');
    } catch (thrown) {
      setFormError(applyServerError(thrown as ApiError, setError, FIELDS));
    }
  }

  const err = (name: keyof Values) => {
    const e = errors[name];
    if (!e) return undefined;
    return e.type === 'server' || !e.type ? e.message : (PLAIN[name] ?? e.message);
  };

  return (
    <Panel
      id="personal-title"
      title="Personal details"
      tag="SYS.PROFILE.PERSONAL"
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
        <Field id="name" label="Full name" error={err('name')} className="sm:col-span-2">
          <Input
            {...controlProps('name', { error: err('name') })}
            {...register('name')}
            autoComplete="name"
            className="h-9"
          />
        </Field>
        <Field
          id="phone"
          label="Phone"
          optional
          description="Leave empty to remove it."
          error={err('phone')}
        >
          <Input
            {...controlProps('phone', { error: err('phone'), description: true })}
            {...register('phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="h-9 font-mono"
          />
        </Field>
        <Field
          id="blood_group"
          label="Blood group"
          description="Shown on the donor list once you donate."
          error={err('blood_group')}
        >
          <NativeSelect
            {...controlProps('blood_group', { error: err('blood_group'), description: true })}
            {...register('blood_group')}
          >
            {profile.blood_group ? null : <option value="">Not set</option>}
            {BLOOD_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </form>
    </Panel>
  );
}
