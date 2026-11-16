import { describe, expect, it, jest } from '@jest/globals';
import {
  AUDIT_ACTIONS,
  assignCommitteeSchema,
  assignDeptAdminSchema,
  committeeListQuerySchema,
  committeeMemberParamsSchema,
  deptAdminTermListQuerySchema,
  renewDeptAdminSchema,
  updateCommitteeSchema,
} from '@uniconnect/shared';

// Pure rules of the committee and dept-admin-term modules: request schemas, row → API mapping
// and the email template. Routes, locks, role recompute, audit rows and the expiry jobs run
// against the real database in tests/integration/committee.int.test.ts and
// dept-admin-terms.int.test.ts.

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));

const { toCommitteeEntry } = await import('../src/modules/committee/committee.service.js');
const { toDeptAdminTerm } =
  await import('../src/modules/dept-admin-terms/dept-admin-term.service.js');
const { deptAdminAssignedTemplate } = await import('../src/emails/templates.js');

const USER = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';

describe('assignCommitteeSchema', () => {
  const valid = {
    user_id: USER,
    position: ' President ',
    term_start_year: 2026,
    term_end_year: 2027,
  };

  it('trims the position and defaults is_current to true', () => {
    expect(assignCommitteeSchema.parse(valid)).toEqual({
      ...valid,
      position: 'President',
      is_current: true,
    });
  });

  it('accepts a historical row with is_current false', () => {
    expect(assignCommitteeSchema.parse({ ...valid, is_current: false }).is_current).toBe(false);
  });

  it('rejects an end year before the start year, on term_end_year', () => {
    const r = assignCommitteeSchema.safeParse({ ...valid, term_end_year: 2025 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['term_end_year']);
  });

  it.each([
    ['a bad uuid', { user_id: 'nope' }],
    ['a short position', { position: 'P' }],
    ['a long position', { position: 'x'.repeat(51) }],
    ['a fractional year', { term_start_year: 2026.5 }],
    ['a year as a string', { term_start_year: '2026' }],
    ['a year out of range', { term_end_year: 2101 }],
    ['an unknown key', { role: 'moderator' }],
  ])('rejects %s', (_label, patch) => {
    expect(assignCommitteeSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe('updateCommitteeSchema', () => {
  it('accepts any one editable field', () => {
    expect(updateCommitteeSchema.parse({ position: 'Secretary' })).toEqual({
      position: 'Secretary',
    });
    expect(updateCommitteeSchema.parse({ term_end_year: 2028 })).toEqual({ term_end_year: 2028 });
  });

  it('rejects an empty body, is_current, user_id and reversed years', () => {
    expect(updateCommitteeSchema.safeParse({}).success).toBe(false);
    expect(updateCommitteeSchema.safeParse({ is_current: false }).success).toBe(false);
    expect(updateCommitteeSchema.safeParse({ user_id: USER }).success).toBe(false);
    expect(
      updateCommitteeSchema.safeParse({ term_start_year: 2027, term_end_year: 2026 }).success,
    ).toBe(false);
  });
});

describe('committee params and query', () => {
  it('coerces both ids and rejects bad ones', () => {
    expect(committeeMemberParamsSchema.parse({ id: '3', memberId: '9' })).toEqual({
      id: 3,
      memberId: 9,
    });
    expect(committeeMemberParamsSchema.safeParse({ id: '3', memberId: 'x' }).success).toBe(false);
  });

  it('parses is_current as a boolean and rejects other values', () => {
    expect(committeeListQuerySchema.parse({ is_current: 'false' })).toEqual({
      page: 1,
      limit: 20,
      is_current: false,
    });
    expect(committeeListQuerySchema.safeParse({ is_current: 'yes' }).success).toBe(false);
    expect(committeeListQuerySchema.safeParse({ sort: 'x' }).success).toBe(false);
  });
});

describe('dept admin term schemas', () => {
  const valid = {
    user_id: USER,
    department_id: 1,
    start_date: '2026-11-01',
    end_date: '2027-10-31',
  };

  it('accepts a valid assignment', () => {
    expect(assignDeptAdminSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['an impossible date', { end_date: '2027-02-30' }],
    ['a date with a time', { start_date: '2026-11-01T00:00:00Z' }],
    ['a non-padded date', { start_date: '2026-1-1' }],
    ['end before start', { end_date: '2026-10-31' }],
    ['a string department id', { department_id: '1' }],
    ['an unknown key', { is_current: true }],
  ])('rejects %s', (_label, patch) => {
    expect(assignDeptAdminSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it('accepts a one-day term', () => {
    expect(assignDeptAdminSchema.safeParse({ ...valid, end_date: valid.start_date }).success).toBe(
      true,
    );
  });

  it('renew takes only the new dates', () => {
    expect(
      renewDeptAdminSchema.parse({ start_date: '2027-01-01', end_date: '2027-12-31' }),
    ).toEqual({ start_date: '2027-01-01', end_date: '2027-12-31' });
    expect(
      renewDeptAdminSchema.safeParse({
        start_date: '2027-01-01',
        end_date: '2027-12-31',
        user_id: USER,
      }).success,
    ).toBe(false);
  });

  it('list query filters coerce and unknown keys are rejected', () => {
    expect(
      deptAdminTermListQuerySchema.parse({ department_id: '2', is_current: 'true', user_id: USER }),
    ).toEqual({ page: 1, limit: 20, department_id: 2, is_current: true, user_id: USER });
    expect(deptAdminTermListQuerySchema.safeParse({ role: 'dept_admin' }).success).toBe(false);
  });
});

describe('mappers', () => {
  const NOW = new Date('2026-11-12T08:00:00.000Z');

  it('toCommitteeEntry exposes the user as id, name and avatar only', () => {
    expect(
      toCommitteeEntry({
        id: 4,
        clubId: 2,
        userId: USER,
        position: 'President',
        termStartYear: 2026,
        termEndYear: 2027,
        isCurrent: true,
        updatedAt: NOW,
        user: { id: USER, name: 'Ayesha', image: null },
      }),
    ).toEqual({
      id: 4,
      club_id: 2,
      position: 'President',
      term_start_year: 2026,
      term_end_year: 2027,
      is_current: true,
      user: { id: USER, name: 'Ayesha', avatar_url: null },
      updated_at: NOW.toISOString(),
    });
  });

  it('toDeptAdminTerm writes DATE columns as YYYY-MM-DD', () => {
    const term = toDeptAdminTerm({
      id: 7,
      userId: USER,
      departmentId: 1,
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2027-10-31T00:00:00.000Z'),
      isCurrent: true,
      createdAt: NOW,
      updatedAt: NOW,
      user: { id: USER, name: 'Dr. Karim', email: 'karim@example.com', image: null },
      department: { id: 1, name: 'CSE' },
    });
    expect(term.start_date).toBe('2026-11-01');
    expect(term.end_date).toBe('2027-10-31');
    expect(term.user).toEqual({
      id: USER,
      name: 'Dr. Karim',
      email: 'karim@example.com',
      avatar_url: null,
    });
  });
});

describe('deptAdminAssignedTemplate', () => {
  it('names the department and dates and escapes HTML', () => {
    const mail = deptAdminAssignedTemplate({
      kind: 'dept-admin-assigned',
      to: 'karim@example.com',
      name: '<b>Karim</b>',
      departmentName: 'CSE',
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      url: 'http://localhost:3000/dashboard',
    });
    expect(mail.subject).toBe('You are the CSE department admin');
    expect(mail.text).toContain('from 2026-11-01 until 2027-10-31');
    expect(mail.html).toContain('&lt;b&gt;Karim&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Karim</b>');
  });
});

describe('AUDIT_ACTIONS', () => {
  it('has the term actions from PRD §20', () => {
    for (const a of [
      'ASSIGN_COMMITTEE_MEMBER',
      'COMMITTEE_MEMBER_UPDATED',
      'END_COMMITTEE_TERM',
      'ASSIGN_DEPT_ADMIN',
      'END_DEPT_ADMIN_TERM',
      'RENEW_DEPT_ADMIN_TERM',
    ] as const) {
      expect(AUDIT_ACTIONS[a]).toBe(a);
    }
  });
});
