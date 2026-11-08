import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth client. It calls /api/auth/* on the current origin, which the Next.js rewrite
 * forwards to Express, so the session cookie is first-party.
 */
export const authClient = createAuthClient({ basePath: '/api/auth' });

/** The URL the verification email sends the browser to after confirming. */
export const VERIFY_CALLBACK_URL = '/login?verified=true';
