import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageFallback } from '../_components/auth-page';
import { ResetPasswordView } from './reset-password-view';

// Reached from an emailed link with a token: never index it (D50).
export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <ResetPasswordView />
    </Suspense>
  );
}
