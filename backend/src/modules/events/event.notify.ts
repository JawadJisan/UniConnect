import { env } from '../../config/env.js';
import { todayInDhaka } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { enqueueEmail } from '../../queues/email.queue.js';
import type { NotifyEventJob } from '../../queues/event.queue.js';
import { eventRepository } from './event.repository.js';

/** Recipients per page. Each page is saved as the job's cursor before the next. */
export const FAN_OUT_PAGE = 500;

/**
 * The publish and cancel fan-out (FR-EVENT-003, -005; DECISIONS D36). Queues one email per
 * recipient with a per-recipient job id, and reports the cursor after each page so a retried
 * job resumes instead of starting over. Returns how many emails it queued.
 */
export async function fanOutEventEmails(
  job: NotifyEventJob,
  saveCursor: (cursor: string) => Promise<void>,
): Promise<number> {
  const event = await eventRepository.findById(prisma, job.eventId);
  // The event moved on before the job ran (published, then cancelled): send nothing stale.
  const expected = job.kind === 'published' ? 'published' : 'cancelled';
  if (!event || event.status !== expected) return 0;

  const kind = job.kind === 'published' ? 'event-published' : 'event-cancelled';
  const today = todayInDhaka();
  let cursor = job.cursor ?? null;
  let queued = 0;
  for (;;) {
    const page =
      job.kind === 'published'
        ? await eventRepository.publishRecipients(
            prisma,
            event.id,
            event.visibility === 'members_only',
            today,
            cursor,
            FAN_OUT_PAGE,
          )
        : await eventRepository.cancelRecipients(prisma, event.id, cursor, FAN_OUT_PAGE);
    if (page.length === 0) return queued;

    for (const user of page) {
      await enqueueEmail(
        {
          kind,
          to: user.email,
          name: user.name,
          title: event.title,
          clubName: event.organizerClub.name,
          startDate: event.startDate.toISOString(),
          venue: event.venue,
          url: `${env.FRONTEND_ORIGIN}/dashboard/events/${event.id}`,
        },
        { jobId: `${kind}-${event.id}-${user.id}` },
      );
      queued += 1;
    }
    cursor = page[page.length - 1]!.id;
    await saveCursor(cursor);
    if (page.length < FAN_OUT_PAGE) return queued;
  }
}
