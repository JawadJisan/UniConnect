import { describe, expect, it, jest } from '@jest/globals';
import {
  createEventSchema,
  eventListQuerySchema,
  eventRegistrationsQuerySchema,
  updateEventSchema,
} from '@uniconnect/shared';

// Pure rules of the events module (PRD FR-EVENT, DECISIONS D36): request schemas, the access
// rules, the registration gate, the CSV export and the email template. Locks, SQL visibility
// and the capacity cap run against the real database in tests/integration/events.int.test.ts
// and event-registrations.int.test.ts.

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));

const { canManageWith, canSeeWith, isEligibleWith } =
  await import('../src/modules/events/event.access.js');
const { registerBlock } = await import('../src/modules/events/event.service.js');
const { csvCell, registrationsCsv, toEventSummary } =
  await import('../src/modules/events/event.mapper.js');
const { eventTemplate, formatDhakaDateTime } = await import('../src/emails/templates.js');
const { Prisma } = await import('../src/generated/prisma/client.js');

const START = '2030-01-10T10:00:00+06:00';
const END = '2030-01-10T14:00:00+06:00';

describe('createEventSchema', () => {
  const valid = {
    title: '  Hackathon  ',
    organizer_club_id: 3,
    start_date: START,
    end_date: END,
    department_ids: [1, 2, 1],
  };

  it('trims, defaults and dedupes the departments', () => {
    expect(createEventSchema.parse(valid)).toEqual({
      title: 'Hackathon',
      organizer_club_id: 3,
      visibility: 'public',
      is_paid: false,
      start_date: START,
      end_date: END,
      department_ids: [1, 2],
    });
  });

  it('needs the end after the start', () => {
    const r = createEventSchema.safeParse({ ...valid, end_date: START });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['end_date']);
  });

  it('needs a fee only when paid, as a 2-decimal string', () => {
    expect(createEventSchema.safeParse({ ...valid, is_paid: true }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, fee_amount: 100 }).success).toBe(false);
    expect(createEventSchema.parse({ ...valid, is_paid: true, fee_amount: 150.5 }).fee_amount).toBe(
      '150.50',
    );
    expect(createEventSchema.safeParse({ ...valid, is_paid: true, fee_amount: -1 }).success).toBe(
      false,
    );
  });

  it('refuses a poster URL, unknown keys, no departments and a time without a zone', () => {
    for (const bad of [
      { ...valid, poster_image_url: 'https://evil.example/x.png' },
      { ...valid, status: 'published' },
      { ...valid, department_ids: [] },
      { ...valid, start_date: '2030-01-10T10:00:00' },
      { ...valid, max_attendees: 0 },
      { ...valid, title: ' ' },
    ]) {
      expect(createEventSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('updateEventSchema', () => {
  it('needs at least one field and allows null to clear', () => {
    expect(updateEventSchema.safeParse({}).success).toBe(false);
    expect(updateEventSchema.parse({ venue: null, max_attendees: null })).toEqual({
      venue: null,
      max_attendees: null,
    });
  });

  it('checks the date order only when both are sent', () => {
    expect(updateEventSchema.safeParse({ end_date: START }).success).toBe(true);
    expect(updateEventSchema.safeParse({ start_date: END, end_date: START }).success).toBe(false);
  });

  it('never accepts the organizer club or status', () => {
    expect(updateEventSchema.safeParse({ organizer_club_id: 2 }).success).toBe(false);
    expect(updateEventSchema.safeParse({ status: 'published' }).success).toBe(false);
  });
});

describe('list queries', () => {
  it('defaults browse to 10 a page and parses booleans', () => {
    expect(eventListQuerySchema.parse({ is_paid: 'false', status: 'upcoming' })).toEqual({
      page: 1,
      limit: 10,
      is_paid: false,
      status: 'upcoming',
    });
    expect(eventListQuerySchema.safeParse({ status: 'archived' }).success).toBe(false);
    expect(eventListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('defaults registrations to JSON', () => {
    expect(eventRegistrationsQuerySchema.parse({}).format).toBe('json');
    expect(eventRegistrationsQuerySchema.safeParse({ format: 'xlsx' }).success).toBe(false);
  });
});

const caller = (role: string, departmentId: number | null = 1) => ({
  id: 'u1',
  role,
  departmentId,
  ip: null,
});

const event = (overrides: Partial<Parameters<typeof canSeeWith>[1]> = {}) => ({
  status: 'published',
  visibility: 'members_only',
  organizerClubId: 10,
  clubDepartmentId: 1,
  departmentIds: [1, 2],
  ...overrides,
});

const NO_FACTS = { seatInOrganizerClub: false, memberOfListedClub: false };

describe('canManageWith (PRD #3)', () => {
  it.each([
    ['super_admin', null, false, true],
    ['dept_admin', 1, false, true],
    ['dept_admin', 2, false, false],
    ['moderator', 1, true, true],
    ['moderator', 1, false, false],
    ['student', 1, true, false],
    ['faculty', 1, false, false],
  ] as const)('%s of dept %s with seat=%s → %s', (role, dept, seat, expected) => {
    expect(canManageWith(caller(role, dept), 1, seat)).toBe(expected);
  });
});

describe('canSeeWith (PRD #7)', () => {
  it('shows drafts to organizers only', () => {
    const draft = event({ status: 'draft', visibility: 'public' });
    expect(canSeeWith(caller('student'), draft, NO_FACTS)).toBe(false);
    expect(canSeeWith(caller('dept_admin', 2), draft, NO_FACTS)).toBe(false);
    expect(canSeeWith(caller('dept_admin', 1), draft, NO_FACTS)).toBe(true);
    expect(canSeeWith(caller('moderator'), draft, { ...NO_FACTS, seatInOrganizerClub: true })).toBe(
      true,
    );
    expect(canSeeWith(caller('super_admin', null), draft, NO_FACTS)).toBe(true);
  });

  it('shows public events to anyone signed in, any department', () => {
    expect(canSeeWith(caller('student', 3), event({ visibility: 'public' }), NO_FACTS)).toBe(true);
  });

  it('needs both halves of the members-only rule', () => {
    const member = { ...NO_FACTS, memberOfListedClub: true };
    expect(canSeeWith(caller('student', 1), event(), member)).toBe(true);
    // Own department not listed, even with a listed club's membership.
    expect(canSeeWith(caller('student', 3), event(), member)).toBe(false);
    // Listed department, no membership.
    expect(canSeeWith(caller('student', 1), event(), NO_FACTS)).toBe(false);
  });

  it('shows members-only events to dept admins of a listed department', () => {
    expect(canSeeWith(caller('dept_admin', 2), event(), NO_FACTS)).toBe(true);
    expect(canSeeWith(caller('dept_admin', 3), event(), NO_FACTS)).toBe(false);
  });

  it('matches isEligibleWith for members', () => {
    expect(isEligibleWith(caller('student', 2), event(), true)).toBe(true);
    expect(isEligibleWith(caller('student', null), event(), true)).toBe(false);
  });
});

describe('registerBlock (FR-EVENT-007)', () => {
  const open = {
    role: 'student',
    status: 'published',
    ended: false,
    visibility: 'public',
    eligible: false,
    myStatus: null,
    seated: 0,
    maxAttendees: null,
  };

  it('allows an open public event', () => {
    expect(registerBlock(open)).toBeNull();
  });

  it('checks in a fixed order', () => {
    expect(registerBlock({ ...open, role: 'super_admin' })).toBe('super_admin');
    expect(registerBlock({ ...open, myStatus: 'registered', status: 'draft' })).toBe(
      'already_registered',
    );
    expect(registerBlock({ ...open, myStatus: 'attended' })).toBe('already_registered');
    expect(registerBlock({ ...open, myStatus: 'no_show' })).toBe('no_show');
    expect(registerBlock({ ...open, myStatus: 'cancelled' })).toBeNull();
    expect(registerBlock({ ...open, status: 'draft' })).toBe('not_open');
    expect(registerBlock({ ...open, ended: true })).toBe('not_open');
    expect(registerBlock({ ...open, visibility: 'members_only' })).toBe('not_eligible');
    expect(registerBlock({ ...open, visibility: 'members_only', eligible: true })).toBeNull();
  });

  it('enforces the hard cap', () => {
    expect(registerBlock({ ...open, maxAttendees: 3, seated: 2 })).toBeNull();
    expect(registerBlock({ ...open, maxAttendees: 3, seated: 3 })).toBe('full');
  });
});

describe('CSV export', () => {
  it('quotes and defuses formula cells', () => {
    expect(csvCell('Ayesha')).toBe('Ayesha');
    expect(csvCell(null)).toBe('');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM')).toBe("'@SUM");
  });

  it('has a header row and no email column', () => {
    const csv = registrationsCsv([
      {
        id: 7,
        status: 'attended',
        registered_at: '2030-01-01T00:00:00.000Z',
        checked_in_at: '2030-01-10T04:05:00.000Z',
        cancelled_at: null,
        user: {
          id: 'u1',
          name: 'Ayesha Rahman',
          avatar_url: null,
          student_id: 'CSE-2022/014',
          department: { id: 1, name: 'CSE' },
        },
      },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'registration_id,name,student_id,department,status,registered_at,checked_in_at',
      '7,Ayesha Rahman,CSE-2022/014,CSE,attended,2030-01-01T00:00:00.000Z,2030-01-10T04:05:00.000Z',
      '',
    ]);
    expect(csv).not.toMatch(/email/i);
  });
});

describe('toEventSummary', () => {
  it('serializes the fee as a string and dates as ISO', () => {
    const at = new Date('2030-01-10T04:00:00.000Z');
    const summary = toEventSummary({
      id: 1,
      title: 'Hackathon',
      description: null,
      organizerClubId: 10,
      visibility: 'public',
      isPaid: true,
      feeAmount: new Prisma.Decimal('150.5'),
      startDate: at,
      endDate: at,
      venue: null,
      maxAttendees: 50,
      posterImageUrl: null,
      status: 'published',
      createdById: 'u1',
      createdAt: at,
      updatedAt: at,
      organizerClub: { id: 10, name: 'CSE Club', departmentId: 1 },
      departments: [{ department: { id: 1, name: 'CSE' } }],
      _count: { registrations: 7 },
    });
    expect(summary.fee_amount).toBe('150.50');
    expect(summary.registered_count).toBe(7);
    expect(summary.start_date).toBe('2030-01-10T04:00:00.000Z');
    expect(summary.organizer_club).toEqual({ id: 10, name: 'CSE Club' });
    expect(summary.departments).toEqual([{ id: 1, name: 'CSE' }]);
  });
});

describe('event emails', () => {
  const job = {
    kind: 'event-published' as const,
    to: 'a@example.com',
    name: 'Ayesha',
    title: '<b>Hack</b> night',
    clubName: 'CSE Club',
    startDate: '2030-01-10T10:00:00.000Z',
    venue: 'Hall 2',
    url: 'http://localhost:3000/dashboard/events/1',
  };

  it('shows the start in Dhaka time', () => {
    // 10:00 UTC is 4:00 pm in Dhaka (UTC+6).
    expect(formatDhakaDateTime(job.startDate)).toMatch(/4:00\s?pm/i);
  });

  it('escapes the organizers’ text in HTML', () => {
    const mail = eventTemplate(job);
    expect(mail.subject).toBe('New event: <b>Hack</b> night');
    expect(mail.html).toContain('&lt;b&gt;Hack&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Hack</b>');
    expect(mail.text).toContain('Hall 2');
  });

  it('words each kind differently', () => {
    expect(eventTemplate({ ...job, kind: 'event-cancelled' }).subject).toMatch(/^Cancelled/);
    expect(eventTemplate({ ...job, kind: 'event-registered' }).subject).toMatch(/registered/);
  });

  it('uses the PRD §22 reminder subject', () => {
    const mail = eventTemplate({ ...job, kind: 'event-reminder' });
    expect(mail.subject).toBe('Reminder: <b>Hack</b> night is tomorrow');
    expect(mail.text).toContain('Cancel your registration');
  });
});
