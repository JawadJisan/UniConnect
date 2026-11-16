import type { BloodRequestStatus } from '@uniconnect/shared';
import { DropletIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DONATION_STATUS_META,
  formatBloodGroup,
  REQUEST_STATUS_META,
  spokenBloodGroup,
} from '@/lib/blood';
import type { StatusMeta } from '@/lib/membership';

/**
 * The blood group as metadata (DESIGN.md §7, D41): an `outline` mono badge with a droplet,
 * never red, because red means status. Screen readers hear "Blood group O negative".
 */
export function BloodGroupBadge({ group }: { group: string }) {
  return (
    <Badge variant="outline" aria-label={`Blood group ${spokenBloodGroup(group)}`}>
      <DropletIcon data-icon="inline-start" aria-hidden="true" />
      <span aria-hidden="true">{formatBloodGroup(group)}</span>
    </Badge>
  );
}

/** One status per row: an icon plus the word in uppercase mono (user request, D41). */
function UpperBadge({ meta }: { meta: StatusMeta }) {
  const { label, variant, Icon } = meta;
  return (
    <Badge variant={variant} className="tracking-wide uppercase">
      <Icon data-icon="inline-start" aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function BloodRequestStatusBadge({ status }: { status: BloodRequestStatus }) {
  return <UpperBadge meta={REQUEST_STATUS_META[status]} />;
}

export function DonationStatusBadge({ verified }: { verified: boolean }) {
  return (
    <UpperBadge meta={verified ? DONATION_STATUS_META.verified : DONATION_STATUS_META.pending} />
  );
}
