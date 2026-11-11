import { greetingName, ROLE_AS_PERSON } from '@/app/(app)/dashboard/_components/overview-view';
import { initials } from '@/components/ui/avatar';
import { UsersIcon } from 'lucide-react';
import { activeHref, NAV, visibleNav, type NavGroup } from '@/app/(app)/_components/nav';
import { safeNext } from '@/lib/safe-next';

const hrefs = (groups: NavGroup[]) => groups.flatMap((g) => g.items.map((i) => i.href));
const BASE = ['/dashboard', '/dashboard/profile', '/dashboard/clubs/my-club', '/dashboard/clubs'];

describe('workspace navigation', () => {
  it.each([
    ['a student', { role: 'student', userType: 'student' }],
    ['a student moderator', { role: 'moderator', userType: 'student' }],
  ] as const)('gives %s Membership, by account type (PRD §5)', (_label, viewer) => {
    expect(hrefs(visibleNav(viewer))).toEqual([...BASE, '/dashboard/memberships']);
  });

  it.each([
    ['faculty', { role: 'faculty', userType: 'faculty' }],
    ['a faculty moderator', { role: 'moderator', userType: 'faculty' }],
  ] as const)('gives %s no Membership page', (_label, viewer) => {
    expect(hrefs(visibleNav(viewer))).toEqual(BASE);
  });

  it('gives a dept_admin the Memberships admin list but no Membership page', () => {
    expect(hrefs(visibleNav({ role: 'dept_admin', userType: 'faculty' }))).toEqual([
      ...BASE,
      '/dashboard/admin/memberships',
    ]);
  });

  it('gives super admins All clubs but no My club, and the Admin group with Users and Memberships', () => {
    const viewer = { role: 'super_admin', userType: 'super_admin' } as const;
    expect(visibleNav(viewer).map((g) => g.label)).toEqual(['You', 'Clubs', 'Admin']);
    expect(hrefs(visibleNav(viewer))).toEqual([
      '/dashboard',
      '/dashboard/profile',
      '/dashboard/clubs',
      '/dashboard/admin/users',
      '/dashboard/admin/memberships',
    ]);
    expect(activeHref('/dashboard/admin/users/abc')).toBe('/dashboard/admin/users');
    expect(activeHref('/dashboard/memberships/checkout/mock')).toBe('/dashboard/memberships');
  });

  it('shows a role-limited item only to its roles, and drops groups left empty', () => {
    const nav: NavGroup[] = [
      NAV[0]!,
      {
        label: 'Admin',
        items: [
          { label: 'Users', href: '/dashboard/users', Icon: UsersIcon, roles: ['super_admin'] },
        ],
      },
    ];
    expect(
      visibleNav({ role: 'super_admin', userType: 'super_admin' }, nav).map((g) => g.label),
    ).toEqual(['You', 'Admin']);
    for (const role of ['student', 'faculty', 'moderator', 'dept_admin'] as const) {
      expect(visibleNav({ role, userType: 'student' }, nav).map((g) => g.label)).toEqual(['You']);
    }
  });

  it('marks the most specific item active', () => {
    expect(activeHref('/dashboard')).toBe('/dashboard');
    expect(activeHref('/dashboard/profile')).toBe('/dashboard/profile');
    expect(activeHref('/dashboard/profile/extra')).toBe('/dashboard/profile');
    expect(activeHref('/dashboard/clubs/my-club')).toBe('/dashboard/clubs/my-club');
    expect(activeHref('/dashboard/clubs/3')).toBe('/dashboard/clubs');
    expect(activeHref('/elsewhere')).toBeUndefined();
  });
});

describe('safeNext', () => {
  it.each([
    ['/dashboard/profile', '/dashboard/profile'],
    ['/dashboard?tab=1#x', '/dashboard?tab=1#x'],
    [null, '/dashboard'],
    ['', '/dashboard'],
    ['dashboard', '/dashboard'],
    ['https://evil.example', '/dashboard'],
    ['//evil.example', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe('avatar initials', () => {
  it.each([
    ['Ayesha Rahman', 'AR'],
    ['Dr. Karim Hossain', 'KH'],
    ['Md. Rahim Uddin Khan', 'RK'],
    ['Prof Nasreen', 'N'],
    ['Dr.', 'D'],
    ['  ', '?'],
  ])('%s → %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('greeting name', () => {
  it.each([
    ['Ayesha Rahman', 'Ayesha'],
    ['Dr. Karim Hossain', 'Karim'],
    ['Md. Rahim Uddin', 'Rahim'],
    ['Dr.', 'Dr.'],
  ])('%s → %s', (name, expected) => {
    expect(greetingName(name)).toBe(expected);
  });
});

describe('role phrasing on the overview', () => {
  it('reads as a person for every role', () => {
    expect(ROLE_AS_PERSON).toEqual({
      student: 'a student',
      faculty: 'a faculty member',
      moderator: 'a moderator',
      dept_admin: 'a department admin',
      super_admin: 'the super admin',
    });
  });
});
