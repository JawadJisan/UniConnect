/** Shown wherever a new password is chosen. Mirrors passwordSchema in @uniconnect/shared. */
export const PASSWORD_HINT =
  'At least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.';

const RULES: [test: (pw: string) => boolean, missing: string][] = [
  [(pw) => /[A-Z]/.test(pw), 'an uppercase letter'],
  [(pw) => /[a-z]/.test(pw), 'a lowercase letter'],
  [(pw) => /\d/.test(pw), 'a number'],
  [(pw) => /[^A-Za-z0-9]/.test(pw), 'a symbol'],
];

const list = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/**
 * Says exactly what a rejected password lacks, instead of the shared
 * "Password does not meet requirements.", which names no fix.
 */
export function describePassword(pw: string | undefined): string {
  const value = pw ?? '';
  if (!value) return 'Enter a password.';
  if (value.length > 100) return 'Use 100 characters or fewer.';
  const missing = RULES.filter(([ok]) => !ok(value)).map(([, label]) => label);
  const short = value.length < 8;
  if (short && missing.length) return `Use at least 8 characters, and add ${list(missing)}.`;
  if (short) return 'Use at least 8 characters.';
  if (missing.length) return `Add ${list(missing)}.`;
  return 'Choose a different password.';
}
