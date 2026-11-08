import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageFallback } from '../_components/auth-page';
import { RegisterView } from './register-view';

export const metadata: Metadata = { title: 'Create an account' };

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPageFallback wide />}>
      <RegisterView />
    </Suspense>
  );
}
