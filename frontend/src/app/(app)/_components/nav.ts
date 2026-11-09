import type { Role, UserType } from '@uniconnect/shared';
import { LayoutDashboardIcon, UserRoundIcon, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  Icon: LucideIcon;
  /** Roles that see this item. Omitted means every role. */
  roles?: readonly Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Every signed-in destination, grouped as the sidebar shows them. Only routes that exist are
 * listed (frontend rule). Club, event, blood and admin pages join here with their `roles`
 * when they are built, so the sidebar stays role-aware from one table.
 */
export const NAV: NavGroup[] = [
  {
    label: 'You',
    items: [
      { label: 'Overview', href: '/dashboard', Icon: LayoutDashboardIcon },
      { label: 'Profile', href: '/dashboard/profile', Icon: UserRoundIcon },
    ],
  },
];

/** The groups and items a role can reach. Empty groups are dropped. */
export function visibleNav(role: Role, nav: NavGroup[] = NAV): NavGroup[] {
  return nav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

/** The item for a pathname: the longest href that matches it. */
export function activeHref(pathname: string, nav: NavGroup[] = NAV): string | undefined {
  return nav
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  faculty: 'Faculty',
  moderator: 'Moderator',
  dept_admin: 'Department admin',
  super_admin: 'Super admin',
};

export const USER_TYPE_LABEL: Record<UserType, string> = {
  student: 'Student',
  faculty: 'Faculty',
  super_admin: 'Super admin',
};

/**
 * What each role will be able to do, from the PRD §5 capability matrix. Shown on the overview
 * as plain text marked "Not built yet": no links until the pages exist.
 */
export const ROLE_CAPABILITIES: Record<Role, string[]> = {
  student: [
    "Join your department's club with a monthly or yearly membership",
    'Browse events and register, including other departments’ public events',
    'Record your blood donations and answer blood requests',
    'Ask the chatbot about clubs, events and rules you can see',
  ],
  faculty: [
    "View your department's club and its announcements",
    'Browse events and register',
    'Record your blood donations and answer blood requests',
    'Ask the chatbot about clubs, events and rules you can see',
  ],
  moderator: [
    "Create, publish and cancel your club's events",
    'Check attendees in and export registrations',
    'Post announcements to your club',
    'Everything your student or faculty account already allows',
  ],
  dept_admin: [
    "Edit your department's club details and fees",
    'Assign committee members',
    'Verify blood donations in your department',
    'Manage department events and post department announcements',
  ],
  super_admin: [
    'Manage every user: suspend, activate and repair roles',
    'Assign department admin terms',
    'Verify blood donations in any department',
    'Read the audit log',
  ],
};
