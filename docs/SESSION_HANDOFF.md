# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Phase 10 close-out on `chore/hardening` (sessions of 2026-11-16 and 2026-11-17). The plan was to finish the Redis-dependent QA (full e2e, live Gemini, p95), then release.

The local Upstash free database is over its 500k monthly requests, so the user deferred the Redis-dependent checks to the deployed stack. They also asked for Render free-tier readiness, the static gate, and a release through `development` into `main` (D48).

## Completed work

- **D47 work from the last session**, committed in this release: `PAYMENT_GATEWAY=disabled`, the blood-list refetch fix, and the e2e locator fixes. See D47.
- **Render free tier (D48).**
  - One web service runs the API and every BullMQ worker with the existing `RUN_WORKERS_IN_API=true`. The user chose that over adding an `ENABLE_EMBEDDED_WORKER` flag.
  - New `backend/src/workers/options.ts`: `workerOptions(concurrency)` gives each worker its own connection and a `drainDelay` of 30 s in production (BullMQ's 5 s elsewhere). All six workers use it.
  - Test: `tests/worker-options.test.ts`.
- **Docs.**
  - `DEPLOYMENT.md` has a "Render free tier: one service" section: build and start commands, and Key Value settings (internal URL, `noeviction`, no persistence). It also covers sleep behaviour, the full Render and Vercel variable tables, and the deferred post-deploy checks. The `main` checklist allows the live Gemini check after deploy.
  - `.env.example` describes the Render `REDIS_URL` form and `RUN_WORKERS_IN_API=true` on Render.
  - DECISIONS has D48, which records the PRD §3 deviation and relaxes D46's "live Gemini before `main`". TASKS has the Phase 10 row.

## Commands executed and results

| Command                                                          | Result                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm e2e --workers=1` (2026-11-16)                              | **50 passed, 1 failed, 1 skipped** (20.6 min). The failure is `ai.spec` "the real API says when Gemini is not set up"                                                                                                                                              |
| `pnpm e2e --workers=1 e2e/ai.spec.ts`, twice                     | 3 passed, the same test failed. The Playwright trace shows 503 `AI_UNAVAILABLE`, from the AI limiter failing closed                                                                                                                                                |
| Read-only Redis probes (PING, `EVAL` of a TTL)                   | PING answers PONG, but `EVAL` and the app's writes get `ERR max requests limit exceeded. Limit: 500000, Usage: 500007`. **PING passing doesn't mean the database works.** `backend/.env` was last modified 2026-11-14, so it still holds the exhausted Upstash URL |
| `worker-options.test.ts` and `redis-clients.test.ts`             | 6/6                                                                                                                                                                                                                                                                |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` | Pass                                                                                                                                                                                                                                                               |
| `pnpm test`                                                      | Backend 442/442 (23 suites), frontend 453/453 (36 suites)                                                                                                                                                                                                          |

## Not covered

- **Not run, deferred to the deployed stack (D48):** `ai.spec` "not set up", the p95 smoke (PRD §21, under 300 ms) and the live Gemini spec. None of them has passed yet.
- The integration suite didn't run this session; its last run was 771/771 on 2026-11-15. The Redis-backed parts of e2e have only been run against the exhausted database.
- The Render setup hasn't been deployed or tried: no Render or Vercel service exists yet.

## Exact next task

1. A person deploys:
   - Neon `production`: `db:deploy`, then `db:seed`.
   - Render Free Key Value: same region, `noeviction`.
   - The Render web service: variables per `docs/DEPLOYMENT.md`.
   - The Vercel project.
2. Run the smoke checks and the deferred checks in `docs/DEPLOYMENT.md`:
   - The assistant answers in under 3 s, and the chatbot log has no PII.
   - Draft with AI works.
   - p95 of the standard reads after warm-up.
3. Record the results in DEPLOYMENT.md and TASKS, then tick the `main` checklist. Tag `v1.0.0` once green.
4. For local work: point `backend/.env` `REDIS_URL` at a working Redis, then rerun `pnpm e2e --workers=1`.

## Recommended resume instruction

> Read `CLAUDE.md`, this file, D48 and `docs/DEPLOYMENT.md` (Render free tier). Help with the Render + Vercel deploy, then run the deferred live checks and record them.
