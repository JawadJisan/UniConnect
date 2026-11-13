'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  FEE_MESSAGE,
  feeSchema,
  type CreateEventBody,
  type EventDetail,
  type UpdateEventBody,
} from '@uniconnect/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form';
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
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { useClubs, useMyClub } from '@/hooks/use-clubs';
import { useDepartments } from '@/hooks/use-departments';
import { useCreateEvent, useUpdateEvent } from '@/hooks/use-events';
import type { ApiError } from '@/lib/api';
import { dhakaInputValue, fromDhakaInput } from '@/lib/events';
import { applyServerError } from '@/lib/server-errors';
import { cn } from '@/lib/utils';
import { Panel } from '../../../_components/panel';
import { useProfile } from '../../../_components/require-session';

const FORM_ID = 'event-form';
const DESCRIPTION_MAX = 5000;

// A datetime-local value: "2026-11-20T14:00".
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const when = (label: string) =>
  z.string().regex(LOCAL_DATETIME, `Choose the ${label} date and time.`);

// Mirrors createEventSchema with the same messages; the form holds strings, which become the
// API's numbers, booleans and ISO times (read as Dhaka time) on submit.
export const eventFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required.')
      .max(200, 'Title must be at most 200 characters.'),
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX, 'Description must be at most 5000 characters.'),
    organizer_club_id: z.string().min(1, 'Choose the organizing club.'),
    visibility: z.enum(['public', 'members_only']),
    start_date: when('start'),
    end_date: when('end'),
    venue: z.string().trim().max(200, 'Venue must be at most 200 characters.'),
    max_attendees: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100000),
        'Capacity must be a whole number from 1 to 100000, or empty for no limit.',
      ),
    is_paid: z.boolean(),
    fee_amount: z.string().trim(),
    // The organizing club's department is added on submit, so none ticked here is fine.
    department_ids: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    if (
      LOCAL_DATETIME.test(v.start_date) &&
      LOCAL_DATETIME.test(v.end_date) &&
      v.end_date <= v.start_date
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'The event must end after it starts.',
      });
    }
    if (v.is_paid) {
      if (v.fee_amount === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['fee_amount'],
          message: 'A paid event needs a fee.',
        });
      } else if (!feeSchema.safeParse(v.fee_amount).success) {
        ctx.addIssue({ code: 'custom', path: ['fee_amount'], message: FEE_MESSAGE });
      }
    }
  });

export type EventFormInput = z.input<typeof eventFormSchema>;
type Values = z.output<typeof eventFormSchema>;

const FIELDS = [
  'title',
  'description',
  'organizer_club_id',
  'visibility',
  'start_date',
  'end_date',
  'venue',
  'max_attendees',
  'is_paid',
  'fee_amount',
  'department_ids',
] as const;
type FieldName = (typeof FIELDS)[number];

export function toFormValues(event: EventDetail): EventFormInput {
  return {
    title: event.title,
    description: event.description ?? '',
    organizer_club_id: String(event.organizer_club.id),
    visibility: event.visibility,
    start_date: dhakaInputValue(event.start_date),
    end_date: dhakaInputValue(event.end_date),
    venue: event.venue ?? '',
    max_attendees: event.max_attendees === null ? '' : String(event.max_attendees),
    is_paid: event.is_paid,
    fee_amount: event.fee_amount ?? '',
    department_ids: event.departments.map((d) => String(d.id)),
  };
}

const EMPTY: EventFormInput = {
  title: '',
  description: '',
  organizer_club_id: '',
  visibility: 'public',
  start_date: '',
  end_date: '',
  venue: '',
  max_attendees: '',
  is_paid: false,
  fee_amount: '',
  department_ids: [],
};

/** The create body: the API's types, with the organizer's department always included. */
export function toCreateBody(v: Values, organizerDepartmentId?: number): CreateEventBody {
  const departments = new Set(v.department_ids.map(Number));
  if (organizerDepartmentId) departments.add(organizerDepartmentId);
  return {
    title: v.title,
    ...(v.description ? { description: v.description } : {}),
    organizer_club_id: Number(v.organizer_club_id),
    visibility: v.visibility,
    is_paid: v.is_paid,
    ...(v.is_paid ? { fee_amount: v.fee_amount } : {}),
    start_date: fromDhakaInput(v.start_date),
    end_date: fromDhakaInput(v.end_date),
    ...(v.venue ? { venue: v.venue } : {}),
    ...(v.max_attendees ? { max_attendees: Number(v.max_attendees) } : {}),
    department_ids: [...departments],
  };
}

