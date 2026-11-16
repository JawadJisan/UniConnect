import { Prisma } from '../generated/prisma/client.js';

/** True for a unique-constraint violation (Prisma `P2002`). */
export function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Which of `indexNames` a `P2002` names, or null. With the pg driver adapter the index name
 * sits somewhere inside `meta` (its shape differs between Prisma versions), so search the
 * whole of it, and the message as a fallback. Partial unique indexes are hand-written in a
 * migration (DECISIONS §3), so their names are stable.
 */
export function violatedIndex<T extends string>(
  err: Prisma.PrismaClientKnownRequestError,
  indexNames: readonly T[],
): T | null {
  const haystack = `${JSON.stringify(err.meta ?? {})} ${err.message}`;
  return indexNames.find((name) => haystack.includes(name)) ?? null;
}

/** A lock_timeout cancel (55P03) or Prisma's transaction timeout (P2028). */
export function isLockWait(err: unknown): boolean {
  const e = err as { code?: string; meta?: unknown; message?: string } | null;
  if (!e) return false;
  if (e.code === 'P2028') return true;
  const text = `${e.code ?? ''} ${JSON.stringify(e.meta ?? {})} ${e.message ?? ''}`;
  return text.includes('55P03') || /lock timeout/i.test(text);
}
