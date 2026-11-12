import type {
  EventRegistration,
  EventStatus,
  EventSummary,
  EventVisibility,
  MyRegistration,
} from '@uniconnect/shared';
import type { EventRow } from './event.repository.js';
import type { MyRegistrationRow, RegistrationRow } from './registration.repository.js';

export function toEventSummary(row: EventRow): EventSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    organizer_club: { id: row.organizerClub.id, name: row.organizerClub.name },
    visibility: row.visibility as EventVisibility,
    is_paid: row.isPaid,
    // Decimal → "200.00"; never through a float.
    fee_amount: row.feeAmount === null ? null : row.feeAmount.toFixed(2),
    start_date: row.startDate.toISOString(),
    end_date: row.endDate.toISOString(),
    venue: row.venue,
    max_attendees: row.maxAttendees,
    poster_image_url: row.posterImageUrl,
    status: row.status as EventStatus,
    departments: row.departments.map((d) => ({ id: d.department.id, name: d.department.name })),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toEventRegistration(row: RegistrationRow): EventRegistration {
  return {
    id: row.id,
    status: row.status as EventRegistration['status'],
    registered_at: row.registeredAt.toISOString(),
    checked_in_at: row.checkedInAt?.toISOString() ?? null,
    cancelled_at: row.cancelledAt?.toISOString() ?? null,
    user: {
      id: row.user.id,
      name: row.user.name,
      avatar_url: row.user.image,
      student_id: row.user.studentId,
      department: row.user.department,
    },
  };
}

export function toMyRegistration(row: MyRegistrationRow): MyRegistration {
  return {
    id: row.id,
    status: row.status as MyRegistration['status'],
    registered_at: row.registeredAt.toISOString(),
    checked_in_at: row.checkedInAt?.toISOString() ?? null,
    cancelled_at: row.cancelledAt?.toISOString() ?? null,
    event: toEventSummary(row.event),
  };
}

const CSV_COLUMNS = [
  'registration_id',
  'name',
  'student_id',
  'department',
  'status',
  'registered_at',
  'checked_in_at',
] as const;

/**
 * One CSV cell. Quotes are doubled, and a cell a spreadsheet would read as a formula
 * (`= + - @`, tab, CR) gets a leading `'` (CSV injection).
 */
export function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text;
}

/** FR-EVENT-011 `?format=csv`: the same columns as the JSON list, no email. */
export function registrationsCsv(rows: EventRegistration[]): string {
  const lines = rows.map((r) =>
    [
      r.id,
      r.user.name,
      r.user.student_id,
      r.user.department?.name ?? null,
      r.status,
      r.registered_at,
      r.checked_in_at,
    ]
      .map(csvCell)
      .join(','),
  );
  return [CSV_COLUMNS.join(','), ...lines].join('\r\n') + '\r\n';
}
