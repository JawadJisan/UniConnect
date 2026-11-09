'use client';

import type { Role, UserProfile } from '@uniconnect/shared';
import { CheckIcon, CircleIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { nameWords } from '@/lib/names';
import { ROLE_CAPABILITIES, ROLE_LABEL, USER_TYPE_LABEL } from '../../_components/nav';
import { Panel } from '../../_components/panel';
import { useProfile } from '../../_components/require-session';

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  /** What to do, said when it isn't done yet. */
  hint: string;
}

/** What a complete profile has, by user type. Only fields the user can set themselves. */
export function profileChecklist(p: UserProfile): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: 'avatar',
      label: 'Profile photo',
      done: Boolean(p.avatar_url),
      hint: 'Helps club committees and event hosts recognise you.',
    },
    {
      id: 'phone',
      label: 'Phone number',
      done: Boolean(p.phone),
      hint: 'Used for blood requests and event contact.',
    },
    {
      id: 'blood',
      label: 'Blood group',
      done: Boolean(p.blood_group),
      hint: 'Needed before you can appear on the donor list.',
    },
  ];
  if (p.user_type === 'student') {
    items.push({
      id: 'academic',
      label: 'Academic details',
      done: Boolean(p.student_id && p.academic_session && p.current_year && p.current_semester),
      hint: 'Student ID, session, year and semester.',
    });
  }
  return items;
}

/** The name to greet by: the first word that isn't a title ("Dr. Karim Hossain" → "Karim"). */
export function greetingName(name: string) {
  return nameWords(name)[0] ?? name.trim();
}

/** Each role as a person, for "What you can do as …". "Faculty" names a group, not a person. */
export const ROLE_AS_PERSON: Record<Role, string> = {
  student: 'a student',
  faculty: 'a faculty member',
  moderator: 'a moderator',
  dept_admin: 'a department admin',
  super_admin: 'the super admin',
};

export function OverviewView() {
  const profile = useProfile();
  const checklist = profileChecklist(profile);
  const remaining = checklist.filter((i) => !i.done).length;

  return (
    <div className="container-wide flex flex-col gap-8 py-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display-sm">Welcome, {greetingName(profile.name)}</h1>
        <p className="text-sm text-fg-secondary">
          {ROLE_LABEL[profile.role]}
          {profile.department ? ` in ${profile.department.name}` : ''}. Signed in as{' '}
          <span className="text-foreground">{profile.email}</span>.
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel
          id="checklist-title"
          title="Your profile"
          tag="SYS.PROFILE.CHECK"
          description={
            remaining === 0
              ? 'Everything is filled in.'
              : `${checklist.length - remaining} of ${checklist.length} done.`
          }
          className="lg:col-span-2"
          footer={
            <Link
              href="/dashboard/profile"
              className={buttonVariants({ variant: remaining ? 'default' : 'secondary' })}
            >
              {remaining ? 'Complete your profile' : 'Edit profile'}
            </Link>
          }
        >
          <ul className="flex flex-col divide-y divide-border">
            {checklist.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                {item.done ? (
                  <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <CircleIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-fg-tertiary"
                  />
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-foreground">
                    {item.label}
                    <span className="sr-only">{item.done ? ' (done)' : ' (missing)'}</span>
                  </span>
                  {!item.done ? (
                    <span className="text-sm text-fg-tertiary">{item.hint}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel id="account-title" title="Account" tag="SYS.ACCOUNT">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-fg-tertiary">Type</dt>
            <dd className="text-foreground">{USER_TYPE_LABEL[profile.user_type]}</dd>
            <dt className="text-fg-tertiary">Role</dt>
            <dd className="text-foreground">{ROLE_LABEL[profile.role]}</dd>
            <dt className="text-fg-tertiary">Department</dt>
            <dd className="text-foreground">{profile.department?.name ?? 'All departments'}</dd>
            <dt className="text-fg-tertiary">Member since</dt>
            <dd className="font-mono text-foreground tabular-nums">
              {formatDate(profile.created_at)}
            </dd>
          </dl>
        </Panel>

        <Panel
          id="access-title"
          title={`What you can do as ${ROLE_AS_PERSON[profile.role]}`}
          tag="SYS.ACCESS"
          description="These parts of UniConnect are not built yet. They will appear in the sidebar as they ship."
          className="lg:col-span-3"
        >
          <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {ROLE_CAPABILITIES[profile.role].map((line) => (
              <li key={line} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-fg-secondary">{line}</span>
                <Badge variant="secondary" className="shrink-0">
                  Not built yet
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
