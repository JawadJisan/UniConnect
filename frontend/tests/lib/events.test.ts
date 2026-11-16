import {
  canOrganize,
  dhakaInputValue,
  formatEventWhen,
  fromDhakaInput,
  isFull,
  seatsText,
} from '@/lib/events';

describe('Dhaka datetime inputs', () => {
  it('shows a UTC instant as Dhaka wall time (UTC+6)', () => {
    expect(dhakaInputValue('2026-11-20T08:00:00.000Z')).toBe('2026-11-20T14:00');
    expect(dhakaInputValue('2026-11-20T20:30:00.000Z')).toBe('2026-11-21T02:30');
    expect(dhakaInputValue('not a date')).toBe('');
  });

  it('reads an input value as Dhaka time, whatever the browser zone', () => {
    const iso = fromDhakaInput('2026-11-20T14:00');
    expect(iso).toBe('2026-11-20T14:00:00+06:00');
    expect(new Date(iso).toISOString()).toBe('2026-11-20T08:00:00.000Z');
  });

  it('round-trips', () => {
    const value = '2027-01-01T00:15';
    expect(dhakaInputValue(new Date(fromDhakaInput(value)).toISOString())).toBe(value);
  });
});

describe('formatEventWhen', () => {
  it('collapses a same-day event to one date', () => {
    expect(formatEventWhen('2026-11-20T08:00:00Z', '2026-11-20T11:00:00Z')).toBe(
      '20 Nov 2026, 14:00–17:00',
    );
  });

  it('shows both dates across days (in Dhaka time)', () => {
    expect(formatEventWhen('2026-11-20T15:00:00Z', '2026-11-20T19:00:00Z')).toBe(
      '20 Nov 2026, 21:00 – 21 Nov 2026, 01:00',
    );
  });
});

describe('seats', () => {
  it('shows taken / cap, or a count without a cap', () => {
    expect(seatsText(12, 40)).toBe('12 / 40');
    expect(seatsText(3, null)).toBe('3 registered');
  });

  it('is full only with a cap that is reached', () => {
    expect(isFull(3, 3)).toBe(true);
    expect(isFull(2, 3)).toBe(false);
    expect(isFull(500, null)).toBe(false);
  });
});

describe('canOrganize', () => {
  it.each([
    ['student', false],
    ['faculty', false],
    ['moderator', true],
    ['dept_admin', true],
    ['super_admin', true],
  ] as const)('%s → %s', (role, expected) => {
    expect(canOrganize(role)).toBe(expected);
  });
});
