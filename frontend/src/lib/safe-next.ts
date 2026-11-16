/** Where signed-in people land when nothing else is asked for. */
export const HOME_AFTER_SIGN_IN = '/dashboard';

/**
 * The `?next=` target after sign-in, if it is a same-origin path. Anything else (another
 * origin, a protocol-relative `//host`, a backslash trick, a scheme) falls back to the
 * dashboard, so the login page can't be used as an open redirect.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return HOME_AFTER_SIGN_IN;
  }
  try {
    const url = new URL(next, 'http://uniconnect.local');
    if (url.origin !== 'http://uniconnect.local') return HOME_AFTER_SIGN_IN;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return HOME_AFTER_SIGN_IN;
  }
}

/** The login URL that brings the visitor back to `path` afterwards. */
export function loginUrlFor(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}
