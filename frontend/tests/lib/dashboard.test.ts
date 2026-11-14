import type { QueueHealth } from '@uniconnect/shared';
import {
  dashboardSections,
  daysLeftTone,
  departmentRows,
  queueTone,
  roleRows,
  statusRows,
  sumCounts,
} from '@/lib/dashboard';

describe('dashboardSections (D13, D43)', () => {
  it.each([
    ['student', 'student', ['personal']],
    ['faculty', 'faculty', ['personal']],
    ['moderator', 'student', ['moderator', 'personal']],
    ['moderator', 'faculty', ['moderator', 'personal']],
    ['dept_admin', 'faculty', ['dept_admin', 'personal']],
    ['super_admin', 'super_admin', ['super_admin']],
  ] as const)('%s (%s) → %j', (role, userType, expected) => {
    expect(dashboardSections(role, userType)).toEqual(expected);
  });
});

describe('chart rows', () => {
  it('keeps every role in role order, zeros included', () => {
    expect(
      roleRows({ student: 4, faculty: 0, moderator: 1, dept_admin: 2, super_admin: 1 }),
    ).toEqual([
      { key: 'student', label: 'Students', value: 4 },
      { key: 'faculty', label: 'Faculty', value: 0 },
      { key: 'moderator', label: 'Moderators', value: 1 },
      { key: 'dept_admin', label: 'Dept admins', value: 2 },
      { key: 'super_admin', label: 'Super admins', value: 1 },
    ]);
  });

  it('sorts departments largest first, ties by name', () => {
    expect(
      departmentRows([
        { id: 3, name: 'BBA', count: 2 },
        { id: 1, name: 'CSE', count: 5 },
        { id: 2, name: 'ECE', count: 2 },
      ]).map((r) => r.label),
    ).toEqual(['CSE', 'BBA', 'ECE']);
  });

  it('sums counts and lists event statuses in lifecycle order', () => {
    expect(sumCounts({ a: 2, b: 3 })).toBe(5);
    expect(statusRows({ completed: 1, draft: 2, published: 3, cancelled: 0 })).toEqual([
      ['draft', 2],
      ['published', 3],
      ['cancelled', 0],
      ['completed', 1],
    ]);
  });
});

describe('tones', () => {
  const queue = (overrides: Partial<QueueHealth>): QueueHealth => ({
    name: 'email',
    state: 'ok',
    counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
    ...overrides,
  });

  it('marks unreadable queues as a warning and failed jobs as destructive', () => {
    expect(queueTone(queue({}))).toBe('success');
    expect(queueTone(queue({ state: 'unavailable', counts: null }))).toBe('warning');
    expect(queueTone(queue({ counts: { waiting: 0, active: 0, delayed: 0, failed: 2 } }))).toBe(
      'destructive',
    );
  });

  it.each([
    [null, 'secondary'],
    [90, 'success'],
    [30, 'warning'],
    [7, 'destructive'],
    [0, 'destructive'],
  ] as const)('%s days left → %s', (days, tone) => {
    expect(daysLeftTone(days)).toBe(tone);
  });
});
