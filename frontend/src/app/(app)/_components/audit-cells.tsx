import type { AuditLogEntry } from '@uniconnect/shared';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABEL } from './nav';
import { actionLabel } from '@/lib/audit';

// Pieces of an audit row (PRD FR-AUDIT-002), shared by the audit log viewer and the super
// admin overview. The actor is name and role only; the API never sends an email.

export function ActionBadge({ action }: { action: string }) {
  return (
    <Badge variant="secondary" className="max-w-full font-mono" title={actionLabel(action)}>
      <span className="truncate">{action}</span>
    </Badge>
  );
}

/** "Nadia Islam · Moderator", or "System" for a scheduled job's row. */
export function ActorLabel({ actor }: { actor: AuditLogEntry['actor'] }) {
  if (!actor) return <span className="text-fg-tertiary italic">System</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate text-foreground">{actor.name}</span>
      <Badge variant="outline" className="shrink-0">
        {ROLE_LABEL[actor.role]}
      </Badge>
    </span>
  );
}

/** "Event #42", "User", or a dash when the row names no entity. */
export function entityText(entry: Pick<AuditLogEntry, 'entity_type' | 'entity_id'>): string {
  if (!entry.entity_type) return '—';
  return entry.entity_id ? `${entry.entity_type} #${entry.entity_id}` : entry.entity_type;
}
