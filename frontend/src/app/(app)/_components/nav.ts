import type { Role, UserType } from '@uniconnect/shared';
import {
  CalendarDaysIcon,
  CalendarPlusIcon,
  DropletIcon,
  HeartPulseIcon,
  HouseIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  TicketIcon,
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
export const DEPT_ADMINS_HREF = '/dashboard/admin/dept-admins';
export const EVENTS_HREF = '/dashboard/events';
export const MY_REGISTRATIONS_HREF = '/dashboard/events/my-registrations';
export const NEW_EVENT_HREF = '/dashboard/events/new';
export const ANNOUNCEMENTS_HREF = '/dashboard/announcements';
export const BLOOD_HREF = '/dashboard/blood';
export const BLOOD_VERIFICATIONS_HREF = '/dashboard/admin/blood-verifications';

/** Roles that belong to a department, and so have a club of their own. */
const DEPARTMENT_ROLES: readonly Role[] = ['student', 'faculty', 'moderator', 'dept_admin'];

/** Roles that create and manage events (PRD #3); the API checks the club itself. */
const ORGANIZER_ROLES: readonly Role[] = ['moderator', 'dept_admin', 'super_admin'];

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
    label: 'Events',
    items: [
      { label: 'Browse events', href: EVENTS_HREF, Icon: CalendarDaysIcon },
      {
        label: 'My registrations',
        href: MY_REGISTRATIONS_HREF,
        Icon: TicketIcon,
        roles: DEPARTMENT_ROLES,
      },
      { label: 'New event', href: NEW_EVENT_HREF, Icon: CalendarPlusIcon, roles: ORGANIZER_ROLES },
    ],
  },
  {
    label: 'Updates',
    items: [{ label: 'Announcements', href: ANNOUNCEMENTS_HREF, Icon: MegaphoneIcon }],
  },
  {
    label: 'Blood',
    items: [{ label: 'Blood donation', href: BLOOD_HREF, Icon: DropletIcon }],
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
      {
        label: 'Dept admins',
        href: DEPT_ADMINS_HREF,
        Icon: ShieldCheckIcon,
        roles: ['super_admin'],
      },
      {
        label: 'Blood verifications',
        href: BLOOD_VERIFICATIONS_HREF,
        Icon: HeartPulseIcon,
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
 * What each role will be able to do, from the PRD §5 capability matrix. Shown on the overview:
 * built ones link to their page, the rest are plain text marked "Not built yet".
 */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  student: [
    {
      text: "Join your department's club with a monthly or yearly membership",
      href: MEMBERSHIPS_HREF,
    },
    {
      href: EVENTS_HREF,
      text: 'Browse events and register, including other departments’ public events',
    },
    { text: 'Record your blood donations and answer blood requests', href: BLOOD_HREF },
    { text: 'Ask the chatbot about clubs, events and rules you can see' },
  ],
  faculty: [
    { text: "View your department's club and its announcements", href: ANNOUNCEMENTS_HREF },
    { text: 'Browse events and register', href: EVENTS_HREF },
    { text: 'Record your blood donations and answer blood requests', href: BLOOD_HREF },
    { text: 'Ask the chatbot about clubs, events and rules you can see' },
  ],
  moderator: [
    { text: "Create, publish and cancel your club's events", href: NEW_EVENT_HREF },
    { text: 'Check attendees in and export registrations', href: EVENTS_HREF },
    { text: 'Post announcements to your club', href: ANNOUNCEMENTS_HREF },
    { text: 'Everything your student or faculty account already allows' },
  ],
  dept_admin: [
    { text: "Edit your department's club details and fees", href: MY_CLUB_HREF },
    { text: "See and cancel your department's club memberships", href: ADMIN_MEMBERSHIPS_HREF },
    { text: 'Assign committee members', href: MY_CLUB_HREF },
    { text: 'Verify blood donations in your department', href: BLOOD_VERIFICATIONS_HREF },
    { text: 'Manage department events', href: EVENTS_HREF },
    { text: 'Post and pin department announcements', href: ANNOUNCEMENTS_HREF },
  ],
  super_admin: [
    { text: 'Manage every user: suspend, activate and repair roles', href: ADMIN_USERS_HREF },
    { text: 'See club memberships and payments across departments', href: ADMIN_MEMBERSHIPS_HREF },
    { text: 'Assign department admin terms', href: DEPT_ADMINS_HREF },
    { text: 'Post and pin announcements for any department or club', href: ANNOUNCEMENTS_HREF },
    { text: 'Verify blood donations in any department', href: BLOOD_VERIFICATIONS_HREF },
    { text: 'Read the audit log' },
  ],
};
