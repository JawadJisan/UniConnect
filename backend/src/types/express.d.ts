import type { AuthSession } from '../lib/auth.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. Undefined on routes that don't use it. */
      auth?: AuthSession;
    }
  }
}

export {};
