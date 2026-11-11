import type {
  InitSessionInput,
  InitSessionResult,
  OrderValidation,
  PaymentGateway,
} from './payment-gateway.js';

/**
 * A stand-in for SSLCommerz while there is no merchant account (DECISIONS D32). Refused in
 * production by env.ts.
 *
 * `initSession` points the browser at the frontend's mock checkout page. That page (or a test)
 * posts the IPN with a structured `val_id`, which `validateOrder` decodes as if it were the
 * gateway's answer:
 *
 *   MOCK-VALID-<tran_id>-<amount>-<currency>   → status VALID with those values
 *   MOCK-FAILED-<tran_id>                      → status FAILED
 *   anything else                              → status INVALID
 *
 * Because the "validated" amount, currency and tran_id come from the val_id, tests can forge a
 * mismatch and prove the service rejects it, exactly as it must for the real gateway.
 */
export function createMockGateway(frontendOrigin: string): PaymentGateway {
  return {
    name: 'mock',

    async initSession(input: InitSessionInput): Promise<InitSessionResult> {
      const url = new URL('/dashboard/memberships/checkout/mock', frontendOrigin);
      url.searchParams.set('tran_id', input.tranId);
      url.searchParams.set('amount', input.amount);
      return { redirectUrl: url.toString() };
    },

    async validateOrder(valId: string): Promise<OrderValidation> {
      return decodeMockValId(valId);
    },

    async queryTransaction(): Promise<OrderValidation | null> {
      return null;
    },
  };
}

/** `tran_id`s are `UC-<yyyymmdd>-<hex>`, so the amount and currency are the last two parts. */
export function decodeMockValId(valId: string): OrderValidation {
  const invalid = (tranId = ''): OrderValidation => ({
    status: 'INVALID',
    tranId,
    amount: '0.00',
    currency: 'BDT',
    bankTranId: null,
    method: null,
    raw: { gateway: 'mock', val_id: valId, status: 'INVALID' },
  });

  if (valId.startsWith('MOCK-FAILED-')) {
    const tranId = valId.slice('MOCK-FAILED-'.length);
    return {
      ...invalid(tranId),
      status: 'FAILED',
      raw: { gateway: 'mock', val_id: valId, status: 'FAILED' },
    };
  }
  if (!valId.startsWith('MOCK-VALID-')) return invalid();

  const parts = valId.slice('MOCK-VALID-'.length).split('-');
  if (parts.length < 3) return invalid();
  const currency = parts.pop() as string;
  const amount = parts.pop() as string;
  const tranId = parts.join('-');
  return {
    status: 'VALID',
    tranId,
    amount,
    currency,
    bankTranId: `MOCKBANK-${tranId}`,
    method: 'MOCK-CARD',
    raw: { gateway: 'mock', val_id: valId, status: 'VALID', tran_id: tranId, amount, currency },
  };
}
