import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageFallback } from '../_components/auth-page';
import { VerifyEmailView } from './verify-email-view';

export const metadata: Metadata = { title: 'Confirm your email' };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <VerifyEmailView />
    </Suspense>
  );
}
