# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Fix: on the live site, `/dashboard` stayed on the loading skeleton after login until a reload, 2026-11-20, on `fix/dashboard-login-skeleton` from `main`. Not committed yet.

## Root cause

`frontend/next.config.ts` has `cacheComponents` on, so Next 16 keeps the signed-in workspace alive in a hidden React `<Activity>` after you leave it, and restores its state when you return. Signing out set `RequireSession`'s `leaving` state to `true` (it renders the skeleton while sign-out runs), and nothing set it back. After a new sign-in in the same tab, Next restored the guard with `leaving` still `true`: skeleton forever, and no `GET /users/me` was ever sent. A reload discarded that state, which is why reloading "fixed" it.

Reproduced locally by the new e2e test: it fails against `main`'s guard at the second sign-in (whole-page skeleton for 30 s) and passed 24/24 runs with the fix.

Ruled out on the way, and not changed: a stale cached 401 (React Query v5 resets an error with no data to `pending` when it refetches on mount), and the post-login `router.replace` + `router.refresh()` + `RedirectIfSignedIn` navigations (not needed for the fix).

## Completed work

- `src/app/(app)/_components/require-session.tsx`: `leaving` is derived from `leavingSessionId`, the session being signed out, so a new session ends it. The profile query is disabled while leaving, which stops a pointless `/users/me` 401 after sign-out (seen in the live network log).
- `src/hooks/use-me.ts`: `useMe({ enabled })`.
- `tests/app/shell.test.tsx`: two guard tests, both failing against `main`'s guard (re-rendering the same mounted guard stands in for Activity).
- `e2e/auth.spec.ts`: sign in, sign out, sign in again in the same tab with `get-session` delayed 1.5 s; asserts the dashboard heading, no skeleton, and no full page load.
- D25 in `docs/DECISIONS.md` updated.

## Commands executed and results

| Command                                                     | Result                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @uniconnect/frontend test`                   | 39 suites, 474 tests pass                                                                                                                                                                                                                       |
| New guard unit tests against `main`'s `require-session.tsx` | 2 fail (as intended)                                                                                                                                                                                                                            |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`          | Pass                                                                                                                                                                                                                                            |
| `pnpm e2e e2e/auth.spec.ts` against `main`'s guard          | New test fails at the second sign-in (skeleton)                                                                                                                                                                                                 |
| `pnpm e2e e2e/auth.spec.ts --repeat-each=3` with the fix    | 24 passed                                                                                                                                                                                                                                       |
| `pnpm e2e` (full suite)                                     | 51 passed, 1 skipped, 2 failed: `ai.spec.ts:86` (got 503 `AI_UNAVAILABLE`, expected "not set up") and `terms.spec.ts:22` (hung at "Logging in…"). Both while Redis was unreachable (14 `ENOTFOUND red-…` in the log); neither touches the guard |

## Not covered

- Not yet deployed, so not rechecked on the live site.
- In one e2e run with this fix, sign-out once landed on `/login?next=%2Fdashboard` instead of `/` (the profile was refetched right after sign-out, so `leaving` read false). The cause is not known. It did not recur in the next 5 passes of the auth spec (4 standalone, 1 in the full suite); watch for it.
- Local `REDIS_URL` resolves to a Render internal host (`getaddrinfo ENOTFOUND red-…` in the e2e log). The AI limiter fails closed and email jobs fail, which explains the two e2e failures above. Point local `REDIS_URL` back at Upstash (`rediss://`) and rerun `pnpm e2e e2e/ai.spec.ts e2e/terms.spec.ts`.
