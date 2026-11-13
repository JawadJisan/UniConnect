import type { EventSummary } from '@uniconnect/shared';
import { ArrowLeftIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { initials } from '@/components/ui/avatar';
import { formatBdt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EVENTS_HREF } from '../../../_components/nav';

/** Page frame for every events page and its loading and error states. */
export function EventsPage({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={cn(narrow ? 'container-narrow' : 'container-wide', 'flex flex-col gap-6 py-8')}>
      {children}
    </div>
  );
}

export function BackLink({ href = EVENTS_HREF, label = 'All events' }) {
  return (
    <Link
      href={href}
      className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 w-fit' })}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      {label}
    </Link>
  );
}

/**
 * Shown when a typed URL leads to a page the role can't use. The sidebar never links there,
 * and the API refuses regardless; this only keeps the page from looking broken.
 */
export function EventsNoAccess({ reason }: { reason: string }) {
  return (
    <EventsPage>
      <FormAlert tone="error" title="You don't have access to this page." className="max-w-xl">
        {reason}
        <Link
          href={EVENTS_HREF}
          className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
        >
          Browse events
        </Link>
      </FormAlert>
    </EventsPage>
  );
}

/** "Free", or "৳200.00" with the note that it is paid at the venue (PRD #16). */
export function EventFee({ event }: { event: Pick<EventSummary, 'is_paid' | 'fee_amount'> }) {
  if (!event.is_paid || event.fee_amount === null) {
    return <span className="text-foreground">Free</span>;
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-mono text-foreground tabular-nums">{formatBdt(event.fee_amount)}</span>
      <span className="text-xs text-fg-tertiary">paid at the venue</span>
    </span>
  );
}

/**
 * The poster, or the organizer club's initials on surface-2 when there is none. Decorative:
 * the title always sits next to it.
 */
export function EventPoster({
  event,
  className,
  fit = 'cover',
  sizes,
}: {
  event: Pick<EventSummary, 'poster_image_url' | 'organizer_club'>;
  className?: string;
  fit?: 'cover' | 'contain';
  sizes: string;
}) {
  return (
    <div
      className={cn(
        'relative flex aspect-video items-center justify-center overflow-hidden bg-surface-2',
        className,
      )}
    >
      {event.poster_image_url ? (
        // Cloudinary already delivers a sized, compressed image.
        <Image
          src={event.poster_image_url}
          alt=""
          fill
          unoptimized
          sizes={sizes}
          className={fit === 'cover' ? 'object-cover' : 'object-contain'}
        />
      ) : (
        <span aria-hidden="true" className="font-mono text-lg text-fg-tertiary">
          {initials(event.organizer_club.name)}
        </span>
      )}
    </div>
  );
}

/** Parses a route id; anything but a positive integer reads as "doesn't exist". */
export function parseId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
