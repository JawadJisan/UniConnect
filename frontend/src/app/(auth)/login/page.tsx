import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageFallback } from '../_components/auth-page';
import { LoginView } from './login-view';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <LoginView />
    </Suspense>
  );
}
