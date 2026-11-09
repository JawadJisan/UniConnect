'use client';

import { useProfile } from '../../../_components/require-session';
import { AcademicForm } from './academic-form';
import { IdentityCard } from './identity-card';
import { PasswordForm } from './password-form';
import { PersonalForm } from './personal-form';

/**
 * The profile: the identity card (photo and read-only account facts) holds a sticky left
 * column on wide screens, and the editable cards stack on the right in the order a phone reads
 * the whole page: personal, academic (students only, PRD FR-USER-002), password. One DOM
 * order, so focus order and visual order always agree. Each form resets itself after its own
 * save, so saving one card never discards unsaved edits in another.
 */
export function ProfileView() {
  const profile = useProfile();
  const student = profile.user_type === 'student';

  return (
    <div className="container-wide flex flex-col gap-8 py-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display-sm">Profile</h1>
        <p className="text-sm text-fg-secondary">
          Keep your details current. Each card saves on its own.
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:sticky lg:top-16">
          <IdentityCard profile={profile} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <PersonalForm profile={profile} />
          {student ? <AcademicForm profile={profile} /> : null}
          <PasswordForm />
        </div>
      </div>
    </div>
  );
}
