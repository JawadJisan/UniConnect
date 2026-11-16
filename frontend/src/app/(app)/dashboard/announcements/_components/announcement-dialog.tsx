'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ANNOUNCEMENT_CONTENT_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  createAnnouncementSchema,
  type Announcement,
  type CreateAnnouncementBody,
  type UpdateAnnouncementBody,
} from '@uniconnect/shared';
import { useId, useState } from 'react';
import { useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form';
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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { useCreateAnnouncement, useUpdateAnnouncement } from '@/hooks/use-announcements';
import { useClubs, useMyClub } from '@/hooks/use-clubs';
import { useDepartments } from '@/hooks/use-departments';
import { canPinRole, createScopeOptions, scopeLabel, type ScopeOptions } from '@/lib/announcements';
import type { ApiError } from '@/lib/api';
import { applyServerError } from '@/lib/server-errors';
import { useProfile } from '../../../_components/require-session';

const FORM_ID = 'announcement-form';

// Title and content reuse the API's rules and messages; the scope is a kind plus an id here,
// which becomes exactly one of club_id / department_id on submit (D38).
const { title, content } = createAnnouncementSchema.shape;

export const announcementFormSchema = z
  .object({
    title,
    content,
    kind: z.enum(['club', 'department']),
    target: z.string(),
    is_pinned: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.target === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['target'],
        message: v.kind === 'club' ? 'Choose a club.' : 'Choose a department.',
      });
    }
  });

type FormInput = z.input<typeof announcementFormSchema>;
type Values = z.output<typeof announcementFormSchema>;
const FIELDS = ['title', 'content', 'target'] as const;

// Server codes that belong to one field.
const CODE_FIELD: Partial<Record<string, (typeof FIELDS)[number]>> = {
  CLUB_NOT_FOUND: 'target',
  DEPARTMENT_NOT_FOUND: 'target',
};

/** The create body: exactly one scope, and is_pinned only when the caller may pin. */
export function toCreateBody(v: Values, mayPin: boolean): CreateAnnouncementBody {
  return {
    title: v.title,
    content: v.content,
    ...(v.kind === 'club' ? { club_id: Number(v.target) } : { department_id: Number(v.target) }),
    ...(mayPin && v.is_pinned ? { is_pinned: true } : {}),
  };
}

/** The first scope the options allow: a department when there is one, else a club. */
function defaultsFor(options: ScopeOptions): FormInput {
  const kind = options.departments.length > 0 ? 'department' : 'club';
  const list = kind === 'department' ? options.departments : options.clubs;
  return {
    title: '',
    content: '',
    kind,
    target: list.length === 1 ? String(list[0]!.id) : '',
    is_pinned: false,
  };
}

type DialogProps = { onClose: () => void } & (
  { mode: 'create'; announcement?: undefined } | { mode: 'edit'; announcement: Announcement }
);

/** Post an announcement (FR-ANNOUNCE-001) or edit one (FR-ANNOUNCE-003). */
export function AnnouncementDialog(props: DialogProps) {
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : props.onClose())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {props.mode === 'create' ? 'New announcement' : 'Edit announcement'}
          </DialogTitle>
          <DialogDescription>
            {props.mode === 'create'
              ? 'It is published at once to everyone who can see its club or department.'
              : "Only the title and text can change. The audience can't change after posting."}
          </DialogDescription>
        </DialogHeader>
        {props.mode === 'create' ? (
          <CreateBody onClose={props.onClose} />
        ) : (
          <EditForm announcement={props.announcement} onClose={props.onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Loads what the scope control needs for this role, then shows the form. */
function CreateBody({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const superAdmin = profile.role === 'super_admin';
  const myClub = useMyClub();
  const clubs = useClubs();
  const departments = useDepartments();

  const loading = superAdmin ? clubs.isPending || departments.isPending : myClub.isPending;
  if (loading) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Loading the form…</span>
        <Skeleton className="h-9 rounded-md" />
        <Skeleton className="h-32 rounded-md" />
      </div>
    );
  }

  const options = createScopeOptions({
    role: profile.role,
    department: profile.department,
    myClub: myClub.data ? { id: myClub.data.id, name: myClub.data.name } : null,
    clubs: (clubs.data?.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    departments: (departments.data ?? []).map((d) => ({ id: d.id, name: d.name })),
  });
  if (options.clubs.length === 0 && options.departments.length === 0) {
    return (
      <FormAlert tone="error" title="There's nowhere you can post yet.">
        Your department has no club yet. Ask a super admin to set it up.
      </FormAlert>
    );
  }
  return <CreateForm options={options} onClose={onClose} />;
}

function CreateForm({ options, onClose }: { options: ScopeOptions; onClose: () => void }) {
  const profile = useProfile();
  const mayPin = canPinRole(profile.role);
  const create = useCreateAnnouncement();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, Values>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: defaultsFor(options),
  });
  const kind = useWatch({ control, name: 'kind' });
  const contentLength = (useWatch({ control, name: 'content' }) ?? '').length;

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await create.mutateAsync(toCreateBody(values, mayPin));
      toast.success('Announcement posted.');
      onClose();
    } catch (thrown) {
      const err = thrown as ApiError;
      setFormError(
        err.status === 403 ? err.message : applyServerError(err, setError, FIELDS, CODE_FIELD),
      );
    }
  }

  const fixed = options.departments.length === 0 && options.clubs.length === 1;
  const list = kind === 'department' ? options.departments : options.clubs;

  return (
    <>
      <form
        id={FORM_ID}
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
      >
        {formError ? <FormAlert tone="error" title={formError} /> : null}
        <TextFields register={register} errors={errors} contentLength={contentLength} />

        {fixed ? (
          <p className="text-sm text-fg-secondary">
            Posting to <span className="font-medium text-foreground">{options.clubs[0]!.name}</span>
            . Its members, committee and department admin will see it.
          </p>
        ) : (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1.5 text-sm font-medium text-foreground">Who sees it</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {options.departments.length > 0 ? (
                <ScopeOption
                  value="department"
                  title={
                    options.departments.length === 1
                      ? `Department · ${options.departments[0]!.name}`
                      : 'A department'
                  }
                  text="Everyone in the department."
                  register={register('kind', {
                    onChange: () =>
                      setValue(
                        'target',
                        options.departments.length === 1 ? String(options.departments[0]!.id) : '',
                      ),
                  })}
                />
              ) : null}
              {options.clubs.length > 0 ? (
                <ScopeOption
                  value="club"
                  title={options.clubs.length === 1 ? `Club · ${options.clubs[0]!.name}` : 'A club'}
                  text="Active members, the committee and the department admin."
                  register={register('kind', {
                    onChange: () =>
                      setValue(
                        'target',
                        options.clubs.length === 1 ? String(options.clubs[0]!.id) : '',
                      ),
                  })}
                />
              ) : null}
            </div>
            {list.length > 1 ? (
              <Field
                id="announcement-target"
                label={kind === 'department' ? 'Department' : 'Club'}
                error={errors.target?.message}
              >
                <NativeSelect
                  {...controlProps('announcement-target', { error: errors.target?.message })}
                  {...register('target')}
                >
                  <option value="">
                    {kind === 'department' ? 'Choose a department' : 'Choose a club'}
                  </option>
                  {list.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : errors.target ? (
              <p className="text-sm text-destructive">{errors.target.message}</p>
            ) : null}
          </fieldset>
        )}

        {mayPin ? (
          <label className="flex items-center gap-2.5 text-sm font-medium text-foreground">
            <input type="checkbox" {...register('is_pinned')} className="size-4 accent-primary" />
            Pin to the top
          </label>
        ) : null}
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
          {isSubmitting ? 'Posting…' : 'Post announcement'}
        </Button>
      </DialogFooter>
    </>
  );
}

