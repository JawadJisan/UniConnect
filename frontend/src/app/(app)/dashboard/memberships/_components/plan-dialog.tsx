'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  MEMBERSHIP_TYPES,
  membershipTypeSchema,
  type ClubDetail,
  type MembershipSummary,
  type MembershipType,
} from '@uniconnect/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/form-alert';
import { useStartCheckout } from '@/hooks/use-memberships';
import type { ApiError } from '@/lib/api';
import { goToCheckout } from '@/lib/checkout-redirect';
import { formatBdt, formatDate } from '@/lib/format';
import { addDays, PLAN_LABEL, todayInDhaka } from '@/lib/membership';
import { cn } from '@/lib/utils';

export type PlanDialogMode = { kind: 'purchase' } | { kind: 'renew'; from: MembershipSummary };

const formSchema = z.object({ type: membershipTypeSchema });
type Values = z.infer<typeof formSchema>;

const FEE_TERM: Record<MembershipType, string> = {
  monthly: 'FEE.MONTHLY',
  yearly: 'FEE.YEARLY',
};
const PERIOD: Record<MembershipType, string> = {
  monthly: 'One month',
  yearly: 'One year',
};

/**
 * Pick a plan, then go to payment (PRD FR-MEM-001, 002). The plans are native radios, so arrow
 * keys move between them and Enter submits. A plan whose fee isn't set can't be picked.
 */
export function PlanDialog({
  club,
  mode,
  open,
  onOpenChange,
}: {
  club: ClubDetail;
  mode: PlanDialogMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fees: Record<MembershipType, string | null> = {
    monthly: club.membership_fee_monthly,
    yearly: club.membership_fee_yearly,
  };
  const preferred: MembershipType =
    mode.kind === 'renew' && fees[mode.from.type]
      ? mode.from.type
      : fees.monthly
        ? 'monthly'
        : 'yearly';

  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: { type: preferred },
  });
  const checkout = useStartCheckout();
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // An early renewal starts the day after the current one ends; anything else starts today.
  const startsOn =
    mode.kind === 'renew' && mode.from.status === 'active'
      ? addDays(mode.from.end_date, 1)
      : todayInDhaka();

  const submit = form.handleSubmit(async ({ type }) => {
    setError(null);
    try {
      const result = await checkout.mutateAsync(
        mode.kind === 'renew'
          ? { kind: 'renew', membershipId: mode.from.id, type }
          : { kind: 'purchase', clubId: club.id, type },
      );
      setRedirecting(true);
      goToCheckout(result.redirect_url);
    } catch (err) {
      const e = err as ApiError;
      // 409s (a checkout in progress, already a member, fee not set) and 502 carry a message
      // written for the student; anything else gets a generic retry line.
      setError(
        e.status === 409 || e.status === 502 || e.status === 403
          ? e.message
          : "Couldn't start the checkout. Try again.",
      );
    }
  });

  const busy = checkout.isPending || redirecting;
  const title = mode.kind === 'renew' ? 'Renew your membership' : `Join ${club.name}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {mode.kind === 'renew' && mode.from.status === 'active'
                ? `Your renewal starts on ${formatDate(startsOn)}, the day after your current membership ends.`
                : 'Your membership starts as soon as the payment is confirmed. Memberships are not refundable.'}
            </DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Plan</legend>
            {MEMBERSHIP_TYPES.map((type) => {
              const fee = fees[type];
              const id = `plan-${type}`;
              return (
                <label
                  key={type}
                  htmlFor={id}
                  className={cn(
                    'flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-surface-1 p-3 transition-colors duration-(--duration-fast)',
                    'hover:border-border-strong has-checked:border-brand has-checked:bg-brand-tint',
                    'has-focus-visible:ring-2 has-focus-visible:ring-ring',
                    'has-disabled:cursor-not-allowed has-disabled:opacity-60',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{PLAN_LABEL[type]}</span>
                    <input
                      id={id}
                      type="radio"
                      value={type}
                      disabled={!fee || busy}
                      className="size-4 accent-brand"
                      {...form.register('type')}
                    />
                  </span>
                  <span className="micro-label">{FEE_TERM[type]}</span>
                  <span className="font-mono text-lg">{fee ? formatBdt(fee) : 'Not set'}</span>
                  <span className="text-xs text-fg-tertiary">
                    {fee ? PERIOD[type] : 'Your department admin has not set this fee.'}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {error ? (
            <FormAlert tone="error" title="The checkout didn't start.">
              {error}
            </FormAlert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Redirecting…' : 'Continue to payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
