import type { Role, UserType } from '@uniconnect/shared';
import {
  HouseIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  ReceiptTextIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  Icon: LucideIcon;
  /** Roles that see this item. Omitted means every role. */
  roles?: readonly Role[];
  /**
   * Account types that see this item. Omitted means every type. For pages about who someone
   * is rather than their authority: buying a membership is for students, including student
   * moderators, and never for faculty (PRD §5).
   */
  userTypes?: readonly UserType[];
}

/** Who is looking at the navigation. */
export interface NavViewer {
  role: Role;
  userType: UserType;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const ADMIN_USERS_HREF = '/dashboard/admin/users';
export const CLUBS_HREF = '/dashboard/clubs';
export const MY_CLUB_HREF = '/dashboard/clubs/my-club';
export const MEMBERSHIPS_HREF = '/dashboard/memberships';
export const ADMIN_MEMBERSHIPS_HREF = '/dashboard/admin/memberships';

/** Roles that belong to a department, and so have a club of their own. */
const DEPARTMENT_ROLES: readonly Role[] = ['student', 'faculty', 'moderator', 'dept_admin'];

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
  {
    label: 'Clubs',
    items: [
      { label: 'My club', href: MY_CLUB_HREF, Icon: HouseIcon, roles: DEPARTMENT_ROLES },
      { label: 'All clubs', href: CLUBS_HREF, Icon: LayoutGridIcon },
      { label: 'Membership', href: MEMBERSHIPS_HREF, Icon: IdCardIcon, userTypes: ['student'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Users', href: ADMIN_USERS_HREF, Icon: UsersIcon, roles: ['super_admin'] },
      {
        label: 'Memberships',
        href: ADMIN_MEMBERSHIPS_HREF,
        Icon: ReceiptTextIcon,
        roles: ['dept_admin', 'super_admin'],
      },
    ],
  },
];

/** The groups and items a viewer can reach. Empty groups are dropped. */
export function visibleNav({ role, userType }: NavViewer, nav: NavGroup[] = NAV): NavGroup[] {
  return nav
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.roles || item.roles.includes(role)) &&
          (!item.userTypes || item.userTypes.includes(userType)),
      ),
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

export interface Capability {
  text: string;
  /** The page that does it, once it exists. Without one it shows as "Not built yet". */
  href?: string;
}

/**
 * What each role will be able to do, from the PRD �5 capability matrix. Shown on the overview:
 * built ones link to their page, the rest are plain text marked "Not built yet".
 */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  student: [
    {
      text: "Join your department's club with a monthly or yearly membership",
      href: MEMBERSHIPS_HREF,
    },
    { text: 'Browse events and register, including other departments� public events' },
    { text: 'Record your blood donations and answer blood requests' },
    { text: 'Ask the chatbot about clubs, events and rules you can see' },
  ],
  faculty: [
    { text: "View your department's club and its announcements", href: MY_CLUB_HREF },
    { text: 'Browse events and register' },
    { text: 'Record your blood donations and answer blood requests' },
    { text: 'Ask the chatbot about clubs, events and rules you can see' },
  ],
  moderator: [
    { text: "Create, publish and cancel your club's events" },
    { text: 'Check attendees in and export registrations' },
    { text: 'Post announcements to your club' },
    { text: 'Everything your student or faculty account already allows' },
  ],
  dept_admin: [
    { text: "Edit your department's club details and fees", href: MY_CLUB_HREF },
    { text: "See and cancel your department's club memberships", href: ADMIN_MEMBERSHIPS_HREF },
    { text: 'Assign committee members' },
    { text: 'Verify blood donations in your department' },
    { text: 'Manage department events and post department announcements' },
  ],
  super_admin: [
    { text: 'Manage every user: suspend, activate and repair roles', href: ADMIN_USERS_HREF },
    { text: 'See club memberships and payments across departments', href: ADMIN_MEMBERSHIPS_HREF },
    { text: 'Assign department admin terms' },
    { text: 'Verify blood donations in any department' },
    { text: 'Read the audit log' },
  ],
};
