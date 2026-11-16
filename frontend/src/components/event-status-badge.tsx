import type { EventRegistrationStatus, EventStatus } from '@uniconnect/shared';
import { Badge } from '@/components/ui/badge';
import { EVENT_STATUS_META, REGISTRATION_STATUS_META, type StatusMeta } from '@/lib/events';

/**
 * One status per row (DESIGN.md §7): an icon plus the word in uppercase mono, so the meaning
 * never rests on colour. Uppercase for events and registrations was asked for by the user (§11).
 */
function UpperBadge({ meta }: { meta: StatusMeta }) {
  const { label, variant, Icon } = meta;
  return (
    <Badge variant={variant} className="tracking-wide uppercase">
      <Icon data-icon="inline-start" aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <UpperBadge meta={EVENT_STATUS_META[status]} />;
}

export function RegistrationStatusBadge({ status }: { status: EventRegistrationStatus }) {
  return <UpperBadge meta={REGISTRATION_STATUS_META[status]} />;
}
