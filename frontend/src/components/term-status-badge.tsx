import { Badge } from '@/components/ui/badge';
import { TERM_STATUS_META, type TermStatus } from '@/lib/terms';

/**
 * A committee or dept admin term's state: an icon plus the word in uppercase mono, like the
 * membership badge. Uppercase here is the user's choice (DESIGN.md §11).
 */
export function TermStatusBadge({ current }: { current: boolean }) {
  const status: TermStatus = current ? 'current' : 'ended';
  const { label, variant, Icon } = TERM_STATUS_META[status];
  return (
    <Badge variant={variant} className="tracking-wide uppercase">
      <Icon data-icon="inline-start" aria-hidden="true" />
      {label}
    </Badge>
  );
}
