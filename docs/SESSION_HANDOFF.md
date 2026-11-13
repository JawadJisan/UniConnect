# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Phase 6 Part 2, the announcements frontend. Approved 2026-11-14, with the `border-border` token in place of `border-white/5`. Then merge `feat/announcements` into `development`.

Next: present the Phase 7 blood backend plan with its open questions, and wait for approval.

## Completed work

- **Navigation (`nav.ts`):**
  - New sidebar group **Updates** with Announcements for every role; the ⌘K palette reads the same table.
  - Overview capability links for announcements.
- **`hooks/use-announcements.ts`:** feed query plus create, update, delete and pin mutations. Edit and pin write the returned row into cached pages.
- **`lib/announcements.ts`:** `createScopeOptions` (per role), `scopeLabel`, `canPost`, `canPinRole`.
- **`lib/format.ts`:** `formatRelative`, `formatDateTime`.
- **`/dashboard/announcements` (`page.tsx` plus `_components/`):**
  - feed view with URL filters, `Pager` and every state
  - `announcement-card.tsx`
  - `announcement-dialog.tsx` (create and edit, per-role audience, pin checkbox)
  - `delete-announcement-dialog.tsx`
- **Tests:**
  - `tests/lib/announcements.test.ts`
  - `tests/app/announcements.test.tsx` (feed and dialog, 19 tests)
  - `nav.test.ts` updated
  - `e2e/announcements.spec.ts`
  - `e2e/shell.spec.ts` updated
- **Docs:**
  - `DESIGN.md` §7 (feed, card, dialog) and §11 (the `SYS.ANNOUNCE.*` tags and uppercase badges)
  - `DECISIONS.md` D39
  - `TASKS.md` Phase 6 Done
  - `CLAUDE.md`

## Commands executed and results

| Command                                            | Result                                                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend unit tests                                | **347/347** (26 suites); first run of the new file had 2 test bugs (sidebar headings counted; the hook's 500 retry outlasted the default wait), fixed in the tests |
| `pnpm e2e announcements.spec.ts shell.spec.ts`     | shell 5/5; announcements 0/2 (`getByLabel('Department')` also matched the radio cards), fixed with `exact: true`                                                   |
| `pnpm e2e announcements.spec.ts`                   | **2/2**                                                                                                                                                            |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | pass                                                                                                                                                               |

## Not covered

- **Full E2E suite:** not rerun. Only the announcements and shell specs ran.
- **Full backend integration suite:** not rerun this phase.
- **Cross-department visibility in E2E:** checked with an ECE post that the CSE student must not see. All E2E users are in CSE.

## Exact next task

Phase 7 Part 1, the blood backend (FR-BLOOD-001–010). Present the plan and the open questions:

- D14 phone visibility
- consent
- fulfilling your own request
- `required_by_date` today
- PRD #15

Wait for approval before writing code.

## Recommended resume instruction

> Read `CLAUDE.md`, this file, D14 and PRD #14–#15 in `docs/DECISIONS.md`, and PRD §14. Answer the blood open questions, then build `src/modules/blood/` on `feat/blood` from `development`.
