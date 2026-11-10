const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Dhaka',
});

/** "9 Nov 2026", in the product's locale and time zone (Asia/Dhaka). */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE.format(date);
}

/**
 * "1500.50" → "৳1,500.50". The API sends money as a 2-decimal string (DECISIONS D31); it is
 * formatted as text and never turned into a JS number.
 */
export function formatBdt(amount: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) return amount;
  const whole = match[1]!.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `৳${whole}.${(match[2] ?? '').padEnd(2, '0')}`;
}
