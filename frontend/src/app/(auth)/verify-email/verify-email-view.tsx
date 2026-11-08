'use client';

import { emailSchema } from '@uniconnect/shared';
import { MailIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { controlProps, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AuthPage } from '../_components/auth-page';
import { EmailText } from '../_components/email-text';
import { SIGN_UP_FLOW } from '../_components/flow-trail';
import { ResendVerification } from '../_components/resend-verification';

/** Lets someone who arrived without ?email= say which address to resend to. */
function AddressForm({ onAddress }: { onAddress: (email: string) => void }) {
  const [error, setError] = useState<string>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('email');
    const parsed = emailSchema.safeParse(value);
    if (!parsed.success) {
      setError('Enter the email you registered with.');
      return;
    }
    onAddress(parsed.data);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Field id="email" label="Email you registered with" error={error}>
        <Input
          {...controlProps('email', { error })}
          name="email"
          type="email"
          autoComplete="email"
          className="h-9"
        />
      </Field>
      <Button type="submit" size="lg" className="w-full">
        Continue
      </Button>
    </form>
  );
}

export function VerifyEmailView() {
  const params = useSearchParams();
  const fromUrl = emailSchema.safeParse(params.get('email') ?? '');
  const [email, setEmail] = useState(fromUrl.success ? fromUrl.data : null);

  return (
    <AuthPage
      // Arriving with ?email= means registration just succeeded.
      trail={{
        steps: SIGN_UP_FLOW,
        current: 1,
        done: fromUrl.success ? 1 : 0,
        label: 'Account setup',
      }}
      title="Check your inbox"
      description={
        email ? (
          <>
            We sent a confirmation link to <EmailText email={email} />. It works for 24 hours.
          </>
        ) : (
          'Enter your email to get a new confirmation link.'
        )
      }
    >
      {email ? (
        <>
          <ol className="flex flex-col gap-3 text-md text-fg-secondary">
            <li className="flex gap-3">
              <MailIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-brand-text" />
              <span>Open the email from UniConnect and select the confirmation link.</span>
            </li>
            <li className="pl-7">The link brings you to the login page.</li>
          </ol>

          <div className="flex flex-col gap-2 border-t border-border pt-6">
            <p className="text-sm font-medium">Nothing arrived?</p>
            <p className="text-sm text-fg-secondary">
              Check spam, or ask for a new link. Each address can get one link every 5 minutes.
            </p>
            <ResendVerification email={email} className="mt-2" />
          </div>
        </>
      ) : (
        <AddressForm onAddress={setEmail} />
      )}

      <div className="flex flex-col gap-1.5 text-sm text-fg-secondary">
        <p>
          Already confirmed?{' '}
          <Link href="/login" className="link">
            Log in
          </Link>
        </p>
        <p>
          Wrong address?{' '}
          <Link href="/register" className="link">
            Register again
          </Link>
        </p>
      </div>
    </AuthPage>
  );
}
