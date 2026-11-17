import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageFallback } from '../_components/auth-page';
import { VerifyEmailView } from './verify-email-view';

// Reached from an emailed link with a token: never index it (D50).
export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <VerifyEmailView />
    </Suspense>
  );
}
