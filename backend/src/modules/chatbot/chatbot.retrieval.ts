import type { IsoDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { visibleScope } from '../announcements/announcement.access.js';
import {
  announcementRepository,
  type AnnouncementHit,
} from '../announcements/announcement.repository.js';
import { clubRepository, type ClubHit } from '../clubs/club.repository.js';
import type { EventCaller } from '../events/event.access.js';
import { eventRepository, type EventHit } from '../events/event.repository.js';
import { cleanText, formatWhen, toTsQuery, type ContextRecord } from './chatbot.prompt.js';

// Retrieval for FR-AI-001 (DECISIONS D44). Visibility comes first and from each module's own
// rule: events through the browse SQL (D36), announcements through visibleScope (D15), clubs
// unfiltered (every role lists every club). Blood data is never part of the corpus. Every
// text field is PII-stripped here, before anything leaves for Gemini.

export const TOP_K = 5;
const FALLBACK_EVENTS = 3;

const money = (amount: string | null) => (amount ? `BDT ${amount}` : 'not set');

function eventRecord(e: EventHit): ContextRecord {
  const access = e.visibility === 'members_only' ? 'Members only.' : 'Open to everyone.';
  const fee = e.is_paid ? `Fee: ${money(e.fee_amount)}.` : 'Free.';
  return {
    type: 'event',
    id: e.id,
    text: cleanText(
      `Event "${e.title}" by ${e.club_name}. Starts ${formatWhen(e.start_date)}, ends ${formatWhen(
        e.end_date,
      )} (Dhaka time). Venue: ${e.venue ?? 'not set'}. ${access} ${fee} ${e.description ?? ''}`,
    ),
  };
}

function announcementRecord(a: AnnouncementHit): ContextRecord {
  const audience = a.club_name ? `${a.club_name} members` : `${a.department_name} department`;
  return {
    type: 'announcement',
    id: a.id,
    text: cleanText(
      `Announcement "${a.title}" for ${audience}, posted ${formatWhen(a.created_at)}. ${a.content}`,
    ),
  };
}

function clubRecord(c: ClubHit): ContextRecord {
  return {
    type: 'club',
    id: c.id,
    text: cleanText(
      `Club "${c.name}" of the ${c.department_name} department. Membership fee: monthly ${money(
        c.fee_monthly,
      )}, yearly ${money(c.fee_yearly)}. ${c.description ?? ''}`,
    ),
  };
}

/**
 * Up to {@link TOP_K} records the caller may open, best full-text match first across the
 * three sources. With no search word or no match, the soonest upcoming events they can see,
 * so "what's on this week?" still has something to answer from.
 */
export async function retrieve(
  caller: EventCaller,
  question: string,
  today: IsoDate,
  now: Date = new Date(),
): Promise<ContextRecord[]> {
  const tsquery = toTsQuery(question);
  if (tsquery) {
    const scope = await visibleScope(prisma, caller);
    const [events, announcements, clubs] = await Promise.all([
      eventRepository.searchVisible(prisma, caller, tsquery, today, TOP_K),
      announcementRepository.searchVisible(prisma, scope, tsquery, TOP_K),
      clubRepository.search(prisma, tsquery, TOP_K),
    ]);
    const ranked = [
      ...events.map((e) => ({ rank: e.rank, record: eventRecord(e) })),
      ...announcements.map((a) => ({ rank: a.rank, record: announcementRecord(a) })),
      ...clubs.map((c) => ({ rank: c.rank, record: clubRecord(c) })),
    ]
      .sort((x, y) => y.rank - x.rank)
      .slice(0, TOP_K)
      .map((r) => r.record);
    if (ranked.length) return ranked;
  }
  const upcoming = await eventRepository.upcomingVisible(
    prisma,
    caller,
    now,
    today,
    FALLBACK_EVENTS,
  );
  return upcoming.map(eventRecord);
}
