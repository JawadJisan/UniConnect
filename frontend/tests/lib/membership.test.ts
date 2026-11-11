import type { MembershipStatus, MembershipSummary } from '@uniconnect/shared';
import {
  addDays,
  currentMembership,
  daysLeft,
  formatDaysLeft,
  membershipActions,
  todayInDhaka,
} from '@/lib/membership';
import { mockValId } from '@/lib/mock-gateway';

const row = (id: number, status: MembershipStatus, clubId = 3): MembershipSummary => ({
  id,
  type: 'monthly',
  status,
  start_date: '2026-11-11',
  end_date: '2026-12-10',
  created_at: '2026-11-11T08:00:00.000Z',
  club: { id: clubId, name: 'Club', logo_url: null, department: { id: 1, name: 'CSE' } },
  payment: null,
});

describe('currentMembership', () => {
  it('picks the active, scheduled and pending rows of one club, and the newest row', () => {
    const list = [row(4, 'pending'), row(3, 'scheduled'), row(2, 'active'), row(1, 'expired')];
    const state = currentMembership(list, 3);
    expect(state.active?.id).toBe(2);
    expect(state.scheduled?.id).toBe(3);
    expect(state.pending?.id).toBe(4);
    expect(state.latest?.id).toBe(4);
  });

  it('ignores rows of another club', () => {
    expect(currentMembership([row(1, 'active', 9)], 3)).toEqual({
      active: undefined,
      scheduled: undefined,
      pending: undefined,
      latest: undefined,
    });
  });
});

describe('membershipActions', () => {
  const actions = (...rows: MembershipSummary[]) => membershipActions(currentMembership(rows));

  it('offers a purchase when nothing is open, even after an expired membership', () => {
    expect(actions()).toEqual({ purchase: true });
    expect(actions(row(1, 'expired')).purchase).toBe(true);
    expect(actions(row(1, 'cancelled')).purchase).toBe(true);
  });

  it('offers Renew and Cancel while active with nothing queued', () => {
    const a = actions(row(1, 'active'));
    expect(a.purchase).toBe(false);
    expect(a.renewFrom?.id).toBe(1);
    expect(a.cancel?.id).toBe(1);
  });

  it('offers no Renew once a renewal is scheduled or a checkout is open', () => {
    expect(actions(row(2, 'scheduled'), row(1, 'active')).renewFrom).toBeUndefined();
    expect(actions(row(2, 'pending'), row(1, 'active')).renewFrom).toBeUndefined();
  });

  it('lets a pending checkout be cancelled, and nothing bought meanwhile', () => {
    const a = actions(row(1, 'pending'));
    expect(a.purchase).toBe(false);
    expect(a.cancelCheckout?.id).toBe(1);
    expect(a.cancel).toBeUndefined();
  });

  it('cancels the scheduled row when there is no active one', () => {
    expect(actions(row(1, 'scheduled')).cancel?.id).toBe(1);
  });
});

describe('dates', () => {
  it('counts whole days to the last day', () => {
    expect(daysLeft('2026-12-10', '2026-11-11')).toBe(29);
    expect(daysLeft('2026-11-11', '2026-11-11')).toBe(0);
    expect(daysLeft('2026-11-10', '2026-11-11')).toBe(-1);
  });

  it('words the time left', () => {
    expect(formatDaysLeft(12)).toBe('12 days');
    expect(formatDaysLeft(1)).toBe('1 day');
    expect(formatDaysLeft(0)).toBe('Ends today');
    expect(formatDaysLeft(-2)).toBe('Ended');
  });

  it('adds days across month and leap-year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('uses the Bangladesh calendar date', () => {
    expect(todayInDhaka(new Date('2026-11-11T19:00:00Z'))).toBe('2026-11-12');
  });
});

describe('mockValId', () => {
  it('matches the format the backend mock gateway decodes (D32)', () => {
    expect(mockValId('UC-20261111-ABC', '500.00', 'success')).toBe(
      'MOCK-VALID-UC-20261111-ABC-500.00-BDT',
    );
    expect(mockValId('UC-20261111-ABC', '500.00', 'failure')).toBe('MOCK-FAILED-UC-20261111-ABC');
  });
});
