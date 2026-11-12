# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Phase 5, part 1: the events backend (FR-EVENT-001–012). Planned in plan mode and approved on 2026-11-12. Branch `feat/events`, cut from `development` after Phase 3 was merged (805d815). **Not committed** (commit only when asked). The frontend plan comes after the backend is verified.

Earlier the same day, Phase 3 was committed (5 commits) and merged into `development` as 805d815, after:

- a full integration run: 401/401
- a full E2E run: 33/33

Decisions you made:

- **PRD #3:** moderators manage events of their own committee club only.
- **PRD #7:** the `EventDepartment` rule.
- **PRD #16:** hard cap, no waitlist, manual check-in, free only; `is_paid` and `fee_amount` are shown, and the fee is paid at the venue.
- **Publish email:** goes to eligible users only.
- **Completing an event:** marks remaining registrations `no_show`.
- **Registrant lists:** carry no email.

## Completed work

No schema change, no migration, no new dependency.

- **Shared:**
  - `schemas/event.ts`: create, update, list, my-registrations and registrations queries, params, response types, `POSTER_FIELD`
  - six event audit actions
- **`src/modules/events/`:**

  | File                         | Contents                                                                                               |
  | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
  | `event.access.ts`            | Pure rules: `canManageWith`, `canSeeWith`, `isEligibleWith`                                            |
  | `event.repository.ts`        | Browse SQL with the same visibility rule; `lockForRegistration` and `seatsAndMine`; fan-out recipients |
  | `registration.repository.ts` | Registration rows                                                                                      |
  | `event.service.ts`           | Create, list, detail, update, poster, publish, cancel, complete; `registerBlock`                       |
  | `registration.service.ts`    | Register, cancel, mine, list and CSV, check-in                                                         |
  | `event.mapper.ts`            | Row → API mapping; CSV with formula-injection escaping                                                 |
  | `event.notify.ts`            | The fan-out                                                                                            |
  | Controller and routes        | Mounted at `/api/v1/events`                                                                            |

- **Queue `events`:** `src/queues/event.queue.ts` and `src/workers/event.worker.ts`. Each job pages 500 recipients and saves a cursor.
- **Email:** kinds `event-published`, `event-cancelled` and `event-registered`. `enqueueEmail` takes an optional `jobId`.
- **Uploads:** `uploadEventPoster` and `posterUpload`.
- **Tests:**
  - `tests/events.test.ts` (unit, 30)
  - `tests/integration/events.int.test.ts` (33)
  - `tests/integration/event-registrations.int.test.ts` (18)
  - 13 RBAC matrix rows
  - The harness mocks `event.queue.js` (`eventJobs`).
  - The four existing Cloudinary mocks gained `uploadEventPoster`.
  - Both event suites use `jest.setTimeout(180_000)`.
- **Docs:**
  - `DECISIONS.md`: PRD #3, #7, #16 confirmed; #21 now includes posters; D36
  - PRD §20 (3 actions), `TASKS.md` (Phase 5 in progress), `CLAUDE.md`

### Bug found and fixed during testing

The 10-into-3 parallel test caught two problems in turn:

1. **500s under load.** The first design did several round trips under the event lock. On a slow link, queued registrations hit Prisma's 10 s transaction timeout and returned 500.
2. **Overbooking from my first fix.** It locked the event and counted seats in one statement. A waiting `FOR UPDATE` re-checks only the locked row, so the count kept its pre-wait snapshot and 10 of 10 got seats.

**Final design:**

- Visibility and eligibility are checked before the lock.
- One statement locks and reads the event.
- The next statement counts seats and reads the caller's row.
- Register and cancel-registration use `lock_timeout` 15 s and a 25 s transaction; past that, the caller gets 503 `EVENT_BUSY`.

## Commands executed and results

- `pnpm typecheck`, `pnpm lint` and `pnpm format:check` pass.
- **Backend unit:** 14 suites, 245/245.
- **Event integration suites**, after the final fix:
  - `event-registrations.int`: passed 18/18, including the 10-into-3 race (3 × 201, 7 × `EVENT_FULL`) and the 5 parallel double submits (one row).
  - `events.int`: 32/33 in that run. "Refuses to publish an event whose start has passed" returned 500. A rerun of its describe block passed 5/5. The cause wasn't confirmed; logging is silenced in tests. Likely a 10 s transaction timeout on a very slow run (about 21 s per test).
- **Earlier runs today:** some hit network outages ("Can't reach database server").
- **Full integration suite:** **not completed.** Claude Code stopped it because the machine was low on memory. Before that, `memberships.int` (unchanged code) failed in 45 s, mostly on timeouts and "environment torn down" errors. My backend unit run had regenerated the Prisma client during it. Not diagnosed.
- **RBAC matrix:** not run on its own yet.

## Not covered

- A full integration run, including `rbac-matrix` and a `memberships.int` rerun.
- A manual `pnpm dev` smoke test.
- The `event-reminders` job (PRD §11), which wasn't in the plan.

## Current blockers

None in code. The Neon `test` link was slow and dropped several times this session.

## Approved decisions and ADR links

PRD #3, #7, #16 (confirmed 2026-11-12); D36.

## Risks and unresolved questions

- **`.claude/rules/backend.md`** still says the capacity-lock pattern is unsettled. Changing `.claude/` needs your approval; it is now settled in D36.
- **The global Prisma transaction timeout is 10 s.** It is fine with low database latency, but very slow links can turn long organizer transactions into 500s.
- **Fan-out recipients:** they are counted only by integration tests, with the queue mocked. The BullMQ worker itself didn't run.

## Exact next task

1. Run `pnpm --filter @uniconnect/backend test:integration` alone (nothing else running). If `memberships.int` or `events.int` fails, diagnose before going on.
2. Commit `feat/events` when you ask.
3. Plan the events frontend.

## Recommended resume instruction

> Read `CLAUDE.md`, `docs/SESSION_HANDOFF.md` and `docs/DECISIONS.md` D36. Run the full backend integration suite on its own, fix any failures, then plan the events frontend in plan mode.
