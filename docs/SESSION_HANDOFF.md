# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

1. **Phase 9 Part 2 released:**
   - committed on `feat/chatbot-frontend` (`cd1e547`, `866dd2d`, `fb43d94`)
   - merged into `development` as `8a972e3`
   - typecheck passed, pushed to `origin/development`
2. **Phase 10, hardening and release readiness:** on `chore/hardening`, cut from `development`. **Not pushed, not merged.** The user approved the plan without answering its ten open decisions; each was built at the recommended default and recorded in D46.

## Completed work (commits on `chore/hardening`)

- **`8a63174` fix: close the open security review findings.** All of DECISIONS §7:
  - H1: trusted client IP through the Next proxy plus `PROXY_SHARED_SECRET`
  - M4: reset padded to 2 s; the measured gap went from 252 ms to 4 ms
  - L3: production env rules
  - L4: auth body cap
  - L5: department scope hides existence by default
  - L6: name schema
  - I1–I6: no token in JSON, 30-day absolute sessions, frontend CSP, cross-site mutation check, global per-IP limit, no stacks in production logs, request ids
- **`f2eb36b` test(backend): audit every GET route for secrets and PII by role.** `pii-leak.int.test.ts` plus `docs/reviews/2026-11-security-audit.md`. No new IDOR or leak was found.
- **`8fa6725` feat(backend): serve OpenAPI 3.0 docs at /api/docs.** The drift test walks the app's routes through `lib/mount.ts`.
- **`f5cd52f` chore: run workers as their own process and add CI.** `src/worker.ts`, `RUN_WORKERS_IN_API`, `.github/workflows/ci.yml`.
- **Last commit of the session:**
  - `e2e/responsive.spec.ts` (375 px, every major page, three roles)
  - frontend `tests/jest.setup.ts` (Testing Library's async timeout raised to 3 s for the parallel run)
  - `docs/DEPLOYMENT.md` (topology, per-service env, release, rollback, restore drill, `main` checklist)
  - D46, the §7 rows, the PRD #24 row, `CLAUDE.md`, `TASKS.md` and this file

## Commands executed and results

| Command                                                                                          | Result                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`                                               | Pass (after fixing three lint errors and the formatting)                                                                                                                                         |
| `pnpm test` (all unit tests)                                                                     | Backend **437/437** (22 suites). Frontend: the first full run had 3 failures in two suites; they passed alone, and the next full run was 451/451. After `jest.setup.ts`, **451/451** (36 suites) |
| `test:integration` full, with coverage                                                           | **771/771** (18 suites, including `rbac-matrix`, `pii-leak` and `security-fixes`). Services and controllers: 93.99% statements, 85.95% branches, 98.45% functions, 97.87% lines (PRD target 70%) |
| `security-fixes.int` M4                                                                          | Failed first (median gap 252 ms); 4 ms after padding                                                                                                                                             |
| `pnpm build`                                                                                     | Pass (shared, backend `dist/server.js` and `dist/worker.js`, `next build`)                                                                                                                       |
| Built API (`RUN_WORKERS_IN_API=false`, port 4300) plus built worker, against `development`       | Both started; `/health/ready` gave db ok and redis ok; `/api/docs/openapi.json` 200; `x-request-id` present; both stopped afterwards                                                             |
| `playwright test e2e/ai.spec.ts` and `e2e/shell.spec.ts`, `admin.spec.ts` (before the hardening) | 4/4 and 10/10                                                                                                                                                                                    |
| Spike: `proxy.ts` headers through the `next.config` rewrite                                      | Forged secret and IP replaced by the proxy's own values                                                                                                                                          |
| Gemini probe (the app client, configured model)                                                  | One call timed out at 10 s; one answered in **4.4 s** (target < 3 s)                                                                                                                             |
| `pnpm e2e` (full, the QA gate)                                                                   | **Not completed.** Claude Code stopped it because the machine ran critically low on memory, before any test finished. Its leftover `next dev` (3100) and API (4100) processes were stopped       |

## Not covered

- **The full e2e suite after the hardening.** This includes:
  - the new `responsive.spec.ts` and `security-headers.spec.ts`
  - every existing spec against the new CSP, the Origin check, the proxy matcher and the name schema

  Rerun `pnpm e2e` with memory free: close other apps, and don't run it alongside `test:integration`.

- **The live Gemini spec** (`AI_LIVE=1 … e2e/ai.live.spec.ts`), the PRD < 3 s check. Google was slow: the last probe answered in 4.4 s.
- **The API p95 smoke** (Step 6.7).
- **The restore drill.** The steps are in `docs/DEPLOYMENT.md`; it needs explicit approval for the Neon branch create and delete.
- **The docs production gate** (`API_DOCS` on or off, super admin only) has no automated test; it's a two-line condition in `docs.routes.ts` and `app.ts`.
- **The H1, I1 and I2 tests weren't seen failing before their fixes** (they were written with them). The M4 test did fail first.
- **CI has never run on GitHub.** The workflow's commands match the local gate, which passed.

## Release blockers (`docs/DEPLOYMENT.md`)

1. `PAYMENT_GATEWAY`: `mock` is refused in production and `sslcommerz` isn't built, so the API can't start in production. A decision is needed: build SSLCommerz, or add a `disabled` mode that answers 503 on checkout.
2. SMTP provider (PRD #20) is pending; production requires it.

## Exact next task

1. Run `pnpm e2e` with memory free, and fix what fails.
2. Run the live Gemini spec and the p95 smoke.
3. Get the user's decision on the payment blocker, and approval for the restore drill.
4. When asked, push `chore/hardening` and merge it into `development`.

## Recommended resume instruction

> Read `CLAUDE.md`, this file, D46 and `docs/DEPLOYMENT.md`. On `chore/hardening`, run `pnpm e2e` and report; then the live Gemini spec. Ask for the payment-gateway decision before anything else ships.
