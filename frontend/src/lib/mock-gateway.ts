/**
 * The mock payment gateway's `val_id` (DECISIONS D32). In development the backend's
 * `PAYMENT_GATEWAY=mock` "validates" a payment by decoding this value, so the mock checkout page
 * can complete the loop the real SSLCommerz IPN would. Keep it in step with
 * `backend/src/lib/payments/mock.gateway.ts`.
 *
 *   success → MOCK-VALID-<tran_id>-<amount>-BDT
 *   failure → MOCK-FAILED-<tran_id>
 */
export function mockValId(tranId: string, amount: string, outcome: 'success' | 'failure'): string {
  return outcome === 'success' ? `MOCK-VALID-${tranId}-${amount}-BDT` : `MOCK-FAILED-${tranId}`;
}
