import { GatewayError, type PaymentGateway } from './payment-gateway.js';

/**
 * Payments switched off (`PAYMENT_GATEWAY=disabled`, D47). Production runs this until the
 * SSLCommerz merchant credentials exist: checkout answers 503 before any row is written
 * (membership.service.ts), and anything that still reaches the gateway fails like an
 * unreachable provider, so an IPN gets a non-200 and no payment is settled.
 */
export function createDisabledGateway(): PaymentGateway {
  const off = (): never => {
    throw new GatewayError('Payments are disabled on this server.');
  };
  return {
    name: 'disabled',
    enabled: false,
    async initSession() {
      return off();
    },
    async validateOrder() {
      return off();
    },
    async queryTransaction() {
      return off();
    },
  };
}
