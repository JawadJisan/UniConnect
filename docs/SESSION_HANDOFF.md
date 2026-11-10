# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Close Phase 2: audit every FR-AUTH-001–008 and FR-USER-001–005 requirement against the code, then build what was missing. That was task 2.4 (FR-USER-005 admin users), task 2.5 (RBAC matrix), the FR-AUTH-005.4 "log out of all devices" UI, the FR-USER-002 "super_admin when assisting" edit, and review M1 (per-account sign-in limit). Branch `feat/admin-users`, cut from `feat/user-profile` (2026-11-10).

## Audit result

Before this session, FR-AUTH-001–008 and FR-USER-001–004 were built and tested. Missing: FR-USER-005 (no `/admin` routes, no UI), the assisting edit (no endpoint), the sessions UI, M1, and the RBAC matrix. All of these are now built. Your choices (structured questions):

- add an admin profile edit
- a count-only "Sign out other devices" card
- 10 sign-ins per 15 minutes per email

## Completed work

**Shared:**

- `schemas/pagination.ts`: D9 contract with `meta.total_pages`
- `schemas/admin-user.ts`:
  - list query (`.strict()`, coerced, sort whitelist, `search`)
  - id param
  - status body
  - admin edit body
  - summary, detail and recompute response schemas
- `mySessionsSchema`
- audit actions `USER_SUSPENDED`, `USER_ACTIVATED`, `USER_UPDATED_BY_ADMIN`

**Backend:**

- `src/modules/admin-users/*`: list, detail, `PATCH /:id` (assisting edit), `PATCH /:id/status`, `POST /:id/recompute-role` (D28, D29)
- every write locks the user row (`roleRepository.lockUser`, D12)
- suspend deletes all sessions in the same transaction
- `validateRequest('query'|'params')` stores parsed values in `res.locals`
- `GET /api/v1/users/me/sessions` (D30)
- `PER_EMAIL_LIMITS['/sign-in/email']` (M1)
- new env `AUTH_EMAIL_LIMITS` (default `on`, refused `off` in production; only the Playwright API sets `off`, because E2E signs the seeded accounts in more than 10 times per run). Added to `.env.example`.

**Frontend:**

- `/dashboard/admin/users`: URL-driven filters, debounced search, sortable headers, pager, loading, empty and error states
- `/dashboard/admin/users/[id]`: account cell, "Role" with its terms and Recompute, admin details form, status card with confirm dialog. Self and super-admin targets are disabled with a reason.
- profile "Devices" card
- the nav table has an Admin group (super_admin only)
- the overview links the built capability
- hooks: `use-admin-users.ts`, `use-departments.ts`, `useMySessions`/`useRevokeOtherSessions`

**Impeccable:**

- `detect` on the new files: `[]`
- code-level audit against DESIGN.md and the workspace brief: no material fixes
- DESIGN.md §7 gained "Admin list" and "Admin record"
- no finish-reviewer subagent was run

## Files changed

Run `git show --stat` on the session's commits for the full list. In short:

- **shared:** `schemas/{pagination,admin-user,user}.ts`, `constants`, `index`
- **backend:** `modules/admin-users/*`, `modules/users/*`, `lib/auth.ts`, `config/env.ts`, `middleware/validate.ts`, `repositories/role.repository.ts`, `app.ts`, `.env.example`, `scripts/e2e-db.ts` (seed user `student3@e2e.test`)
- **backend tests:** `tests/admin-users.test.ts`, `tests/users.test.ts`, `tests/better-auth-config.test.ts`, `tests/integration/{admin-users,rbac-matrix}.int.test.ts`, `harness.ts` (`createUser`, `signInCookie`)
- **frontend:** `app/(app)/dashboard/admin/users/**`, `profile/_components/{sessions-card,profile-view}.tsx`, `_components/nav.ts`, `dashboard/_components/overview-view.tsx`, `hooks/*`, `playwright.config.ts`
- **frontend tests:** `tests/app/{admin-users.test.tsx,nav.test.ts}`, `tests/mocks/auth-client.ts`, `e2e/{admin.spec.ts,profile.spec.ts,db.ts}`
- **docs:**
  - `DECISIONS.md` (D9 resolved, D12 partly built, D28–D30, M1 fixed)
  - `UniConnect_PRD_V1.md` (FR-AUTH-005.4 wording, FR-USER-005 assisting edit and search, §16 `USER_UPDATED_BY_ADMIN`, API table rows; approved with the plan)
  - `TASKS.md` (2.4, 2.5, 2.6 done; Phase 2 complete), `DESIGN.md`, `CLAUDE.md`, this file

## Database/migration changes

None. No schema change, and no command touched `development` or `production`. The Neon `test` branch was used by the integration tests and E2E.

## Commands executed and results

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: pass
- `pnpm test`: backend 10 suites 140/140, frontend 13 suites 162/162
- `pnpm --filter @uniconnect/backend test:integration`: 7 suites 139/139 (the new suites alone: 78/78)
- `pnpm e2e`: **not completed.** It was stopped at your request after 18 of 25 tests.
  - 16 passed: all of `auth.spec.ts`, the profile tests through "faculty see no academic fields", and three of the five admin tests (recompute, 375px no horizontal scroll, student has no access).
  - 2 failed:
    1. The suspend test passed every step up to the suspended login, then `getByText('Suspended').first()` matched the hidden `<option>` of the Status filter. The locator is now scoped to the table row. The fix has **not** been re-run.
    2. The semester test failed only because test 1 stopped before re-activating `student3`.
  - Not reached: the new "Sign out other devices" profile test, the password test and `shell.spec.ts`.
  - **Run `pnpm e2e` before relying on the admin E2E.**

## Not covered

- moderator and dept_admin in E2E: they are covered by the RBAC matrix in integration tests, which write the role column directly
- a real Cloudinary upload: still the open manual check
- OpenAPI entries: task 1c

## Current blockers

None.

## Approved decisions and ADR links

D28, D29, D30, D9, D12 (partly), M1. No ADR.

## Risks and unresolved questions

- `AUTH_EMAIL_LIMITS` must stay unset (`on`) in every deployed environment. `env.ts` refuses `off` only when `NODE_ENV=production` (L3 still applies).
- The list's `findMany` and `count` are not one snapshot, so `total` can be off by one row under concurrent writes.
- Still open from before:
  - H1 (trusted client IP), L3–L6, I1–I6
  - the manual Cloudinary check
  - D16
  - the `development` database branch has no departments

## Exact next task

Task 1b: factories, the rest of D12 (term endpoints), seeding one club per department (D18), and a moderator/dept_admin in the E2E seed. Then Phase 3 (clubs, committee, admin terms) after the PRD decisions it needs (D10: #1–3, 5, 6, 10, 11, 22).

## Recommended resume instruction

> Read `CLAUDE.md`, `docs/SESSION_HANDOFF.md`, `docs/DECISIONS.md` D28–D30 and `docs/TASKS.md`. Plan task 1b in plan mode and wait for approval.
