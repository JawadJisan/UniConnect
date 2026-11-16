'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  BLOOD_GROUPS,
  BLOOD_NOTES_MAX,
  createBloodRequestSchema,
  isoDateSchema,
  REQUEST_UNITS_MAX,
} from '@uniconnect/shared';
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
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { useCreateBloodRequest } from '@/hooks/use-blood';
import type { ApiError } from '@/lib/api';
import { formatBloodGroup, todayInDhaka } from '@/lib/blood';
import { applyServerError } from '@/lib/server-errors';
import { useProfile } from '../../../_components/require-session';

const FORM_ID = 'blood-request-form';

/** The API's message for a past date (D40), checked here first against Dhaka's today. */
export const REQUIRED_BY_PAST = 'The required-by date must be today or later.';

/** The shared schema, plus the today-or-later rule the API applies in Asia/Dhaka. */
export const bloodRequestFormSchema = createBloodRequestSchema.extend({
  // The same set as the API, with a message that names the fix for an empty select.
  blood_group: z.enum(BLOOD_GROUPS, 'Choose a blood group.'),
  // On the field, so it shows together with the other errors.
  required_by_date: isoDateSchema.refine((v) => v >= todayInDhaka(), REQUIRED_BY_PAST),
});

type FormInput = z.input<typeof bloodRequestFormSchema>;
type Values = z.output<typeof bloodRequestFormSchema>;

const FIELDS = [
  'patient_name',
  'blood_group',
  'units_needed',
  'reason',
  'contact_phone',
  'hospital_name',
  'required_by_date',
] as const;
const CODE_FIELD = { REQUIRED_BY_DATE_PAST: 'required_by_date' } as const;

/** FR-BLOOD-005: any signed-in user posts a request. No donor is emailed in V1 (PRD #15). */
export function BloodRequestDialog({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const create = useCreateBloodRequest();
  const [formError, setFormError] = useState<string | null>(null);
  const today = todayInDhaka();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, Values>({
    resolver: zodResolver(bloodRequestFormSchema),
    defaultValues: {
      patient_name: '',
      blood_group: '' as FormInput['blood_group'],
      units_needed: 1,
      reason: '',
      contact_phone: profile.phone ?? '',
      hospital_name: '',
      required_by_date: today,
    },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await create.mutateAsync(values);
      toast.success('Blood request posted.');
      onClose();
    } catch (thrown) {
      setFormError(applyServerError(thrown as ApiError, setError, FIELDS, CODE_FIELD));
    }
  }

  const err = (k: (typeof FIELDS)[number]) => errors[k]?.message;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>New blood request</DialogTitle>
            <span className="micro-label">SYS.BLOOD.REQUEST</span>
          </div>
          <DialogDescription>
            Everyone signed in sees it, with the contact number you give. Donors aren&apos;t
            notified automatically, so share the request too.
          </DialogDescription>
        </DialogHeader>
        <form
          id={FORM_ID}
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          {formError ? <FormAlert tone="error" title={formError} /> : null}
          <Field id="br-patient" label="Patient name" error={err('patient_name')}>
            <Input
              {...controlProps('br-patient', { error: err('patient_name') })}
              autoComplete="off"
              {...register('patient_name')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="br-group" label="Blood group" error={err('blood_group')}>
              <NativeSelect
                {...controlProps('br-group', { error: err('blood_group') })}
                {...register('blood_group')}
              >
                <option value="">Choose a group</option>
                {BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {formatBloodGroup(g)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="br-units" label="Units needed" error={err('units_needed')}>
              <Input
                {...controlProps('br-units', { error: err('units_needed') })}
                type="number"
                inputMode="numeric"
                min={1}
                max={REQUEST_UNITS_MAX}
                className="font-mono"
                {...register('units_needed')}
              />
            </Field>
          </div>
          <Field id="br-hospital" label="Hospital" error={err('hospital_name')}>
            <Input
              {...controlProps('br-hospital', { error: err('hospital_name') })}
              {...register('hospital_name')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="br-phone" label="Contact phone" error={err('contact_phone')}>
              <Input
                {...controlProps('br-phone', { error: err('contact_phone') })}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="font-mono"
                {...register('contact_phone')}
              />
            </Field>
            <Field id="br-date" label="Needed by" error={err('required_by_date')}>
              <Input
                {...controlProps('br-date', { error: err('required_by_date') })}
                type="date"
                min={today}
                className="font-mono"
                {...register('required_by_date')}
              />
            </Field>
          </div>
          <Field id="br-reason" label="Reason" optional error={err('reason')}>
            <Textarea
              {...controlProps('br-reason', { error: err('reason') })}
              rows={3}
              maxLength={BLOOD_NOTES_MAX}
              {...register('reason')}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
            {isSubmitting ? 'Posting…' : 'Post request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
