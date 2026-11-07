import Link from 'next/link';

export function Wordmark() {
  return (
    <Link
      href="/"
      aria-label="UniConnect home"
      className="inline-flex shrink-0 items-baseline rounded-sm text-md font-semibold tracking-tight text-foreground"
    >
      UniConnect
      <span aria-hidden="true" className="font-mono text-brand-text">
        _
      </span>
    </Link>
  );
}
