# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Phase 3, the rest: club committee (FR-COMM-001–004), dept admin terms (FR-ADMIN-001–004), the term-expiry jobs (FR-ADMIN-005), and their UI. Built backend first, then the frontend; each was planned in plan mode and approved. Branch `feat/committee-admin-terms`, cut from `development` on 2026-11-12, committed and merged into `development` on 2026-11-12 (not pushed).

Your choices:

- **PRD #10 and #11:** confirmed.
- **Renew:** included.
- **Committee expiry:** the PRD year rule.
- **Picker:** a new candidates endpoint.
- **Badges:** uppercase `CURRENT`/`ENDED`.

Housekeeping first:

- `feat/memberships` was already merged.
- `pnpm db:seed` ran on Neon `development` after I checked the branch. Result: CSE, ECE and BBA plus their clubs.

## Completed work

No schema change, no migration, no new dependency.

### Backend (D34)

- **`src/modules/committee/`**, under `/api/v1/clubs/:id/committee`:
  - list
  - `candidates` (club editors; active students and faculty of the club's department; no email)
  - assign, edit, end-term
- **`src/modules/dept-admin-terms/`**, at `/api/v1/admin/dept-admin-terms`, super admin only: list, assign, end, renew.
- **Locks:** the order is club or department → user (D12) → term row. Ending a term re-checks `is_current` under the lock.
- **P2002:** mapped to specific 409s by index name (`src/lib/prisma-errors.ts`).
- **Jobs:** queue `terms` (`src/queues/term.queue.ts`, `src/workers/term.worker.ts`) runs `expire-dept-admin-terms` and `expire-committee-terms` daily at 00:05 Asia/Dhaka, through the same path as the endpoints, with actor null.
- **Email:** `dept-admin-assigned`, queued after commit.

### Frontend (D35)

- **Club page:** the Committee cell is now `committee-panel.tsx`.
  - Viewers see the read-only current list.
  - Editors see current and past terms in a `DataTable`, with a Current/All toggle, Edit, a `destructive` End term, and Assign member.
  - Dialogs: `assign-committee-dialog.tsx`, `edit-committee-dialog.tsx`, `end-committee-term-dialog.tsx`.
  - `committee-table.tsx` was removed.
- **`/dashboard/admin/dept-admins`**, super admins only:
  - URL filters, server pages, Renew and End early.
  - Dialogs: assign, renew and end.
  - The faculty search reuses `GET /admin/users`.
- **Shared pieces:**
  - `components/person-picker.tsx` (native radios, 300 ms debounce, disabled-with-reason rows)
  - `components/term-status-badge.tsx`
  - `lib/terms.ts`
  - `hooks/use-committee.ts` and `hooks/use-dept-admin-terms.ts`
  - `useAdminUsers` gained an `enabled` option
  - `applyServerError` moved to `lib/server-errors.ts`
- **Nav:** "Dept admins" for super admins, and two capability links.

### Docs

- `DECISIONS.md`:
  - PRD #10 and #11 confirmed
  - D12 built for terms
  - issue 6 resolved
  - D34 and D35
- PRD §20 (`COMMITTEE_MEMBER_UPDATED`).
- `DESIGN.md` §7 (committee panel, person picker, term badge, dept admins list) and §11.
- `TASKS.md` (Phase 3 done) and `CLAUDE.md`.

## Database/migration changes

None. The seed ran on `development`; tests reset the `test` branch's user tables.

## Commands executed and results

- `pnpm typecheck`, `pnpm lint` and `pnpm format:check` pass.
- **Backend unit:** 13 suites, 215/215.
- **Backend integration:**
  - **Before the candidates endpoint:** the full suite passed, 11 suites, 387/387.
  - **After it:** `committee.int` plus `rbac-matrix` gave 208/209.
    - The one failure was a test bug: search results were crowded by earlier test users.
    - After the fix, the candidates tests passed 8/8 (`-t candidates`).
  - **Final full rerun:** 11 suites, 401/401.
- **Frontend unit:** 20 suites, 265/265.
- **E2E (`pnpm e2e`):** the first run had 31 passed and 2 failed, both test bugs.
  - Failure 1: `shell.spec` expected the old super-admin nav, without "Dept admins".
  - Failure 2: the `terms.spec` sign-out helper expected `/login`, but sign out goes to `/`.
  - **Final full rerun:** 33/33.

## Not covered

- A manual `pnpm dev` check on `development`.
- `impeccable detect`.

## Current blockers

None.

## Approved decisions and ADR links

PRD #10, #11; D12 (built for terms); D34; D35.

## Risks and unresolved questions

- **One seat per user in practice:** one department each, and one club per department.
- **Ending is not backdating:** ending a term early leaves its end date as it was.
- **Neon cold start:** a cold `test` branch can push the first suite's `beforeAll` past 30 s.
- **One shared Redis:** the `terms` and `memberships` queues are shared by `pnpm dev` and the E2E API.
- **PRD #3 (moderator scope):** still pending; events need it.

## Exact next task

Phase 5 (events). PRD #3 (own club only), #7 (`EventDepartment` rule) and #16 (hard cap, no waitlist, free only; `is_paid`/`fee_amount` shown, paid at the venue) were answered on 2026-11-12. Record them in `DECISIONS.md` on `feat/events`, then plan the events backend.

## Recommended resume instruction

> Read `CLAUDE.md`, `docs/SESSION_HANDOFF.md` and `docs/DECISIONS.md` D34–D35. Record PRD #3, #7 and #16 as answered, then plan the Phase 5 (events) backend in plan mode.
