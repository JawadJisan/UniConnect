import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageFallback } from '../_components/auth-page';
import { ResetPasswordView } from './reset-password-view';

export const metadata: Metadata = { title: 'Set a new password' };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <ResetPasswordView />
    </Suspense>
  );
}