/** The update body: changed fields only; an emptied optional field is sent as null. */
export function toUpdateBody(
  v: Values,
  dirty: Partial<Record<FieldName, unknown>>,
  organizerDepartmentId?: number,
): UpdateEventBody {
  const body: Record<string, unknown> = {};
  if (dirty.title) body.title = v.title;
  if (dirty.description) body.description = v.description === '' ? null : v.description;
  if (dirty.visibility) body.visibility = v.visibility;
  if (dirty.start_date) body.start_date = fromDhakaInput(v.start_date);
  if (dirty.end_date) body.end_date = fromDhakaInput(v.end_date);
  if (dirty.venue) body.venue = v.venue === '' ? null : v.venue;
  if (dirty.max_attendees) {
    body.max_attendees = v.max_attendees === '' ? null : Number(v.max_attendees);
  }
  if (dirty.is_paid) body.is_paid = v.is_paid;
  // Turning "paid" off clears the fee on the server; only send a fee for a paid event.
  if ((dirty.fee_amount || dirty.is_paid) && v.is_paid) body.fee_amount = v.fee_amount;
  if (dirty.department_ids) {
    const ids = new Set(v.department_ids.map(Number));
    if (organizerDepartmentId) ids.add(organizerDepartmentId);
    body.department_ids = [...ids];
  }
  return body as UpdateEventBody;
}

// Server codes that belong to one field.
const CODE_FIELD: Partial<Record<string, FieldName>> = {
  UNKNOWN_DEPARTMENT: 'department_ids',
  CAPACITY_BELOW_REGISTRATIONS: 'max_attendees',
};

type EventFormProps = { mode: 'create'; event?: undefined } | { mode: 'edit'; event: EventDetail };

/**
 * Create a draft (FR-EVENT-001) or edit one (FR-EVENT-004). Times are entered in Dhaka time.
 * Once an event is published its dates, visibility and departments are shown but locked.
 */
