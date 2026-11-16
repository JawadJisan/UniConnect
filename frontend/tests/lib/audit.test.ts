import { AUDIT_ACTION_VALUES } from '@uniconnect/shared';
import {
  actionGroups,
  actionLabel,
  auditParamsFromUrl,
  compactJson,
  jsonDiff,
  prettyJson,
  rangeInvalid,
} from '@/lib/audit';

const USER = '0b6c2f3e-8a3d-4c55-9a51-1f2e3d4c5b6a';

describe('auditParamsFromUrl', () => {
  it('keeps valid params', () => {
    const search = new URLSearchParams({
      user_id: USER,
      action: 'EVENT_CREATED',
      entity_type: 'Event',
      from: '2026-11-01',
      to: '2026-11-14',
      page: '3',
    });
    expect(auditParamsFromUrl(search)).toEqual({
      user_id: USER,
      action: 'EVENT_CREATED',
      entity_type: 'Event',
      from: '2026-11-01',
      to: '2026-11-14',
      page: 3,
    });
  });

  it('drops values the API would refuse', () => {
    const search = new URLSearchParams({
      user_id: 'not-a-uuid',
      action: 'DROP_TABLE',
      entity_type: 'x'.repeat(51),
      from: '14/11/2026',
      to: 'yesterday',
      page: '1',
    });
    expect(auditParamsFromUrl(search)).toEqual({});
  });

  it('flags a range whose start is after its end', () => {
    expect(rangeInvalid({ from: '2026-11-15', to: '2026-11-14' })).toBe(true);
    expect(rangeInvalid({ from: '2026-11-14', to: '2026-11-14' })).toBe(false);
    expect(rangeInvalid({ from: '2026-11-15' })).toBe(false);
  });
});

describe('actionGroups', () => {
  it('puts every known action in exactly one group, with no "Other"', () => {
    const groups = actionGroups();
    const all = groups.flatMap((g) => g.actions);
    expect([...all].sort()).toEqual([...AUDIT_ACTION_VALUES].sort());
    expect(groups.map((g) => g.label)).not.toContain('Other');
  });

  it('groups by area', () => {
    const find = (a: string) => actionGroups().find((g) => g.actions.includes(a as never))?.label;
    expect(find('LOGIN')).toBe('Accounts');
    expect(find('USER_SUSPENDED')).toBe('Accounts');
    expect(find('PAYMENT_FAILED')).toBe('Memberships and payments');
    expect(find('RENEW_DEPT_ADMIN_TERM')).toBe('Committee and terms');
    expect(find('BLOOD_REQUEST_EXPIRED')).toBe('Blood');
  });

  it('sends an unknown action to "Other"', () => {
    expect(actionGroups(['LOGIN', 'SOMETHING_NEW' as never]).at(-1)).toEqual({
      label: 'Other',
      actions: ['SOMETHING_NEW'],
    });
  });

  it('reads an action as words', () => {
    expect(actionLabel('MEMBERSHIP_PURCHASED')).toBe('Membership purchased');
  });
});

describe('jsonDiff', () => {
  it('marks added, removed, changed and unchanged keys, sorted by key', () => {
    expect(
      jsonDiff({ name: 'A', role: 'student', tags: [1] }, { name: 'A', role: 'moderator', x: 1 }),
    ).toEqual([
      { key: 'name', kind: 'same', before: 'A', after: 'A' },
      { key: 'role', kind: 'changed', before: 'student', after: 'moderator' },
      { key: 'tags', kind: 'removed', before: [1] },
      { key: 'x', kind: 'added', after: 1 },
    ]);
  });

  it('compares nested values by content', () => {
    expect(jsonDiff({ a: { b: 1 } }, { a: { b: 1 } })[0]!.kind).toBe('same');
    expect(jsonDiff({ a: { b: 1 } }, { a: { b: 2 } })[0]!.kind).toBe('changed');
  });

  it('handles null and plain values', () => {
    expect(jsonDiff(null, null)).toEqual([]);
    expect(jsonDiff(null, { status: 'active' })).toEqual([
      { key: 'status', kind: 'added', after: 'active' },
    ]);
    expect(jsonDiff('old', 'new')).toEqual([
      { key: 'value', kind: 'changed', before: 'old', after: 'new' },
    ]);
  });

  it('formats values for display', () => {
    expect(compactJson('text')).toBe('text');
    expect(compactJson({ a: 1 })).toBe('{"a":1}');
    expect(compactJson(undefined)).toBe('—');
    expect(prettyJson(null)).toBe('None');
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
