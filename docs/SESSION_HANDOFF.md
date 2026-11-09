# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Tasks 2.3 (FR-USER, backend and frontend), 2.2 (route protection, role-aware navigation) and the shell and E2E parts of 1d, on branch `feat/user-profile` from `main` (2026-11-09).

Earlier the same day, `feat/auth-pages` was pushed and merged as PR #1 (merge commit `faa75a1`).

Nothing from this session is committed.

## Source documents reviewed

- `CLAUDE.md`, `docs/TASKS.md`, the previous handoff, `docs/DECISIONS.md` (§2, §3, §7)
- PRD §5 (capability matrix), §7 FR-USER-001 to 005, §16 (audit actions)
- `schema.prisma` (`User`, `Account`) and the `db_invariants` migration
- `docs/DESIGN.md`, `PRODUCT.md`, the auth surface brief
- Impeccable references: `new-work.md`, `operate.md`, `mode-operate.md`, `craft-floor.md`
- Next 16 docs bundled in `node_modules/next/dist/docs`: proxy, authentication, instant navigation, `instant` segment config

## Completed work (verified)

**Backend (first half of the session; plan approved):**

- `GET/PATCH /api/v1/users/me` and `PATCH /api/v1/users/me/avatar` (multer + Cloudinary)
- the change-password route stays Better Auth's
- D24 is in `DECISIONS.md`; details are in its row and in git

**Frontend (second plan, approved, with your choices):** sidebar + top bar shell, honest overview, sonner toasts, RTL + Playwright.

- **Route protection (D25):**
  - `src/proxy.ts` makes an optimistic cookie check on `/dashboard/*` and sends anyone without a cookie to `/login?next=…`
  - `RequireSession` (client) handles session pending, signed out, 401, 403 (suspended screen), other errors (retry) and sign-out
  - login and `RedirectIfSignedIn` follow a same-origin `?next=` (`lib/safe-next.ts`)
- **Shell** (`app/(app)/_components/`):
  - 232px sidebar from one role-filtered nav table (only routes that exist), a "Group / Page" top bar, a ⌘K "Go to" palette, avatar plus sign out, a mobile drawer and a skip link
- **Overview** (`/dashboard`):
  - greeting, with titles like Dr./Md. skipped
  - a profile checklist by user type
  - an Account card
  - per-role capabilities from PRD §5, marked "Not built yet", with no links
- **Profile** (`/dashboard/profile`):
  - sticky identity card with the avatar drop zone: preview before upload, shared limits checked before the network, an uploading overlay and inline errors
  - Personal details (only dirty fields sent; an empty phone sends `null`)
  - Academic details (students only; 409 `STUDENT_ID_TAKEN` shown on its field)
  - Password through `authClient.changePassword`
  - Saves are secondary until their form is dirty
- **New primitives:** `components/ui/{sonner,avatar,skeleton,error-state}.tsx`
- **Shared and helper modules:** `hooks/use-me.ts`, `hooks/use-command-k.ts`, `lib/{format,names,safe-next}.ts`
- **Moved:** `PasswordInput` and the password hint to `components/password/`
- **Impeccable:**
  - structure picked by you; the roll was skipped (the brief records `seed: none (skipped, structure user-pinned)`)
  - surface brief: `frontend/.impeccable/surfaces/src-app-app-layout-tsx.md`
  - `impeccable detect`: `[]`
  - finish reviewer: `fix` with 7 items, then 6 resolved, then the last one resolved → **`ship`**. That covers those 7 fixes, not a fresh full review.
  - the documenter updates `docs/DESIGN.md` (see "Files changed")
- **Two real bugs found by E2E and fixed:**
  - sign-out from the workspace landed on `/login?next=/dashboard`, because the guard redirected before the shell's redirect to `/`. Sign-out now lives in the guard.
  - after login with `?next=`, `RedirectIfSignedIn` and the login view raced. Both now use `safeNext`.
- **Next dev error fixed:** "Could not validate … instant navigation" on both pages. The pages render only behind the client guard, so they export `instant = false`, as low in the tree as possible (recorded in D25).

**Correction to the previous handoff:** it blamed Windows Application Control for the frontend Jest failure ("Must use import to load ES Module"). After you unblocked SWC, the error remained. The real cause was a Jest transform cache poisoned while SWC was blocked. `npx jest --clearCache` fixed it.

## Files changed

- **Backend:**
  - `src/modules/users/*`, `src/lib/cloudinary.ts`, `src/middleware/upload.ts` (new)
  - `src/middleware/validate.ts`, `src/config/env.ts`, `src/app.ts`
  - `scripts/e2e-db.ts` (new); `package.json` scripts `dev:e2e` and `e2e:db`
  - tests: `tests/users.test.ts`, `tests/integration/users.int.test.ts`
- **Shared:** `src/schemas/user.ts` (new), `src/constants/index.ts`, `src/index.ts`
- **Frontend:**
  - `src/proxy.ts`, `src/app/(app)/**`, the new UI primitives, hooks and libs listed above
  - `src/app/layout.tsx` (Toaster), `site-header.tsx` (Dashboard link, shared ⌘K hook)
  - auth: `login-view.tsx`, `redirect-if-signed-in.tsx`, imports in `register-form.tsx` and `reset-password-view.tsx`
  - `package.json` (`sonner`); `playwright.config.ts`, `e2e/*`
  - tests: `tests/app/*`, `tests/auth/login.test.tsx`, `tests/mocks/auth-client.ts`