export function EventForm({ mode, event }: EventFormProps) {
  const router = useRouter();
  const profile = useProfile();
  const superAdmin = profile.role === 'super_admin';
  const clubs = useClubs();
  // Everyone but a super admin organizes for their own department's club (PRD #3).
  const myClub = useMyClub();
  const create = useCreateEvent();
  const update = useUpdateEvent(event?.id ?? 0);
  const departments = useDepartments();
  const [formError, setFormError] = useState<string | null>(null);
  const locked = mode === 'edit' && event.status === 'published';

  const fixedClubId =
    mode === 'edit'
      ? String(event.organizer_club.id)
      : !superAdmin && myClub.data
        ? String(myClub.data.id)
        : '';
  const defaults =
    mode === 'edit' ? toFormValues(event) : { ...EMPTY, organizer_club_id: fixedClubId };

  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, dirtyFields, isDirty, isSubmitting },
  } = useForm<EventFormInput, unknown, Values>({
    resolver: zodResolver(eventFormSchema),
    values: defaults,
    resetOptions: { keepDirtyValues: true },
  });

  const clubId = useWatch({ control, name: 'organizer_club_id' });
  const isPaid = useWatch({ control, name: 'is_paid' });
  const description = useWatch({ control, name: 'description' }) ?? '';
  const club = clubs.data?.data.find((c) => String(c.id) === clubId);
  const organizerDepartmentId =
    club?.department.id ??
    (myClub.data && String(myClub.data.id) === clubId ? myClub.data.department.id : undefined);

  async function onSubmit(values: Values) {
    setFormError(null);
    if (mode === 'create' && new Date(fromDhakaInput(values.start_date)) <= new Date()) {
      setError(
        'start_date',
        { message: 'The start must be in the future.' },
        { shouldFocus: true },
      );
      return;
    }
    try {
      if (mode === 'create') {
        const saved = await create.mutateAsync(toCreateBody(values, organizerDepartmentId));
        toast.success('Draft created. Add a poster, then publish it.');
        router.push(`/dashboard/events/${saved.id}`);
      } else {
        const body = toUpdateBody(
          values,
          dirtyFields as Partial<Record<FieldName, unknown>>,
          organizerDepartmentId,
        );
        if (Object.keys(body).length === 0) return;
        const saved = await update.mutateAsync(body);
        reset(toFormValues(saved));
        toast.success('Event saved.');
      }
    } catch (thrown) {
      const err = thrown as ApiError;
      if (err.status === 403) {
        setFormError(
          "You can't manage events for this club. Only its committee, its department admin or a super admin can.",
        );
      } else if (err.code === 'EVENT_FIELD_LOCKED') {
        setFormError('Dates, visibility and departments are locked once an event is published.');
      } else {
        setFormError(applyServerError(err, setError, FIELDS, CODE_FIELD));
      }
    }
  }

  const err = (name: FieldName) => errors[name]?.message;
  const loadingClub = mode === 'create' && (superAdmin ? clubs.isPending : myClub.isPending);
  const noClub = mode === 'create' && !superAdmin && myClub.isError;

  if (loadingClub) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Loading the form…</span>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (noClub) {
    return (
      <FormAlert tone="error" title="Your department has no club yet.">
        Events are organized by a club. Ask a super admin to set it up.
      </FormAlert>
    );
  }

  return (
    <Panel
      id="event-form-title"
      title={mode === 'create' ? 'Event details' : 'Edit details'}
      tag={mode === 'create' ? 'SYS.EVENT.NEW' : 'SYS.EVENT.EDIT'}
      description={
        mode === 'create'
          ? 'The event is saved as a draft that only organizers can see. Times are Dhaka time.'
          : 'Only changed fields are saved, and every change is audited. Times are Dhaka time.'
      }
      footer={
        <>
          {mode === 'edit' && isDirty ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset(toFormValues(event));
                setFormError(null);
              }}
            >
              Reset
            </Button>
          ) : null}
          <Button
            type="submit"
            form={FORM_ID}
            variant={mode === 'create' || isDirty ? 'default' : 'secondary'}
            disabled={(mode === 'edit' && !isDirty) || isSubmitting}
          >
            {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create draft' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-x-5 gap-y-5 sm:grid-cols-2"
      >
        {formError ? <FormAlert tone="error" title={formError} className="sm:col-span-2" /> : null}
        {locked ? (
          <FormAlert
            tone="info"
            className="sm:col-span-2"
            title="Dates, visibility and departments are locked once an event is published."
          />
        ) : null}

        <Field id="event-title" label="Title" error={err('title')} className="sm:col-span-2">
          <Input
            {...controlProps('event-title', { error: err('title') })}
            {...register('title')}
            maxLength={200}
            className="h-9"
          />
        </Field>

        <Field
          id="event-club"
          label="Organizing club"
          error={err('organizer_club_id')}
          className="sm:col-span-2"
        >
          {superAdmin && mode === 'create' ? (
            <NativeSelect
              {...controlProps('event-club', { error: err('organizer_club_id') })}
              {...register('organizer_club_id')}
            >
              <option value="">Choose a club</option>
              {(clubs.data?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <Input
              id="event-club"
              readOnly
              value={mode === 'edit' ? event.organizer_club.name : (myClub.data?.name ?? '')}
              className="h-9 text-fg-secondary"
            />
          )}
        </Field>

        <Field
          id="event-description"
          label="Description"
          optional
          error={err('description')}
          className="sm:col-span-2"
        >
          <Textarea
            {...controlProps('event-description', { error: err('description') })}
            {...register('description')}
            rows={5}
          />
          <p
            className="self-end font-mono text-xs text-fg-tertiary tabular-nums"
            aria-live="polite"
          >
            {description.length} / {DESCRIPTION_MAX}
          </p>
        </Field>

        <Field id="event-start" label="Starts" error={err('start_date')}>
          <Input
            {...controlProps('event-start', { error: err('start_date') })}
            {...register('start_date')}
            type="datetime-local"
            disabled={locked}
            className="h-9 font-mono"
          />
        </Field>
        <Field id="event-end" label="Ends" error={err('end_date')}>
          <Input
            {...controlProps('event-end', { error: err('end_date') })}
            {...register('end_date')}
            type="datetime-local"
            disabled={locked}
            className="h-9 font-mono"
          />
        </Field>

        <Field id="event-venue" label="Venue" optional error={err('venue')}>
          <Input
            {...controlProps('event-venue', { error: err('venue') })}
            {...register('venue')}
            maxLength={200}
            className="h-9"
          />
        </Field>
        <Field
          id="event-capacity"
          label="Capacity"
          optional
          description="Leave empty for no limit. There is no waiting list."
          error={err('max_attendees')}
        >
          <Input
            {...controlProps('event-capacity', {
              error: err('max_attendees'),
              description: true,
            })}
            {...register('max_attendees')}
            inputMode="numeric"
            className="h-9 font-mono"
          />
        </Field>

        <fieldset className="flex flex-col gap-2 sm:col-span-2" disabled={locked}>
          <legend className="mb-1.5 text-sm font-medium text-foreground">Who can see it</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <VisibilityOption
              value="public"
              title="Public"
              text="Anyone signed in can see it and register."
              register={register('visibility')}
            />
            <VisibilityOption
              value="members_only"
              title="Members only"
              text="Only people from the listed departments with an active club membership."
              register={register('visibility')}
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-3 sm:col-span-2">
          <label className="flex items-center gap-2.5 text-sm font-medium text-foreground">
            <input type="checkbox" {...register('is_paid')} className="size-4 accent-primary" />
            This event has a fee
          </label>
          {isPaid ? (
            <Field
              id="event-fee"
              label="Fee"
              description="Paid at the venue. UniConnect doesn't take payment for events."
              error={err('fee_amount')}
              className="sm:max-w-xs"
            >
              <InputGroup className="h-9">
                <InputGroupAddon>
                  <InputGroupText className="font-mono">৳</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  {...controlProps('event-fee', { error: err('fee_amount'), description: true })}
                  {...register('fee_amount')}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="font-mono"
                />
              </InputGroup>
            </Field>
          ) : null}
        </div>

        <fieldset
          className="flex flex-col gap-2 sm:col-span-2"
          disabled={locked}
          aria-describedby={err('department_ids') ? 'event-departments-error' : undefined}
        >
          <legend className="mb-1.5 text-sm font-medium text-foreground">
            Participating departments
          </legend>
          <p className="text-sm text-fg-tertiary">
            The organizing club&apos;s department is always included.
          </p>
          {departments.isPending ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : (
            <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
              {(departments.data ?? []).map((d) => {
                const own = d.id === organizerDepartmentId;
                return (
                  <li key={d.id}>
                    <label
                      className={cn(
                        'flex min-h-8 items-center gap-2.5 rounded-md px-2 text-sm',
                        own ? 'text-fg-secondary' : 'hover:bg-surface-2',
                      )}
                    >
                      {own ? (
                        <input type="checkbox" checked disabled readOnly className="size-4" />
                      ) : (
                        <input
                          type="checkbox"
                          value={String(d.id)}
                          {...register('department_ids')}
                          className="size-4 accent-primary"
                        />
                      )}
                      {d.name}
                      {own ? (
                        <span className="text-xs text-fg-tertiary">Always included</span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {err('department_ids') ? (
            <p id="event-departments-error" className="text-sm text-destructive">
              {err('department_ids')}
            </p>
          ) : null}
        </fieldset>
      </form>
    </Panel>
  );
}

function VisibilityOption({
  value,
  title,
  text,
  register,
}: {
  value: 'public' | 'members_only';
  title: string;
  text: string;
  register: UseFormRegisterReturn<'visibility'>;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm has-checked:border-brand has-checked:bg-brand-tint has-disabled:cursor-not-allowed has-disabled:opacity-60">
      <input type="radio" value={value} {...register} className="mt-0.5 size-4 accent-primary" />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-fg-secondary">{text}</span>
      </span>
    </label>
  );
}
