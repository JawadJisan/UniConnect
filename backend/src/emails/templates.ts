import type { Mail } from '../lib/mailer.js';
import type { EmailJob } from '../queues/email.queue.js';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

function layout(heading: string, body: string, actionLabel: string, url: string, note: string) {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#1a1927;max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${escape(heading)}</h1>
<p>${escape(body)}</p>
<p><a href="${escape(url)}" style="display:inline-block;background:#5b57e8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escape(actionLabel)}</a></p>
<p style="color:#5f5d73;font-size:13px">${escape(note)}</p>
<p style="color:#5f5d73;font-size:13px">If the button doesn't work, paste this link into your browser:<br>${escape(url)}</p>
</body></html>`;
}

export function verifyEmailTemplate(to: string, name: string, url: string): Mail {
  const note =
    'This link expires in 24 hours. If you did not create a UniConnect account, ignore this email.';
  return {
    to,
    subject: 'Verify your UniConnect email',
    text: `Hi ${name},\n\nConfirm your email to finish creating your UniConnect account:\n${url}\n\n${note}`,
    html: layout(
      `Hi ${name}, confirm your email`,
      'Confirm your email address to finish creating your UniConnect account.',
      'Verify email',
      url,
      note,
    ),
  };
}

export function resetPasswordTemplate(to: string, name: string, url: string): Mail {
  const note =
    'This link expires in 1 hour and works once. If you did not ask to reset your password, ignore this email.';
  return {
    to,
    subject: 'Reset your UniConnect password',
    text: `Hi ${name},\n\nUse this link to choose a new password:\n${url}\n\n${note}`,
    html: layout(
      `Hi ${name}, reset your password`,
      'Use the button below to choose a new password. Signing in again will be required on every device.',
      'Reset password',
      url,
      note,
    ),
  };
}

type ReceiptJob = Extract<EmailJob, { kind: 'membership-receipt' }>;

/** Payment receipt. Amounts arrive as strings ("500.00") and are printed as-is. */
export function membershipReceiptTemplate(job: ReceiptJob): Mail {
  const period = job.type === 'yearly' ? 'Yearly' : 'Monthly';
  const when =
    job.status === 'scheduled'
      ? `Your renewal starts on ${job.startDate}, the day after your current membership ends, and runs until ${job.endDate}.`
      : `Your membership is active from ${job.startDate} until ${job.endDate}.`;
  const lines = [
    `Club: ${job.clubName}`,
    `Plan: ${period}`,
    `Amount paid: ${job.currency} ${job.amount}`,
    `Transaction ID: ${job.transactionId}`,
  ];
  const note = 'Keep this email as your receipt. Memberships are not refundable.';
  return {
    to: job.to,
    subject: `Payment received: ${job.clubName} membership`,
    text: `Hi ${job.name},\n\nThank you for your payment. ${when}\n\n${lines.join('\n')}\n\nView your memberships: ${job.url}\n\n${note}`,
    html: layout(
      `Hi ${job.name}, your payment is confirmed`,
      `${when} ${lines.join(' · ')}`,
      'View my memberships',
      job.url,
      note,
    ),
  };
}

type DeptAdminJob = Extract<EmailJob, { kind: 'dept-admin-assigned' }>;

/** Sent after a dept admin term is committed (PRD FR-ADMIN-001). */
export function deptAdminAssignedTemplate(job: DeptAdminJob): Mail {
  const body = `You are now the department admin of ${job.departmentName}, from ${job.startDate} until ${job.endDate}.`;
  const note = 'If you think this is a mistake, contact the university super admin.';
  return {
    to: job.to,
    subject: `You are the ${job.departmentName} department admin`,
    text: `Hi ${job.name},

${body}

Open your dashboard: ${job.url}

${note}`,
    html: layout(
      `Hi ${job.name}, you are a department admin`,
      body,
      'Open dashboard',
      job.url,
      note,
    ),
  };
}

type EventJob = Extract<
  EmailJob,
  { kind: 'event-published' | 'event-cancelled' | 'event-registered' | 'event-reminder' }
>;

/** "Tue, 1 Dec 2026, 4:00 pm" in Asia/Dhaka, the university's time zone. */
export function formatDhakaDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

const EVENT_COPY = {
  'event-published': {
    subject: (t: string) => `New event: ${t}`,
    heading: 'there is a new event for you',
    lead: (j: EventJob) => `${j.clubName} published "${j.title}".`,
    action: 'View event',
    note: 'You get this because the event is open to your department.',
  },
  'event-cancelled': {
    subject: (t: string) => `Cancelled: ${t}`,
    heading: 'an event you registered for was cancelled',
    lead: (j: EventJob) => `${j.clubName} cancelled "${j.title}".`,
    action: 'View event',
    note: 'Your registration needs no action.',
  },
  'event-registered': {
    subject: (t: string) => `You are registered: ${t}`,
    heading: 'you are registered',
    lead: (j: EventJob) => `You are registered for "${j.title}" by ${j.clubName}.`,
    action: 'View event',
    note: 'You can cancel your registration from the event page before it starts.',
  },
  'event-reminder': {
    // PRD §22 email table: "Reminder: {event_title} is tomorrow".
    subject: (t: string) => `Reminder: ${t} is tomorrow`,
    heading: 'your event is tomorrow',
    lead: (j: EventJob) => `"${j.title}" by ${j.clubName} is coming up.`,
    action: 'View event',
    note: "Can't make it? Cancel your registration from the event page so someone else can take the seat.",
  },
} as const;

/** FR-EVENT-003, -005, -007 and the reminder. Event text is the organizers'; layout() escapes it. */
export function eventTemplate(job: EventJob): Mail {
  const copy = EVENT_COPY[job.kind];
  const when = formatDhakaDateTime(job.startDate);
  const body = `${copy.lead(job)} Starts ${when}${job.venue ? ` at ${job.venue}` : ''}.`;
  return {
    to: job.to,
    subject: copy.subject(job.title),
    text: `Hi ${job.name},

${body}

${copy.action}: ${job.url}

${copy.note}`,
    html: layout(`Hi ${job.name}, ${copy.heading}`, body, copy.action, job.url, copy.note),
  };
}
