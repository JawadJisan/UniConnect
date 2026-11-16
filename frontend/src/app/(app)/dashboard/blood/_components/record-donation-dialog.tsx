'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  BLOOD_NOTES_MAX,
  createDonationSchema,
  DONATION_UNITS_MAX,
  isoDateSchema,
} from '@uniconnect/shared';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { BloodGroupBadge } from '@/components/blood-badges';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { useRecordDonation } from '@/hooks/use-blood';
import type { ApiError } from '@/lib/api';
import { todayInDhaka } from '@/lib/blood';
import { applyServerError } from '@/lib/server-errors';
import { useProfile } from '../../../_components/require-session';

const FORM_ID = 'record-donation-form';

/** The API's message for a future date (FR-BLOOD-001), checked here first in Dhaka time. */
export const DONATION_FUTURE = 'The donation date cannot be in the future.';

export const donationFormSchema = createDonationSchema.extend({
  donation_date: isoDateSchema.refine((v) => v <= todayInDhaka(), DONATION_FUTURE),
});

type FormInput = z.input<typeof donationFormSchema>;
type Values = z.output<typeof donationFormSchema>;
const FIELDS = ['donation_date', 'units', 'hospital_name', 'notes'] as const;
const CODE_FIELD = { DONATION_DATE_FUTURE: 'donation_date' } as const;

/** FR-BLOOD-001: the record starts unverified; the blood group comes from the profile. */
export function RecordDonationDialog({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Record donation</DialogTitle>
            <span className="micro-label">SYS.BLOOD.DONATE</span>
          </div>
          <DialogDescription>
            It counts once an admin in your department verifies it. Recording a donation also lists
            you in the donor directory, with your profile phone number.
          </DialogDescription>
        </DialogHeader>
        {profile.blood_group ? (
          <DonationForm bloodGroup={profile.blood_group} onClose={onClose} />
        ) : (
          <FormAlert tone="info" title="Add your blood group first.">
            Donations use the blood group on your profile.
            <Link
              href="/dashboard/profile"
              className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
            >
              Open profile
            </Link>
          </FormAlert>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DonationForm({ bloodGroup, onClose }: { bloodGroup: string; onClose: () => void }) {
  const record = useRecordDonation();
  const [formError, setFormError] = useState<string | null>(null);
  const today = todayInDhaka();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, Values>({
    resolver: zodResolver(donationFormSchema),
    defaultValues: { donation_date: today, units: 1, hospital_name: '', notes: '' },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await record.mutateAsync(values);
      toast.success('Donation recorded. It counts once an admin verifies it.');
      onClose();
    } catch (thrown) {
      setFormError(applyServerError(thrown as ApiError, setError, FIELDS, CODE_FIELD));
    }
  }

  const err = (k: (typeof FIELDS)[number]) => errors[k]?.message;

  return (
    <>
      <form
        id={FORM_ID}
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        {formError ? <FormAlert tone="error" title={formError} /> : null}
        <div className="flex items-center gap-2.5 text-sm">
          <BloodGroupBadge group={bloodGroup} />
          <span className="text-fg-tertiary">From your profile</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="rd-date" label="Donation date" error={err('donation_date')}>
            <Input
              {...controlProps('rd-date', { error: err('donation_date') })}
              type="date"
              max={today}
              className="font-mono"
              {...register('donation_date')}
            />
          </Field>
          <Field id="rd-units" label="Units" error={err('units')}>
            <Input
              {...controlProps('rd-units', { error: err('units') })}
              type="number"
              inputMode="numeric"
              min={1}
              max={DONATION_UNITS_MAX}
              className="font-mono"
              {...register('units')}
            />
          </Field>
        </div>
        <Field
          id="rd-hospital"
          label="Hospital or blood bank"
          optional
          error={err('hospital_name')}
        >
          <Input
            {...controlProps('rd-hospital', { error: err('hospital_name') })}
            {...register('hospital_name')}
          />
        </Field>
        <Field id="rd-notes" label="Notes" optional error={err('notes')}>
          <Textarea
            {...controlProps('rd-notes', { error: err('notes') })}
            rows={3}
            maxLength={BLOOD_NOTES_MAX}
            {...register('notes')}
          />
        </Field>
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Record donation'}
        </Button>
      </DialogFooter>
    </>
  );
}
