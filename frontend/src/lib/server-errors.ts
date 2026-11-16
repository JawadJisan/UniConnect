import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ApiError } from '@/lib/api';

/**
 * Puts a server error on the field it belongs to: a known code first (409 STUDENT_ID_TAKEN),
 * then the 400 `details` issues whose path is a field of this form. Returns the message for a
 * form-level alert when nothing on the form can carry it, or null when every issue landed.
 */
export function applyServerError<T extends FieldValues>(
  err: ApiError,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  codeField: Partial<Record<string, Path<T>>> = {},
): string | null {
  const byCode = codeField[err.code];
  if (byCode) {
    setError(byCode, { message: err.message }, { shouldFocus: true });
    return null;
  }

  const known = err.fields.filter((f): f is { path: Path<T>; message: string } =>
    (fields as readonly string[]).includes(f.path),
  );
  known.forEach((f, i) => setError(f.path, { message: f.message }, { shouldFocus: i === 0 }));
  if (known.length > 0 && known.length === err.fields.length) return null;

  if (err.status === 0) return err.message;
  if (err.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  if (err.status >= 500) return "Couldn't save right now. Try again in a moment.";
  return err.message;
}
