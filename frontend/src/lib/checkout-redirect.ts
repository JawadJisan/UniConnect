/**
 * Sends the browser to the payment gateway's checkout page. A full navigation, not a router
 * push: the real gateway (SSLCommerz) is on another origin. Its own module so tests can watch it.
 */
export function goToCheckout(url: string): void {
  window.location.assign(url);
}
