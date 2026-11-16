import { canPinRole, canPost, createScopeOptions, scopeLabel } from '@/lib/announcements';
import { formatRelative } from '@/lib/format';

const CSE = { id: 1, name: 'CSE' };
const EEE = { id: 2, name: 'EEE' };
const CSE_CLUB = { id: 3, name: 'CSE Club' };
const EEE_CLUB = { id: 4, name: 'EEE Club' };
const base = {
  department: CSE,
  myClub: CSE_CLUB,
  clubs: [CSE_CLUB, EEE_CLUB],
  departments: [CSE, EEE],
};

describe('createScopeOptions (D38)', () => {
  it('locks a moderator to their club', () => {
    expect(createScopeOptions({ ...base, role: 'moderator' })).toEqual({
      departments: [],
      clubs: [CSE_CLUB],
    });
  });

  it('gives a dept admin their department and its club', () => {
    expect(createScopeOptions({ ...base, role: 'dept_admin' })).toEqual({
      departments: [CSE],
      clubs: [CSE_CLUB],
    });
  });

  it('gives a super admin every department and club', () => {
    expect(createScopeOptions({ ...base, role: 'super_admin', department: null })).toEqual({
      departments: [CSE, EEE],
      clubs: [CSE_CLUB, EEE_CLUB],
    });
  });

  it('offers nothing to students and faculty, or when the club is missing', () => {
    expect(createScopeOptions({ ...base, role: 'student' })).toEqual({
      departments: [],
      clubs: [],
    });
    expect(createScopeOptions({ ...base, role: 'faculty' })).toEqual({
      departments: [],
      clubs: [],
    });
    expect(createScopeOptions({ ...base, role: 'moderator', myClub: null })).toEqual({
      departments: [],
      clubs: [],
    });
  });

  it('matches the API on who posts and who pins', () => {
    expect(
      ['student', 'faculty', 'moderator', 'dept_admin', 'super_admin'].map((r) => [
        canPost(r as never),
        canPinRole(r as never),
      ]),
    ).toEqual([
      [false, false],
      [false, false],
      [true, false],
      [true, true],
      [true, true],
    ]);
  });
});

describe('scopeLabel', () => {
  it('names the club or the department', () => {
    expect(scopeLabel({ scope: 'club', club: CSE_CLUB, department: null })).toBe('CLUB · CSE Club');
    expect(scopeLabel({ scope: 'department', club: null, department: CSE })).toBe(
      'DEPARTMENT · CSE',
    );
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-11-14T12:00:00.000Z');
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();

  it.each([
    [10, 'just now'],
    [5 * 60, '5 minutes ago'],
    [3 * 3600, '3 hours ago'],
    [86_400, 'yesterday'],
    [3 * 86_400, '3 days ago'],
    [14 * 86_400, '2 weeks ago'],
    [65 * 86_400, '2 months ago'],
    [400 * 86_400, 'last year'],
  ])('%i seconds → %s', (seconds, expected) => {
    expect(formatRelative(ago(seconds), now)).toBe(expected);
  });

  it('reads future times and ignores bad input', () => {
    expect(formatRelative(ago(-2 * 3600), now)).toBe('in 2 hours');
    expect(formatRelative('not a date', now)).toBe('');
  });
});
