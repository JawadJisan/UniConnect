# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Phase 6 Part 1, the announcements backend (FR-ANNOUNCE-001–004). Approved 2026-11-14, with two confirmations:

- XOR scope: `club_id` or `department_id`, never both.
- `is_pinned` on create only for `dept_admin` and `super_admin`; a moderator gets 403.

Branch `feat/announcements`, cut from `development`. After this, present the Part 2 frontend plan and wait for approval.

## Completed work

### Shared

- **`schemas/announcement.ts`:**
  - `createAnnouncementSchema` (exactly one scope)
  - `updateAnnouncementSchema` (title or content)
  - `announcementListQuerySchema` (`club_id`, `department_id`, `is_pinned`, page, limit)
  - `announcementIdParamSchema`
  - `announcementSchema` / `Announcement`
  - limits 200 / 10,000
- **`AUDIT_ACTIONS`:** `ANNOUNCEMENT_CREATED`, `_UPDATED`, `_DELETED`, `_PINNED`, `_UNPINNED`.

### Backend: `src/modules/announcements/`

- **`announcement.access.ts`:**
  - Pure rules: `canSeeWith`, `canCreateWith`, `canManageWith`, `canPinWith`.
  - `visibleScope(db, caller)`, the one D15 feed rule. Phase 9 should reuse it.
- **`announcement.repository.ts`:**
  - `whereVisible`
  - the feed order pinned → newest → id
  - a row lock (`FOR UPDATE`)
  - an atomic `togglePin`
- **`announcement.service.ts`:**
  - one transaction plus an audit row per change
  - 404 for rows the caller can't see, 403 for rows they can see but can't manage
  - a no-op edit writes no audit row
  - delete keeps a snapshot in the audit row
- **Mapper, controller and routes:** mounted at `/api/v1/announcements` in `app.ts`.

### Tests

- **Unit:** `backend/tests/announcements.test.ts`, 42 tests (schemas, rule tables, mapper with no email, `whereVisible`, 401/403/400 route guards).
- **Integration:** `backend/tests/integration/announcements.int.test.ts`, 34 tests (create per role, the D15 feed for 11 kinds of reader, filters, paging, flags, edit and delete, an ended seat, pin toggles, audit rows).
- **RBAC matrix:** 5 new rows.

### Docs

- **`DECISIONS.md`:** D38 marked built, with error codes, locks and the ended-seat behavior. `department {id, name}`, since departments have no code column.
- **`TASKS.md`:** Phase 6 is In progress.
- **`CLAUDE.md`:** the current state now lists the announcements API.

## Commands executed and results

| Command                                              | Result                                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test:integration announcements.int`, first run      | all failed: `beforeAll` passed the 30 s timeout (14 Neon sign-ins). Fixed with `jest.setTimeout(180_000)`, as `events.int` does                                                              |
| second run                                           | 32/34: audit lookups matched rows from earlier tests, because `RESTART IDENTITY` reuses id 1. Fixed by clearing announcement audit rows in `beforeEach` (test isolation only; no app change) |
| `test:integration announcements.int rbac-matrix.int` | **310/310 passed** (692 s)                                                                                                                                                                   |
| Backend unit tests                                   | **288/288** (15 suites)                                                                                                                                                                      |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`   | pass                                                                                                                                                                                         |

## Not covered

- **Full backend integration suite:** not rerun. Only `announcements` and `rbac-matrix` ran; the change touches no other module.
- **No E2E:** there is no frontend yet.

## Behavior to know

- **Author whose seat ended:** if they still hold a membership, they see the post and get 403. Without a membership the post is invisible to them (404).
- **Filters outside your scope** return an empty page, not 403.
- **Pinning** doesn't change `updated_at` (raw toggle), so "edited" stays meaningful.

## Exact next task

Phase 6 Part 2, the announcements frontend. The plan is in the session's plan file. Present it and wait for the user's approval before writing code.

## Recommended resume instruction

> Read `CLAUDE.md`, this file, D15 and D38. On `feat/announcements`, present the announcements frontend plan (`/dashboard/announcements`, dialog, card actions) and wait for approval.
