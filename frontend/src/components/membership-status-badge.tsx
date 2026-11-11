import type { MembershipStatus } from '@uniconnect/shared';
import { Badge } from '@/components/ui/badge';
import { STATUS_META } from '@/lib/membership';

/**
 * One status per row (DESIGN.md §7): an icon plus the word in uppercase mono, so the meaning
 * never rests on colour. Uppercase is a membership-only choice made at the user's request (§11).
 */
export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  const { label, variant, Icon } = STATUS_META[status];
  return (
    <Badge variant={variant} className="tracking-wide uppercase">
      <Icon data-icon="inline-start" aria-hidden="true" />
      {label}
    </Badge>
  );
}
