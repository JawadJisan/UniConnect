import type { ClubSummary } from '@uniconnect/shared';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatBdt } from '@/lib/format';
import { ClubLogo } from './club-logo';

/** A fee as shown everywhere: "৳500.00" in mono, or "Not set". */
export function Fee({ amount }: { amount: string | null }) {
  return amount === null ? (
    <span className="text-fg-tertiary">Not set</span>
  ) : (
    <span className="font-mono text-foreground tabular-nums">{formatBdt(amount)}</span>
  );
}

/** One directory cell: the whole card is a link to the club's page. */
export function ClubCard({ club, own }: { club: ClubSummary; own: boolean }) {
  return (
    <Link
      href={`/dashboard/clubs/${club.id}`}
      className="group/club flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-colors duration-(--duration-fast) hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      <div className="flex min-w-0 items-start gap-3">
        <ClubLogo name={club.name} src={club.logo_url} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate text-md leading-snug font-medium tracking-tight">{club.name}</h2>
          <p className="flex flex-wrap items-center gap-2">
            <span className="micro-label">{club.department.name}</span>
            {own ? <Badge variant="secondary">Your department</Badge> : null}
          </p>
        </div>
      </div>
      <p className="line-clamp-2 text-sm text-fg-secondary">
        {club.description ?? <span className="text-fg-tertiary">No description yet.</span>}
      </p>
      <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
        <div className="flex flex-col gap-1">
          <dt className="micro-label">FEE.MONTHLY</dt>
          <dd>
            <Fee amount={club.membership_fee_monthly} />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="micro-label">FEE.YEARLY</dt>
          <dd>
            <Fee amount={club.membership_fee_yearly} />
          </dd>
        </div>
      </dl>
    </Link>
  );
}