const editSchema = z.object({ title, content });
type EditInput = z.input<typeof editSchema>;
type EditValues = z.output<typeof editSchema>;

function EditForm({
  announcement: a,
  onClose,
}: {
  announcement: Announcement;
  onClose: () => void;
}) {
  const update = useUpdateAnnouncement(a.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, dirtyFields, isDirty, isSubmitting },
  } = useForm<EditInput, unknown, EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { title: a.title, content: a.content },
  });
  const contentLength = (useWatch({ control, name: 'content' }) ?? '').length;

  async function onSubmit(values: EditValues) {
    setFormError(null);
    const body: UpdateAnnouncementBody = {};
    if (dirtyFields.title) body.title = values.title;
    if (dirtyFields.content) body.content = values.content;
    if (Object.keys(body).length === 0) return onClose();
    try {
      await update.mutateAsync(body);
      toast.success('Announcement updated.');
      onClose();
    } catch (thrown) {
      const err = thrown as ApiError;
      setFormError(
        err.status === 403 || err.status === 404
          ? err.message
          : applyServerError(err, setError, ['title', 'content']),
      );
    }
  }

  return (
    <>
      <form
        id={FORM_ID}
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
      >
        {formError ? <FormAlert tone="error" title={formError} /> : null}
        <TextFields register={register} errors={errors} contentLength={contentLength} />
        <p className="text-sm text-fg-tertiary">
          Audience: <span className="font-mono text-fg-secondary">{scopeLabel(a)}</span>. The
          audience can&apos;t change after posting.
        </p>
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          form={FORM_ID}
          variant={isDirty ? 'default' : 'secondary'}
          disabled={!isDirty || isSubmitting}
        >
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Title and content, shared by both forms. */
function TextFields({
  register,
  errors,
  contentLength,
}: {
  // Both forms have title and content; this narrower type fits either form's register.
  register: (name: 'title' | 'content') => UseFormRegisterReturn;
  errors: Partial<Record<'title' | 'content', { message?: string }>>;
  contentLength: number;
}) {
  const id = useId();
  return (
    <>
      <Field id={`${id}-title`} label="Title" error={errors.title?.message}>
        <Input
          {...controlProps(`${id}-title`, { error: errors.title?.message })}
          {...register('title')}
          maxLength={ANNOUNCEMENT_TITLE_MAX}
          className="h-9"
        />
      </Field>
      <Field id={`${id}-content`} label="Announcement" error={errors.content?.message}>
        <Textarea
          {...controlProps(`${id}-content`, { error: errors.content?.message })}
          {...register('content')}
          rows={7}
        />
        <p className="self-end font-mono text-xs text-fg-tertiary tabular-nums" aria-live="polite">
          {contentLength.toLocaleString('en')} / {ANNOUNCEMENT_CONTENT_MAX.toLocaleString('en')}
        </p>
      </Field>
    </>
  );
}

function ScopeOption({
  value,
  title,
  text,
  register,
}: {
  value: 'club' | 'department';
  title: string;
  text: string;
  register: UseFormRegisterReturn<'kind'>;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm has-checked:border-brand has-checked:bg-brand-tint">
      <input type="radio" value={value} {...register} className="mt-0.5 size-4 accent-primary" />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-fg-secondary">{text}</span>
      </span>
    </label>
  );
}
