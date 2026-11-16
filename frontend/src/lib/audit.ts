import { AUDIT_ACTION_VALUES, type AuditAction, type AuditLogParams } from '@uniconnect/shared';

// Audit log viewer helpers (PRD FR-AUDIT-002; DECISIONS D42, D43).

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AUDIT_FILTER_KEYS = ['user_id', 'action', 'entity_type', 'from', 'to'] as const;

/** Reads the viewer's params from the URL, keeping only values the API accepts. */
export function auditParamsFromUrl(search: URLSearchParams): AuditLogParams {
  const params: AuditLogParams = {};
  const user = search.get('user_id');
  if (user && UUID.test(user)) params.user_id = user;
  const action = search.get('action');
  if (action && (AUDIT_ACTION_VALUES as readonly string[]).includes(action)) {
    params.action = action as AuditAction;
  }
  const entity = search.get('entity_type')?.trim();
  if (entity && entity.length <= 50) params.entity_type = entity;
  const from = search.get('from');
  if (from && ISO_DAY.test(from)) params.from = from;
  const to = search.get('to');
  if (to && ISO_DAY.test(to)) params.to = to;
  const page = Number(search.get('page'));
  if (Number.isInteger(page) && page > 1) params.page = page;
  return params;
}

/** `from` after `to` is a 400 on the server; the viewer says so before asking. */
export function rangeInvalid(params: Pick<AuditLogParams, 'from' | 'to'>): boolean {
  return Boolean(params.from && params.to && params.from > params.to);
}

/** Action groups for the filter, by the area each action belongs to. */
const GROUPS: [string, (a: string) => boolean][] = [
  [
    'Accounts',
    (a) =>
      ['USER_REGISTERED', 'EMAIL_VERIFIED', 'LOGIN', 'PASSWORD_CHANGED', 'ROLE_CHANGED'].includes(
        a,
      ) || /^(PROFILE|AVATAR|USER)_/.test(a),
  ],
  ['Clubs', (a) => a.startsWith('CLUB_')],
  ['Memberships and payments', (a) => /^(MEMBERSHIP|CHECKOUT|PAYMENT)_/.test(a)],
  ['Committee and terms', (a) => /COMMITTEE|DEPT_ADMIN/.test(a)],
  ['Events', (a) => a.startsWith('EVENT_')],
  ['Announcements', (a) => a.startsWith('ANNOUNCEMENT_')],
  ['Blood', (a) => a.startsWith('BLOOD_')],
];

export interface ActionGroup {
  label: string;
  actions: AuditAction[];
}

/** Every known action in exactly one group; anything unmatched goes to "Other". */
export function actionGroups(actions: readonly AuditAction[] = AUDIT_ACTION_VALUES): ActionGroup[] {
  const groups: ActionGroup[] = GROUPS.map(([label]) => ({ label, actions: [] }));
  const other: AuditAction[] = [];
  for (const action of actions) {
    const index = GROUPS.findIndex(([, match]) => match(action));
    if (index === -1) other.push(action);
    else groups[index]!.actions.push(action);
  }
  if (other.length) groups.push({ label: 'Other', actions: other });
  return groups.filter((g) => g.actions.length > 0);
}

/** "MEMBERSHIP_PURCHASED" → "Membership purchased", for screen readers and the dialog title. */
export function actionLabel(action: string): string {
  const words = action.toLowerCase().split('_');
  return words.join(' ').replace(/^./, (c) => c.toUpperCase());
}

export type DiffKind = 'added' | 'removed' | 'changed' | 'same';

export interface DiffRow {
  key: string;
  kind: DiffKind;
  before?: unknown;
  after?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Top-level key diff of an audit row's `old_value` and `new_value`. Nested values compare by
 * their JSON text. A value that isn't an object (null, a string) diffs under the key "value".
 */
export function jsonDiff(before: unknown, after: unknown): DiffRow[] {
  const a = isRecord(before) ? before : before == null ? {} : { value: before };
  const b = isRecord(after) ? after : after == null ? {} : { value: after };
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.map((key) => {
    const inA = key in a;
    const inB = key in b;
    if (!inA) return { key, kind: 'added', after: b[key] };
    if (!inB) return { key, kind: 'removed', before: a[key] };
    const same = JSON.stringify(a[key]) === JSON.stringify(b[key]);
    return { key, kind: same ? 'same' : 'changed', before: a[key], after: b[key] };
  });
}

/** A JSON value as one short line for the diff list. */
export function compactJson(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** Pretty JSON for the raw blocks; `null` reads as "None". */
export function prettyJson(value: unknown): string {
  return value == null ? 'None' : JSON.stringify(value, null, 2);
}
