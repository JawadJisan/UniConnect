/**
 * The payment gateway contract (DECISIONS D32). Services depend only on this interface; the
 * provider (the mock now, SSLCommerz later) is picked in ./index.ts from PAYMENT_GATEWAY.
 *
 * Amounts cross this boundary as 2-decimal strings ("500.00"), never JS numbers.
 */

export interface InitSessionInput {
  /** Our transaction id (`tran_id`), unique per checkout. */
  tranId: string;
  amount: string;
  currency: 'BDT';
  productName: string;
  customer: { name: string; email: string; phone: string | null };
  urls: { success: string; fail: string; cancel: string; ipn: string };
}

export interface InitSessionResult {
  /** Where the browser goes to pay. */
  redirectUrl: string;
}

export type ValidationStatus = 'VALID' | 'VALIDATED' | 'INVALID' | 'FAILED';

/** The gateway's Order Validation answer: the only payment data the server trusts. */
export interface OrderValidation {
  status: ValidationStatus;
  tranId: string;
  amount: string;
  currency: string;
  bankTranId: string | null;
  /** The card or wallet type, stored as `payment_method`. */
  method: string | null;
  /** The provider's full response, stored in `payment_gateway_response`. */
  raw: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly name: string;
  /** Opens a hosted checkout session. Throws when the gateway refuses or is unreachable. */
  initSession(input: InitSessionInput): Promise<InitSessionResult>;
  /** Order Validation API: confirms a `val_id` from an IPN. Throws when unreachable. */
  validateOrder(valId: string): Promise<OrderValidation>;
  /**
   * Transaction Query API, for the reconcile job (not built yet). Null when the gateway has no
   * record of the transaction.
   */
  queryTransaction(tranId: string): Promise<OrderValidation | null>;
}

/** Thrown by a gateway client when the provider can't be reached or answers badly. */
export class GatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayError';
  }
}
