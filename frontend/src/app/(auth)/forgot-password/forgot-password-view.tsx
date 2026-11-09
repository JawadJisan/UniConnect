'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@uniconnect/shared';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { controlProps, Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { toApiError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { AuthPage } from '../_components/auth-page';
import { EmailText } from '../_components/email-text';
import { emailError } from '../_components/email-error';
import { RESET_FLOW } from '../_components/flow-trail';

const TRAIL_LABEL = 'Password reset';

export function ForgotPasswordView() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit({ email }: ForgotPasswordInput) {
    setFormError(null);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    if (!error) {
      setSentTo(email);
      return;
    }
    const err = toApiError(error);
    setFormError(
      err.status === 429
        ? 'Too many reset requests for this address. Try again in an hour.'
        : err.message,
    );
  }

  if (sentTo) {
    // Same wording whether or not the account exists, as the API's own answer is.
    return (
      <AuthPage
        trail={{ steps: RESET_FLOW, current: 1, done: 1, label: TRAIL_LABEL }}
        title="Check your inbox"
        description={
          <>
            If an account exists for <EmailText email={sentTo} />, we sent it a link to set a new
            password. The link works once, for 1 hour.
          </>
        }
      >
        <div className="flex flex-col gap-1.5 text-sm text-fg-secondary">
          <p>
            Nothing arrived? Check spam, or{' '}
            <button type="button" className="link" onClick={() => setSentTo(null)}>
              try another address
            </button>
            .
          </p>
          <p>
            Remembered it?{' '}
            <Link href="/login" className="link">
              Log in
            </Link>
          </p>
        </div>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      trail={{ steps: RESET_FLOW, current: 0, label: TRAIL_LABEL }}
      title="Reset your password"
      description="Enter the email you registered with and we'll send you a link to set a new password."
    >
      {formError ? <FormAlert tone="error" title={formError} /> : null}

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <Field id="email" label="Email" error={emailError(errors.email)}>
          <Input
            {...controlProps('email', { error: emailError(errors.email) })}
            {...register('email')}
            type="email"
            autoComplete="email"
            className="h-9"
          />
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="text-sm text-fg-secondary">
        Remembered it?{' '}
        <Link href="/login" className="link">
          Log in
        </Link>
      </p>
    </AuthPage>
  );
}
