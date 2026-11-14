# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Phase 7 Part 1, the blood backend (FR-BLOOD-001–010), on `feat/blood` cut from `development`. Plan and the five open answers approved by the user 2026-11-14 (D14 → PRD rule, PRD #14 consent by donation, PRD #15 no donor emails, own-request fulfill 403, `required_by_date` today allowed).

Next: Phase 7 Part 2, the blood frontend plan (plan mode, wait for approval).

## Completed work

- **Shared:**
  - `packages/shared/src/schemas/blood.ts`: create schemas, list queries and response types; no response type has an email field.
  - `AUDIT_ACTIONS`: `BLOOD_DONATION_VERIFIED`, `BLOOD_REQUEST_FULFILLED`, `BLOOD_REQUEST_CANCELLED`, `BLOOD_REQUEST_EXPIRED`.
- **Backend `src/modules/blood/`:**
  - routes, controller, mapper (`canCancelWith`, `BLOOD_BUSY`), `donation.service`/`.repository`, `request.service`/`.repository`
  - mounted at `/api/v1/blood` and `/api/v1/admin/blood`
- **Locks:**
  - Verify locks the donor's user row, then the donation, and recomputes `last_donation_date` from verified rows in a separate statement.
  - Fulfill and cancel lock the request row.
  - A lock wait past 15 s returns 503 `BLOOD_BUSY`.
- **Jobs and email:**
  - Expiry: queue `blood`, job `expire-blood-requests`, 00:05 Asia/Dhaka (`src/queues/blood.queue.ts`, `src/workers/blood.worker.ts`, wired into `server.ts`).
  - `blood-request-fulfilled` email to the requester (fulfiller's name only).
- **Refactor:** `isLockWait` moved from `events/registration.service.ts` to `src/lib/prisma-errors.ts`.
- **Tests:**
  - `backend/tests/blood.test.ts` (36)
  - `backend/tests/integration/blood.int.test.ts` (26)
  - 9 new rows in `rbac-matrix.int.test.ts` (new `DONORS` set)
- **Docs:**
  - `DECISIONS.md` PRD #14, #15 confirmed, D14 resolved, D40 added
  - `TASKS.md` Phase 7
  - `CLAUDE.md` current state

## Commands executed and results

| Command                                                      | Result                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @uniconnect/backend test tests/blood.test.ts` | 36/36                                                                                                                       |
| `test:integration -- blood` (first run)                      | **26/26**                                                                                                                   |
| `test:integration -- rbac-matrix event-registrations`        | **349/349** (2 suites)                                                                                                      |
| `pnpm typecheck`                                             | First failed: optional text fields typed as required keys. Fixed in `blood.ts` (`.transform` before `.optional`), then pass |
| `pnpm --filter @uniconnect/backend test`                     | **324/324** (16 suites), after the fix                                                                                      |
| `test:integration -- blood` (rerun after the schema fix)     | **26/26**                                                                                                                   |
| `pnpm lint`, `pnpm format:check`                             | pass                                                                                                                        |

## Not covered

- **Full backend integration suite:** not rerun. Only the blood, RBAC matrix and event-registration suites ran.
- **Frontend:** no frontend code. Frontend tests and E2E were not run; the frontend wasn't touched.
- **`BLOOD_BUSY` (503):** no test reaches it. The races finish well inside the 15 s lock timeout.
- **BullMQ schedule registration:** the expiry job's schedule (`scheduleBloodJobs`) is not exercised in tests. The service it calls is.
- **OpenAPI entries:** none (task 1c).

## Exact next task

Phase 7 Part 2: the blood frontend plan, in plan mode, as specified in the user's 2026-11-14 message:

- `/dashboard/blood` with tabs for active requests, the donor directory and my donations
- dialogs for new request, record donation and fulfill confirm
- the admin verification queue
- sidebar navigation
- `SYS.BLOOD.*` labels and blood-group badges

Ask: "Shall I proceed with generating the frontend code for the Blood Donation & Requests module?"

## Recommended resume instruction

> Read `CLAUDE.md`, this file, D40 in `docs/DECISIONS.md`, `docs/DESIGN.md` and the announcements pages (`frontend/src/app/(app)/dashboard/announcements/`) as the closest pattern. Then present the blood frontend plan and wait for approval.
