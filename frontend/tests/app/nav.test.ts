import { ROLES } from '@uniconnect/shared';
import { greetingName, ROLE_AS_PERSON } from '@/app/(app)/dashboard/_components/overview-view';
import { initials } from '@/components/ui/avatar';
import { UsersIcon } from 'lucide-react';
import { activeHref, NAV, visibleNav, type NavGroup } from '@/app/(app)/_components/nav';
import { safeNext } from '@/lib/safe-next';

describe('workspace navigation', () => {
  it.each(ROLES)('gives %s the pages that exist today', (role) => {
    const items = visibleNav(role).flatMap((g) => g.items.map((i) => i.href));
    expect(items).toEqual(['/dashboard', '/dashboard/profile']);
  });

  it('shows a role-limited item only to its roles, and drops groups left empty', () => {
    const nav: NavGroup[] = [
      ...NAV,
      {
        label: 'Admin',
        items: [
          { label: 'Users', href: '/dashboard/users', Icon: UsersIcon, roles: ['super_admin'] },
        ],
      },
    ];
    expect(visibleNav('super_admin', nav).map((g) => g.label)).toEqual(['You', 'Admin']);
    for (const role of ['student', 'faculty', 'moderator', 'dept_admin'] as const) {
      expect(visibleNav(role, nav).map((g) => g.label)).toEqual(['You']);
    }
  });

  it('marks the most specific item active', () => {
    expect(activeHref('/dashboard')).toBe('/dashboard');
    expect(activeHref('/dashboard/profile')).toBe('/dashboard/profile');
    expect(activeHref('/dashboard/profile/extra')).toBe('/dashboard/profile');
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
