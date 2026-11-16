'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordInput } from '@uniconnect/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, buttonVariants } from '@/components/ui/button';
import { controlProps, Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { toApiError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { AuthPage } from '../_components/auth-page';
import { RESET_FLOW } from '../_components/flow-trail';
import { describePassword, PASSWORD_HINT } from '@/components/password/password-hint';
import { PasswordInput } from '@/components/password/password-input';

// Holding a token means the link was requested and opened.
const TRAIL = { steps: RESET_FLOW, current: 2, done: 2, label: 'Password reset' };
// A dead link sends the visitor back to the first step, with nothing ticked.
const RESTART = { steps: RESET_FLOW, current: 0, label: 'Password reset' };

function InvalidLink() {
  return (
    <AuthPage
      trail={RESTART}
      title="This reset link doesn't work"
      description="Reset links work once, for 1 hour. Ask for a new one and use the latest email."
    >
      <Link href="/forgot-password" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
        Get a new link
      </Link>
    </AuthPage>
  );
}

export function ResetPasswordView() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const [invalid, setInvalid] = useState(Boolean(params.get('error')) || !token);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  if (invalid || !token) return <InvalidLink />;

  async function onSubmit({ newPassword }: ResetPasswordInput) {
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword, token: token! });
    if (!error) {
      router.replace('/login?reset=success');
      return;
    }
    const err = toApiError(error);
    if (err.code === 'INVALID_TOKEN') setInvalid(true);
    else if (err.code === 'PASSWORD_TOO_WEAK')
      setError('newPassword', { message: err.message }, { shouldFocus: true });
    else if (err.status === 429) setFormError('Too many attempts. Try again in an hour.');
    else setFormError(err.message);
  }

  const newError = errors.newPassword ? describePassword(getValues('newPassword')) : undefined;
  const confirmError = errors.confirmPassword?.message;

  return (
    <AuthPage
      trail={TRAIL}
      title="Set a new password"
      description="You'll be signed out everywhere else, then you can log in with it."
    >
      {formError ? <FormAlert tone="error" title={formError} /> : null}

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <Field id="newPassword" label="New password" description={PASSWORD_HINT} error={newError}>
          <PasswordInput
            {...controlProps('newPassword', { error: newError, description: true })}
            {...register('newPassword')}
            autoComplete="new-password"
          />
        </Field>
        <Field id="confirmPassword" label="Confirm new password" error={confirmError}>
          <PasswordInput
            {...controlProps('confirmPassword', { error: confirmError })}
            {...register('confirmPassword')}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthPage>
  );
}
