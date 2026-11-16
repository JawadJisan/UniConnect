// Test double for the Better Auth client. jest.config.mjs maps better-auth/react to
// better-auth-react.ts, which hands this object to src/lib/auth-client.ts. Each method is a
// jest.fn that resolves like the Better Auth client: `{ data, error }`, never a throw.
type Result = { data: unknown; error: null | { status: number; code?: string; message?: string } };

const ok = (): Promise<Result> => Promise.resolve({ data: {}, error: null });

export interface FakeSession {
  data: null | { session: { id: string }; user: { id: string; name: string; email: string } };
  isPending: boolean;
}

let session: FakeSession = { data: null, isPending: false };

/** Sets what `authClient.useSession()` returns for the next renders. */
export function setSession(next: FakeSession['data'], isPending = false) {
  session = { data: next, isPending };
}

export const authClient = {
  useSession: jest.fn(() => session),
  signIn: { email: jest.fn(ok) },
  signOut: jest.fn(ok),
  sendVerificationEmail: jest.fn(ok),
  requestPasswordReset: jest.fn(ok),
  resetPassword: jest.fn(ok),
  changePassword: jest.fn(ok),
  revokeOtherSessions: jest.fn(ok),
};

export const VERIFY_CALLBACK_URL = '/login?verified=true';

/** Restores every method to its default and signs the fake session out. */
export function resetAuthClient() {
  setSession(null);
  authClient.useSession.mockImplementation(() => session);
  for (const fn of [
    authClient.signIn.email,
    authClient.signOut,
    authClient.sendVerificationEmail,
    authClient.requestPasswordReset,
    authClient.resetPassword,
    authClient.changePassword,
    authClient.revokeOtherSessions,
  ]) {
    fn.mockReset();
    fn.mockImplementation(ok);
  }
}
