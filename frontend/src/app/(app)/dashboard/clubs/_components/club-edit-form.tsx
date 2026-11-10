'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FEE_MESSAGE, feeSchema, type ClubDetail, type UpdateClubBody } from '@uniconnect/shared';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { controlProps, Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateClub } from '@/hooks/use-clubs';
import type { ApiError } from '@/lib/api';
import { Panel } from '../../../_components/panel';
import { applyServerError } from '../../profile/_components/server-errors';

const FORM_ID = 'club-edit-form';

// A fee field: empty (clears the fee) or an amount the shared feeSchema accepts, normalized to
// its 2-decimal string. Checked as one string so the error names the fee rule, not "Invalid".
const feeField = z
  .string()
  .trim()
  .refine((v) => v === '' || feeSchema.safeParse(v).success, FEE_MESSAGE)
  .transform((v) => (v === '' ? '' : feeSchema.parse(v)));

// Mirrors updateClubSchema; the form holds strings, and an empty fee or description clears it.
const formSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  description: z.string().trim().max(2000, 'Keep the description under 2000 characters.'),
  membership_fee_monthly: feeField,
  membership_fee_yearly: feeField,
});

type FormInput = z.input<typeof formSchema>;
type Values = z.output<typeof formSchema>;
const FIELDS = ['name', 'description', 'membership_fee_monthly', 'membership_fee_yearly'] as const;

function toValues(club: ClubDetail): FormInput {
  return {
    name: club.name,
    description: club.description ?? '',
    membership_fee_monthly: club.membership_fee_monthly ?? '',
    membership_fee_yearly: club.membership_fee_yearly ?? '',
  };
}

/**
 * Name, description and fees (PRD FR-CLUB-003). Only changed fields are sent, and every change
 * is audited with its old and new value. Rendered only for the club's editors.
 */
export function ClubEditForm({ club }: { club: ClubDetail }) {
  const update = useUpdateClub(club.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, dirtyFields, isDirty, isSubmitting },
  } = useForm<FormInput, unknown, Values>({
    resolver: zodResolver(formSchema),
    defaultValues: toValues(club),
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const body: Record<string, unknown> = {};
    for (const field of FIELDS) {
      if (!dirtyFields[field]) continue;
      const value = values[field];
      body[field] = field !== 'name' && value === '' ? null : value;
    }
    if (Object.keys(body).length === 0) return;

    try {
      const saved = await update.mutateAsync(body as UpdateClubBody);
      reset(toValues(saved));
      toast.success('Club details saved.');
    } catch (thrown) {
      const err = thrown as ApiError;
      if (err.status === 403) {
        setFormError("You can't edit this club. Only its department admin or a super admin can.");
      } else if (err.status === 404) {
        setFormError("This club doesn't exist any more.");
      } else {
        setFormError(applyServerError(err, setError, FIELDS));
      }
    }
  }

  const err = (name: (typeof FIELDS)[number]) => errors[name]?.message;

  return (
    <Panel
      id="club-edit-title"
      title="Details & fees"
      tag="SYS.CLUB.EDIT"
      description="Members see these on the club page. Every change is audited."
      footer={
        <>
          {isDirty ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset(toValues(club));
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
            {isSubmitting ? 'Saving…' : 'Save club'}
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
        <Field id="club-name" label="Club name" error={err('name')} className="sm:col-span-2">
          <Input
            {...controlProps('club-name', { error: err('name') })}
            {...register('name')}
            className="h-9"
          />
        </Field>
        <Field
          id="club-description"
          label="Description"
          optional
          error={err('description')}
          className="sm:col-span-2"
        >
          <Textarea
            {...controlProps('club-description', { error: err('description') })}
            {...register('description')}
            rows={3}
          />
        </Field>
        <FeeField id="club-fee-monthly" label="Monthly fee" error={err('membership_fee_monthly')}>
          <InputGroupInput
            {...controlProps('club-fee-monthly', {
              error: err('membership_fee_monthly'),
              description: true,
            })}
            {...register('membership_fee_monthly')}
            inputMode="decimal"
            placeholder="0.00"
            className="font-mono"
          />
        </FeeField>
        <FeeField id="club-fee-yearly" label="Yearly fee" error={err('membership_fee_yearly')}>
          <InputGroupInput
            {...controlProps('club-fee-yearly', {
              error: err('membership_fee_yearly'),
              description: true,
            })}
            {...register('membership_fee_yearly')}
            inputMode="decimal"
            placeholder="0.00"
            className="font-mono"
          />
        </FeeField>
      </form>
    </Panel>
  );
}

function FeeField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <Field
      id={id}
      label={label}
      optional
      description="In BDT. Leave empty if not set."
      error={error}
    >
      <InputGroup className="h-9">
        <InputGroupAddon>
          <InputGroupText className="font-mono">৳</InputGroupText>
        </InputGroupAddon>
        {children}
      </InputGroup>
    </Field>
  );
}
