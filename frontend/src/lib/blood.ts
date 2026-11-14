import {
  BLOOD_GROUPS,
  BLOOD_REQUEST_STATUSES,
  type BloodGroup,
  type BloodRequestListParams,
  type BloodRequestStatus,
  type DonorListParams,
  type Role,
  type UnverifiedDonationsParams,
} from '@uniconnect/shared';
import {
  BanIcon,
  CircleCheckIcon,
  HourglassIcon,
  ShieldCheckIcon,
  TimerOffIcon,
} from 'lucide-react';
import type { StatusMeta } from './membership';

// Blood module helpers (PRD FR-BLOOD; DECISIONS D14, D40, D41).

/** "O-" → "O−": a real minus sign reads better than a hyphen in a badge. */
export const formatBloodGroup = (group: string) => group.replace('-', '−');

const SPOKEN: Record<string, string> = { '+': 'positive', '-': 'negative' };

/** "O-" → "O negative", for screen readers. */
export function spokenBloodGroup(group: string): string {
  const sign = group.slice(-1);
  return `${group.slice(0, -1)} ${SPOKEN[sign] ?? sign}`;
}

/** Request states (DESIGN.md §7): icon plus the word, never colour alone. */
export const REQUEST_STATUS_META: Record<BloodRequestStatus, StatusMeta> = {
  pending: { label: 'Pending', variant: 'warning', Icon: HourglassIcon },
  fulfilled: { label: 'Fulfilled', variant: 'success', Icon: CircleCheckIcon },
  cancelled: { label: 'Cancelled', variant: 'destructive', Icon: BanIcon },
  expired: { label: 'Expired', variant: 'secondary', Icon: TimerOffIcon },
};

export const DONATION_STATUS_META = {
  verified: { label: 'Verified', variant: 'success', Icon: ShieldCheckIcon },
  pending: { label: 'Pending', variant: 'warning', Icon: HourglassIcon },
} as const satisfies Record<string, StatusMeta>;

/** Everyone but super_admin records donations (FR-BLOOD-001, -003). */
export const canRecordDonation = (role: Role) => role !== 'super_admin';

/** dept_admin (own department) and super_admin verify (FR-BLOOD-002, -010). */
export const canVerify = (role: Role) => role === 'dept_admin' || role === 'super_admin';

/** Today's date in Asia/Dhaka as `YYYY-MM-DD`, for date-input limits (the API's rule). */
export function todayInDhaka(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// URL readers. Each tab keeps its filters under its own prefix (`r_`, `d_`, `m_`), so
// switching tabs never drops another tab's filters. Values the API wouldn't accept are dropped.

export const BLOOD_TABS = ['requests', 'donors', 'donations'] as const;
export type BloodTab = (typeof BLOOD_TABS)[number];

export function tabFromUrl(search: URLSearchParams, allowDonations: boolean): BloodTab {
  const tab = search.get('tab');
  if (tab === 'donors') return 'donors';
  if (tab === 'donations' && allowDonations) return 'donations';
  return 'requests';
}

const isBloodGroup = (v: string | null): v is BloodGroup =>
  v !== null && (BLOOD_GROUPS as readonly string[]).includes(v);

function positiveInt(v: string | null): number | undefined {
  const n = Number(v);
  return v !== null && Number.isInteger(n) && n > 0 ? n : undefined;
}

function page(search: URLSearchParams, key: string): number | undefined {
  const n = positiveInt(search.get(key));
  return n !== undefined && n > 1 ? n : undefined;
}

export function requestParamsFromUrl(search: URLSearchParams): BloodRequestListParams {
  const params: BloodRequestListParams = {};
  const status = search.get('r_status');
  if (status && (BLOOD_REQUEST_STATUSES as readonly string[]).includes(status)) {
    params.status = status as BloodRequestStatus;
  }
  const group = search.get('r_blood_group');
  if (isBloodGroup(group)) params.blood_group = group;
  const dept = positiveInt(search.get('r_department_id'));
  if (dept !== undefined) params.department_id = dept;
  const p = page(search, 'r_page');
  if (p !== undefined) params.page = p;
  return params;
}

export function donorParamsFromUrl(search: URLSearchParams): DonorListParams {
  const params: DonorListParams = {};
  const group = search.get('d_blood_group');
  if (isBloodGroup(group)) params.blood_group = group;
  const dept = positiveInt(search.get('d_department_id'));
  if (dept !== undefined) params.department_id = dept;
  if (search.get('d_verified_only') === 'true') params.verified_only = 'true';
  const p = page(search, 'd_page');
  if (p !== undefined) params.page = p;
  return params;
}

export function myDonationsPageFromUrl(search: URLSearchParams): number | undefined {
  return page(search, 'm_page');
}

export function unverifiedParamsFromUrl(search: URLSearchParams): UnverifiedDonationsParams {
  const params: UnverifiedDonationsParams = {};
  const dept = positiveInt(search.get('department_id'));
  if (dept !== undefined) params.department_id = dept;
  const p = page(search, 'page');
  if (p !== undefined) params.page = p;
  return params;
}
