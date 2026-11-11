import { env } from '../../config/env.js';
import { createMockGateway } from './mock.gateway.js';
import type { PaymentGateway } from './payment-gateway.js';

export * from './payment-gateway.js';

/**
 * The configured gateway (DECISIONS D32). To go live, add `sslcommerz.gateway.ts` implementing
 * PaymentGateway (session: /gwprocess/v4/api.php, validation:
 * /validator/api/validationserverAPI.php), add its env vars, and return it here. Nothing outside
 * src/lib/payments changes.
 */
function pick(): PaymentGateway {
  switch (env.PAYMENT_GATEWAY) {
    case 'mock':
      return createMockGateway(env.FRONTEND_ORIGIN);
    case 'sslcommerz':
      throw new Error('PAYMENT_GATEWAY=sslcommerz is not implemented yet (DECISIONS D32).');
  }
}

export const paymentGateway: PaymentGateway = pick();
