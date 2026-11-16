import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { MockCheckoutView } from './mock-checkout-view';

export const metadata: Metadata = { title: 'Sandbox checkout' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

/**
 * Where the mock payment gateway sends the browser (DECISIONS D32). Development and test only:
 * the API refuses PAYMENT_GATEWAY=mock in production, and this page does not exist there.
 */
export default function MockCheckoutPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Suspense>
      <MockCheckoutView />
    </Suspense>
  );
}
