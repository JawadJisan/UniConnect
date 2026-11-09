'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AuthPage } from '../_components/auth-page';
import { SIGN_UP_FLOW } from '../_components/flow-trail';
import { RegisterForm, type AccountKind } from './register-form';

const kinds: { kind: AccountKind; label: string; href: string }[] = [
  { kind: 'student', label: 'Student', href: '/register' },
  { kind: 'faculty', label: 'Faculty', href: '/register?as=faculty' },
];

export function RegisterView() {
  const params = useSearchParams();
  const kind: AccountKind = params.get('as') === 'faculty' ? 'faculty' : 'student';

  return (
    <AuthPage
      wide
      trail={{ steps: SIGN_UP_FLOW, current: 0, label: 'Account setup' }}
      title="Create your account"
      description="Join your department's club, register for events and answer blood requests."
    >
      <nav aria-label="Account type" className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-surface-1 p-1">
          {kinds.map((k) => (
            <Link
              key={k.kind}
              href={k.href}
              replace
              scroll={false}
              aria-current={k.kind === kind ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center justify-center rounded-sm text-sm font-medium transition-colors',
                k.kind === kind
                  ? 'bg-surface-3 text-foreground'
                  : 'text-fg-secondary hover:text-foreground',
              )}
            >
              {k.label}
            </Link>
          ))}
        </div>
        <p className="text-sm text-fg-tertiary">
          {kind === 'student'
            ? 'For enrolled students. You will need your student ID.'
            : 'For teaching staff. No student details needed.'}
        </p>
      </nav>

      {/* key: switching type starts a fresh form, so student-only values never carry over. */}
      <RegisterForm key={kind} kind={kind} />

      <p className="text-sm text-fg-secondary">
        Already have an account?{' '}
        <Link href="/login" className="link">
          Log in
        </Link>
      </p>
    </AuthPage>
  );
}
