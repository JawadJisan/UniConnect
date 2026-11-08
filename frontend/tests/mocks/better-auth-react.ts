import { authClient } from './auth-client';

/** Stands in for better-auth/react: src/lib/auth-client.ts gets the shared test double. */
export const createAuthClient = () => authClient;
