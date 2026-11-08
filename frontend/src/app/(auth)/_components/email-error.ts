import type { FieldError } from 'react-hook-form';

/** Plain wording for an empty or malformed email, instead of Zod's "Invalid email address". */
export const emailError = (e: FieldError | undefined) =>
  e ? 'Enter a valid email address, like name@example.com.' : undefined;
