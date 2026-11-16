'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema, type ChangePasswordInput } from '@uniconnect/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { controlProps, Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { toast } from '@/components/ui/sonner';
import { describePassword, PASSWORD_HINT } from '@/components/password/password-hint';
import { PasswordInput } from '@/components/password/password-input';
import { useChangePassword } from '@/hooks/use-me';
import type { ApiError } from '@/lib/api';
import { Panel } from '../../../_components/panel';

const FORM_ID = 'password-form';
const EMPTY: ChangePasswordInput = { currentPassword: '', newPassword: '', confirmPassword: '' };

/** Better Auth's change-password. The server always signs out the user's other sessions. */
export function PasswordForm() {
  const change = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
  });

  async function onSubmit(values: ChangePasswordInput) {
    setFormError(null);
    try {
      await change.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      reset(EMPTY);
      toast.success('Password changed.', {
        description: 'Other devices were signed out. This one stays signed in.',
      });
    } catch (thrown) {
      const err = thrown as ApiError;
      if (err.code === 'INVALID_PASSWORD') {
        setError(
          'currentPassword',
          { message: "That isn't your current password." },
          { shouldFocus: true },
        );
      } else if (err.code === 'PASSWORD_TOO_WEAK') {
        setError('newPassword', { type: 'server' }, { shouldFocus: true });
      } else if (err.status === 429) {
        setFormError('Too many attempts. Wait a minute, then try again.');
      } else if (err.status === 401) {
        setFormError('Your session ended. Log in again to change your password.');
      } else {
        setFormError(err.status >= 500 ? "Couldn't change it right now. Try again." : err.message);
      }
    }
  }

  // Say exactly what a rejected new password lacks, as the auth pages do.
  const newError = errors.newPassword
    ? errors.newPassword.message && errors.newPassword.type === 'custom'
      ? errors.newPassword.message
      : describePassword(getValues('newPassword'))
    : undefined;

  return (
    <Panel
      id="password-title"
      title="Password"
      tag="SYS.PROFILE.SECURITY"
      description="Changing it signs you out everywhere else."
      footer={
        <Button type="submit" form={FORM_ID} variant="secondary" disabled={isSubmitting}>
          {isSubmitting ? 'Changing…' : 'Change password'}
        </Button>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        {formError ? <FormAlert tone="error" title={formError} /> : null}
        {/* Lets password managers attach the change to the right account. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <Field
          id="currentPassword"
          label="Current password"
          error={errors.currentPassword?.message}
        >
          <PasswordInput
            {...controlProps('currentPassword', { error: errors.currentPassword?.message })}
            {...register('currentPassword')}
            autoComplete="current-password"
          />
        </Field>
        <Field id="newPassword" label="New password" description={PASSWORD_HINT} error={newError}>
          <PasswordInput
            {...controlProps('newPassword', { error: newError, description: true })}
            {...register('newPassword')}
            autoComplete="new-password"
          />
        </Field>
        <Field
          id="confirmPassword"
          label="Confirm new password"
          error={errors.confirmPassword?.message}
        >
          <PasswordInput
            {...controlProps('confirmPassword', { error: errors.confirmPassword?.message })}
            {...register('confirmPassword')}
            autoComplete="new-password"
          />
        </Field>
      </form>
    </Panel>
  );
}
