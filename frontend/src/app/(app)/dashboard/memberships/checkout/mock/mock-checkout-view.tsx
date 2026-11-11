'use client';

import { m } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormAlert } from '@/components/ui/form-alert';
import { Terminal, TerminalLine } from '@/components/ui/terminal';
import { useSimulatePayment } from '@/hooks/use-memberships';
import type { ApiError } from '@/lib/api';
import { formatBdt } from '@/lib/format';
import { duration } from '@/lib/motion';
import { MEMBERSHIPS_HREF } from '../../../../_components/nav';

const AMOUNT = /^\d{1,8}\.\d{2}$/;

/**
 * Stands in for the SSLCommerz hosted page while there is no merchant account (D32). It sends
 * the IPN the gateway would send, then returns to the same display-only URLs the real gateway
 * uses. The API still settles the payment from its own validation, never from this page.
 */
export function MockCheckoutView() {
  const router = useRouter();
  const search = useSearchParams();
  const tranId = search.get('tran_id') ?? '';
  const amount = search.get('amount') ?? '';
  const simulate = useSimulatePayment();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  if (!tranId || !AMOUNT.test(amount)) {
    return (
      <div className="container-narrow py-8">
        <ErrorState title="This checkout link is incomplete.">
          Start again from your membership page.
        </ErrorState>
      </div>
    );
  }

  function finish(result: 'success' | 'failed' | 'cancelled') {
    setLeaving(true);
    router.replace(`${MEMBERSHIPS_HREF}?checkout=${result}`);
  }

  async function pay(outcome: 'success' | 'failure') {
    setError(null);
    try {
      await simulate.mutateAsync({ tranId, amount, outcome });
      finish(outcome === 'success' ? 'success' : 'failed');
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  const busy = simulate.isPending || leaving;

  return (
    <m.div
      className="container-narrow flex flex-col gap-6 py-8"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base }}
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <h1 className="text-display-sm">Sandbox checkout</h1>
          <Badge variant="warning" className="tracking-wide uppercase">
            Sandbox
          </Badge>
        </div>
        <p className="text-sm text-fg-secondary">
          No real payment happens here. Pick an outcome to finish the checkout the way the payment
          gateway would.
        </p>
      </header>

      <Terminal title="SYS.GATEWAY.MOCK">
        <TerminalLine prompt>gateway --sandbox --pay</TerminalLine>
        <TerminalLine>tran_id {tranId}</TerminalLine>
        <TerminalLine>amount {formatBdt(amount)} BDT</TerminalLine>
      </Terminal>

      {error ? (
        <FormAlert tone="error" title="The gateway call failed.">
          {error}
        </FormAlert>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" disabled={busy} onClick={() => finish('cancelled')}>
          Cancel payment
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void pay('failure')}>
          Simulate failure
        </Button>
        <Button disabled={busy} onClick={() => void pay('success')}>
          {simulate.isPending ? 'Paying…' : 'Simulate payment success'}
        </Button>
      </div>
    </m.div>
  );
}
