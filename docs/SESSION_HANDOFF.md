# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Phase 9, the AI chatbot, Part 1 (backend), on `feat/chatbot` cut from `development`. Built and verified this session; **not committed**.

Earlier this session: Phase 8 (dashboards and the audit log viewer) was finished, committed and merged into `development` as `46c1d60` (not pushed). Local `development` is ahead of `origin/development`.

The user approved the plan with "yes go ahead", without answering its seven open questions. Each was built at the recommended default and recorded in D44, so any of them can still be changed:

- published events only
- 90-day retention
- 503 when Gemini isn't configured
- the limiter fails closed
- the scope-hash cache key
- the upcoming-events fallback
- PII-stripped questions in ChatLog

## Completed work

- **Config:** `GEMINI_API_KEY` and `GEMINI_MODEL` in `env.ts`, required in production; a comment in `.env.example`. Suggested model: `gemini-3.8-flash`, from Google's model page on 2026-11-14 (DECISIONS §2 pins).
- **Gemini:** `src/lib/gemini.ts` (`aiConfigured`, `generateText`, 10 s abort, message-only errors).
- **Rate limit:**
  - `src/lib/rate-limit.ts`: `consume` moved out of `auth.ts`, unchanged.
  - `src/middleware/rate-limit.ts`: `limitPerUser` and `AI_BUCKET` (10 a minute, shared by both AI routes, fails closed).
- **Retrieval:**
  - `eventRepository.searchVisible` / `upcomingVisible` (reuse `visibleTo`, published only)
  - `announcementRepository.searchVisible` (`visibleSql` mirrors `whereVisible`)
  - `clubRepository.search`
- **`src/modules/chatbot/`:**
  - `chatbot.prompt.ts`: `toTsQuery`, `stripPii`, prompts.
  - `chatbot.cache.ts`: scope-hash key, 5-minute TTL, fails open.
  - `chatbot.retrieval.ts`, `chatbot.service.ts` (ask, logs, `purgeOldLogs`), controller, routes (`chatbotRouter`, `adminChatbotRouter`).
- **`src/modules/ai/`:** FR-AI-003, the event description draft.
- **Retention:** queue `chatbot` and `workers/chatbot.worker.ts` (`purge-chat-logs`, 03:30 Dhaka), wired in `server.ts`. The queue was added to `QUEUE_NAMES`, so it appears in the health strip.
- **Wiring:** `app.ts` mounts `/api/v1/chatbot`, `/api/v1/admin/chatbot` and `/api/v1/ai`. The dashboard's `chatbot.enabled` is now `aiConfigured()`.
- **Shared:** `schemas/chatbot.ts` (`FALLBACK_ANSWER`, schemas, types).
- **Tests:**
  - New: `tests/chatbot.test.ts` (42) and `tests/integration/chatbot.int.test.ts`.
  - Harness: `FakeRedis` stores `get`/`set` values; mocks for `gemini.js` (records prompts) and `chatbot.queue.js`.
  - RBAC matrix: three rows.
  - `dashboard.int.test.ts`: chatbot enabled, six queues.
- **Docs:** D44, the Gemini pin, issue 15 resolved, PRD #18 marked built as default, `TASKS.md` row 9, `CLAUDE.md`.

## Commands executed and results

| Command                                                                                | Result                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @uniconnect/backend test tests/chatbot.test.ts`                         | First 41/42: Bangla words were split, because vowel signs are `\p{M}`, not letters. The tokenizer now keeps marks; 42/42 |
| `pnpm --filter @uniconnect/backend test`                                               | **395/395** (19 suites)                                                                                                  |
| `pnpm --filter @uniconnect/backend test:integration` chatbot + rbac-matrix + dashboard | **414/414** (3 suites)                                                                                                   |
| `pnpm typecheck`, `pnpm lint`                                                          | pass                                                                                                                     |
| `pnpm format:check`                                                                    | First flagged `tests/chatbot.test.ts`; formatted, then pass                                                              |

## Not covered

- **No live Gemini call:** every test mocks `src/lib/gemini.ts`. Not checked yet: the real model ID, latency (PRD target < 3 s) and answer quality. One manual ask with a real key in `backend/.env` against the `development` branch would cover them.
- **The production env refine** (key and model required) has no test; it follows the existing SMTP and Cloudinary pattern.
- **Full integration suite:** only the three suites above ran. `auth.ts` changed only by importing `consume` from its new module; the auth integration suites didn't run.
- **The purge job's BullMQ schedule:** the integration test calls `purgeOldLogs` directly.

## Exact next task

When the user asks: commit Phase 9 Part 1 on `feat/chatbot` (shared, backend, tests, docs). Then Part 2, the chatbot frontend: a chat panel on the overview (shown when `chatbot.enabled`), the super admin chat log viewer, and "Draft with AI" on the event form.

## Recommended resume instruction

> Read `CLAUDE.md`, this file and D44 in `docs/DECISIONS.md`. Review `git diff` on `feat/chatbot`, commit when asked, then plan the chatbot frontend in plan mode.
