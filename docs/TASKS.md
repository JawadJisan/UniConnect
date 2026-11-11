# UniConnect: Tasks

The single task tracker. One row per task, one task per session where possible. Update the status and notes at the end of every session, together with `docs/SESSION_HANDOFF.md`.

**Statuses:** `Done` (verified in the session that finished it), `Next`, `Planned`, `Blocked` (waiting on a decision in `docs/DECISIONS.md` §5).

**Every feature slice covers:** PRD IDs and acceptance criteria · database change (via the `db-migration` skill) · shared Zod contracts · repository, service, controller, routes · role, department and resource authorization · frontend page or form · loading, empty, error and success states · unit tests · integration tests (RBAC, cross-department, conflicts, audit row) · E2E for the journey · OpenAPI entry · verification and handoff.

**If time runs short** (PRD decision #25 default): defer the chatbot first, then dashboard analytics, then the blood module.

## Phase 0: Specification reconciliation

| ID  | Task                                                                                         | Status  | Notes                                     |
| --- | -------------------------------------------------------------------------------------------- | ------- | ----------------------------------------- |
| 0.1 | Project audit and engineering alignment (`uniconnect-00-project-audit`)                      | Done    | 2026-11-08. See `docs/SESSION_HANDOFF.md` |
| 0.2 | Decide D5, D6, D12, D18 (needed by Phase 1). D5 local part done 2026-11-08 (Neon `test`)     | Next    | `docs/DECISIONS.md` §5                    |
| 0.3 | Confirm PRD decisions in batches before the phase that needs them (D10)                      | Planned | `docs/DECISIONS.md` §1                    |
| 0.4 | Fix PRD and schema doc issues #4–#16 once their decisions are made (PRD edits need approval) | Planned | `docs/DECISIONS.md` §4                    |

## Phase 1: Engineering foundations

| ID  | Task                                                                                                                                                                                                                         | Status  | Blocked by                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------- |
| 1.0 | Monorepo, tooling, shared package, schema (18 tables), auth backend, landing page, design system                                                                                                                             | Done    |                              |
| 1a  | Claude Code config, path rules, permissions, task and handoff docs, ADR folder, `db-migration` skill                                                                                                                         | Done    | 2026-11-08                   |
| 1b  | Test harness: ~~integration Jest project, test database~~ (done 2026-11-08), ~~Better Auth hook tests~~ (done), factories; `RoleService` lock and tests for every schema §20 transition; seed one club per department        | Next    | D12, D18                     |
| 1c  | API platform: request ID and redacted HTTP logs, global `/api/v1` limit (100/min/IP), P2002 index mapping, OpenAPI registry and `/api/docs`, pagination contract, CI workflow                                                | Planned | D6, D9                       |
| 1d  | Frontend platform: ~~QueryClient, Axios instance and error normaliser, Better Auth client~~ (done 2026-11-08), ~~state components (Skeleton, ErrorState), app shell, Playwright config and E2E~~ (done 2026-11-09, D25, D27) | Done    | D16 still open (shell motif) |

## Phase 2: Authentication, profiles and authorization

| ID  | Task                                                                                                                                                   | Status | Blocked by                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------- |
| 2.1 | Auth pages: login, student and faculty registration, verify result, forgot and reset password                                                          | Done   | 2026-11-08, branch `feat/auth-pages` (D20)              |
| 2.2 | Route protection and role-aware navigation                                                                                                             | Done   | 2026-11-09, branch `feat/user-profile` (D25)            |
| 2.3 | `GET/PATCH /users/me` (FR-USER-001/002), avatar upload (FR-USER-003), change password (FR-USER-004): API, overview and profile pages                   | Done   | 2026-11-09, branch `feat/user-profile` (D24–D27)        |
| 2.4 | Admin users: list, detail, suspend/activate with session revocation, recompute-role (FR-USER-005). Suspend must delete sessions (`DECISIONS.md` §7 M2) | Done   | 2026-11-10, branch `feat/admin-users` (D28, D29)        |
| 2.5 | RBAC matrix test scaffold (role × endpoint, from one policy table)                                                                                     | Done   | 2026-11-10, `tests/integration/rbac-matrix.int.test.ts` |

| 2.6 | Phase 2 gaps: "Sign out other devices" (FR-AUTH-005.4), admin assisting edit (FR-USER-002), per-account sign-in limit (review M1) | Done | 2026-11-10 (D29, D30, §7 M1) |

**Phase 2 is complete:** every FR-AUTH-001–008 and FR-USER-001–005 requirement has its API, frontend and tests. Not done: OpenAPI entries (task 1c, not started).

## Phases 3–10

| Phase | Scope                                                                                                                                                                                                                                                                                                                                    | Status      | Blocked by                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------- |
| 3     | Clubs (list, detail, my-club, edit, logo): **done 2026-11-10** (backend D31, frontend `/dashboard/clubs`). Committee (assign, edit, end term), dept admin terms (assign, end, renew, list), term-expiry jobs                                                                                                                             | In progress | PRD #3, #10, #11 (committee and terms)         |
| 4     | Memberships: **backend and frontend done 2026-11-11** with a mock gateway (D32, D33, ADR 0001): checkout, renew, cancel, lists, IPN with Order Validation, idempotency, stale-cancel and expiry jobs, receipts; `/dashboard/memberships`, `/dashboard/admin/memberships`, sandbox checkout. Left: real SSLCommerz gateway, reconcile job | In progress | PRD #9 (merchant account) for the real gateway |
| 5     | Events: CRUD, poster, publish/cancel/complete, shared visibility query, registration with row lock, check-in, CSV, reminders                                                                                                                                                                                                             | Planned     | PRD #7, #16                                    |
| 6     | Announcements: CRUD, pin, scope enforcement, feed                                                                                                                                                                                                                                                                                        | Planned     | D15, PRD #17                                   |
| 7     | Blood: donations, verification, donor list, requests, expiry job                                                                                                                                                                                                                                                                         | Planned     | D14, PRD #14, #15                              |
| 8     | Dashboards and audit-log viewer                                                                                                                                                                                                                                                                                                          | Planned     | D13                                            |
| 9     | AI chatbot: full-text retrieval of visible content only, PII stripping, Gemini, scoped cache, ChatLog retention. No vector database                                                                                                                                                                                                      | Planned     | PRD #18, Gemini model                          |
| 10    | Hardening and release: IDOR sweep, security review (open items in `DECISIONS.md` §7: H1 trusted client IP, M1, M4 timing, L3–L6, I1–I6), full E2E, responsive QA, restore drill, deployment, demo                                                                                                                                        | Planned     | PRD #24, §7 H1 decision                        |
