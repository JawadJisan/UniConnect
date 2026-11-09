'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@uniconnect/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { controlProps, Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { toApiError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/safe-next';
import { AuthPage } from '../_components/auth-page';
import { emailError } from '../_components/email-error';
import { SIGN_UP_FLOW } from '../_components/flow-trail';
import { PasswordInput } from '@/components/password/password-input';
import { ResendVerification } from '../_components/resend-verification';

type Problem =
  { kind: 'unverified'; email: string } | { kind: 'message'; title: string; body?: string };

/** Notices from the verification and reset redirects (?verified=true, ?error=..., ?reset=...). */
function arrivalNotice(params: URLSearchParams) {
  const error = params.get('error');
  if (error === 'TOKEN_EXPIRED') {
    return {
      tone: 'error' as const,
      title: 'That verification link has expired.',
      body: 'Links last 24 hours. Enter your email below and log in to get a new one.',
    };
  }
  if (error) {
    return {
      tone: 'error' as const,
      title: "That verification link isn't valid.",
      body: 'It may have been copied incompletely. Log in below to get a new one.',
    };
  }
  if (params.get('verified') === 'true') {
    return {
      tone: 'success' as const,
      title: 'Email confirmed.',
      body: 'Log in to continue.',
    };
  }
  if (params.get('reset') === 'success') {
    return {
      tone: 'success' as const,
      title: 'Password updated.',
      body: 'Log in with your new password. Other devices were signed out.',
    };
  }
  return null;
}

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const notice = arrivalNotice(params);
  const [problem, setProblem] = useState<Problem | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setProblem(null);
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (!error) {
      // Back to the page that sent them here (?next=), or the dashboard.
      router.replace(safeNext(params.get('next')));
      router.refresh();
      return;
    }

    const err = toApiError(error);
    if (err.code === 'EMAIL_NOT_VERIFIED') {
      setProblem({ kind: 'unverified', email: values.email });
    } else if (err.code === 'INVALID_EMAIL_OR_PASSWORD') {
      setProblem({
        kind: 'message',
        title: 'Email or password is incorrect.',
        body: 'Check both and try again, or reset your password.',
      });
    } else if (err.code === 'ACCOUNT_SUSPENDED') {
      setProblem({
        kind: 'message',
        title: 'This account is suspended.',
        body: 'Contact your department admin to restore access.',
      });
    } else if (err.status === 429) {
      setProblem({
        kind: 'message',
        title: 'Too many attempts.',
        body: 'Wait a minute, then try again.',
      });
    } else {
      setProblem({ kind: 'message', title: err.message });
    }
  }

  return (
    <AuthPage
      trail={{
        steps: SIGN_UP_FLOW,
        // Unverified: the visitor is back on the verify step. After ?verified=true: two done.
        current: problem?.kind === 'unverified' ? 1 : 2,
        done:
          problem?.kind === 'unverified'
            ? 1
            : params.get('verified') === 'true' && !params.get('error')
              ? 2
              : 0,
        label: 'Account setup',
      }}
      title="Log in"
      description="Use the email and password you registered with."
    >
      {notice && !problem ? (
        <FormAlert tone={notice.tone} title={notice.title}>
          {notice.body}
        </FormAlert>
      ) : null}

      {problem?.kind === 'unverified' ? (
        <FormAlert tone="info" title="Confirm your email first.">
          <p>We sent a link to {problem.email} when you registered. Open it, then log in.</p>
          <ResendVerification email={problem.email} variant="outline" className="mt-3" />
        </FormAlert>
      ) : problem ? (
        <FormAlert tone="error" title={problem.title}>
          {problem.body}
        </FormAlert>
      ) : null}

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
        <Field id="password" label="Password" error={errors.password?.message}>
          <PasswordInput
            {...controlProps('password', { error: errors.password?.message })}
            {...register('password')}
            autoComplete="current-password"
          />
        </Field>
        <Link href="/forgot-password" className="link -mt-2 self-start text-sm">
          Forgot your password?
        </Link>
        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <p className="text-sm text-fg-secondary">
        New to UniConnect?{' '}
        <Link href="/register" className="link">
          Create an account
        </Link>
      </p>
    </AuthPage>
  );
}