- **Root:** `package.json` (`pnpm e2e`), `pnpm-lock.yaml` (sonner)
- **Docs:**
  - `docs/DECISIONS.md` (D24–D27), `docs/TASKS.md` (1d, 2.2, 2.3 done)
  - `docs/UniConnect_PRD_V1.md` §16 (two audit actions), `CLAUDE.md`, `PRODUCT.md` (Status)
  - `docs/DESIGN.md` (by the documenter), this file

## Database/migration changes

None. No schema change, and no command touched `development` or `production`.

The Neon `test` branch was used by the integration tests and E2E. `e2e-db.ts seed` truncates its user tables. You approved this with the plan.

## Commands executed and results

All from the repo root unless noted:

- `pnpm typecheck`: all three packages Done
- `pnpm lint`: pass
- `pnpm format:check`: pass
- `pnpm test` (last run, after every code change): backend 9 suites, 108/108; frontend 12 suites, 142/142
- `pnpm --filter @uniconnect/backend test:integration`: 5 suites, 61/61. It ran after the frontend work and before the review fix rounds, which changed only frontend files.
- `pnpm e2e`:
  - the first two runs found the bugs above
  - after the fixes: **three consecutive runs of 18/18** (4.5, 3.9 and 3.9 minutes)
  - after review fix round 1: **18/18** (3.2 minutes)
  - the final copy-only change (`ROLE_AS_PERSON`) was covered by unit tests and a recapture, not another E2E run; no E2E test asserts that heading
- Env passthrough probe: blank `SMTP_HOST` and `CLOUDINARY_*` survive pnpm, `with-test-db` and dotenv as empty values, so the E2E API sends no email and makes no upload
- Screenshots in `frontend/.impeccable/review/` (gitignored), made with a scratch Playwright config outside the repo:
  - overview and profile for student and faculty at 1440 and 390
  - the drawer and form error states
  - avatar focus, error, preview and uploading
  - this overwrote the earlier landing-page `desktop.png` and `mobile.png` there

## Tests executed and results

As above. New tests:

- **Frontend unit:**
  - `tests/app/nav.test.ts`: role nav for 5 roles, `safeNext`, initials, greeting, role phrasing
  - `shell.test.tsx`: guard states, sidebar, sign-out, drawer, Ctrl+K
  - `profile.test.tsx`: cards per user type, dirty-only PATCH, null phone, validation, server details, 409, toast
  - `avatar-password.test.tsx`
  - `redirect.test.tsx`
  - login `next` cases
- **E2E:**
  - `auth.spec.ts`: register → verify gate → login; `next` round trip; wrong password; redirect off auth pages; sign-out; forged cookie; uniform reset answer
  - `profile.spec.ts`: edits persist, 409 inline, client validation, avatar type check/preview/stubbed upload, faculty without academic fields, change password signs out the other device and only the new password works
  - `shell.spec.ts`: 3 user types, palette, 375px drawer, no horizontal scroll

**Not covered by E2E:**

- moderator and dept_admin, which are unit-tested only, because the seed can't create them without term rows (task 1b)
- a real Cloudinary upload, which needs your OK; the plan's one manual upload is still not done

## Current blockers

None.

## Approved decisions and ADR links

D24 to D27 (`docs/DECISIONS.md`). No ADR.

## Risks and unresolved questions

- **Manual Cloudinary check is still open:** run one real upload and confirm the URL renders. It needs your OK.
- **E2E rate limits:** E2E runs the API with `NODE_ENV=test`, so the IP rate limiters are off. Per-email limits still use real Upstash Redis.
- **E2E and dev server:** E2E and a normal `pnpm dev` can run at the same time on different ports. `next dev` may still refuse a second instance in the same directory; that wasn't tested.
- **Static shell:** the workspace pages opt out of instant-navigation validation (`instant = false`). Server-side session reads would let them prerender a real shell; that's a later optimization.
- **Still open from before:** H1 (trusted client IP), M1, L3–L6, I1–I6 (`DECISIONS.md` §7); the `development` branch has no departments; D16 (shell motif).
- **pnpm notice:** pnpm printed "Agent skills awaiting approval: @tanstack/react-table". Nothing was approved.

## Exact next task

1. Review the diff and commit on `feat/user-profile`, if you ask.
2. With approval, run the manual Cloudinary upload.
3. Task 1b: factories, the `RoleService` lock (D12), and seeding clubs and a moderator/dept_admin, so E2E can cover every role.

## Acceptance criteria

For 1b, as in `docs/TASKS.md`. For the Cloudinary check: one real JPEG uploaded through `/dashboard/profile` is saved as a `res.cloudinary.com` URL and renders after a reload.

## Recommended resume instruction

> Read `CLAUDE.md`, `docs/SESSION_HANDOFF.md` and `docs/DECISIONS.md` D24–D27. Commit `feat/user-profile` if asked, then plan task 1b in plan mode and wait for approval.
