# Deployment and operations

How UniConnect runs in production, what each service needs, and how a release goes out. Decisions are in `docs/DECISIONS.md` (D46 for the hardening this relies on). The agent never touches the Neon `production` branch or production Redis (CLAUDE.md): every production step below is run by a person.

## Release blockers (2026-11-15)

Two things stop a production start today. Resolve both before the first deploy.

1. **Payments.** The API refuses to start in production with `PAYMENT_GATEWAY=mock`, and `sslcommerz` is not built (D32, ADR 0001). Until a decision is made, there is no valid production value. Options are listed in the session handoff.
2. **Email provider.** PRD #20 is still pending. Production requires `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` (env validation refuses to start without them), and verification and reset emails depend on them.

## Topology

```
Browser ──https──> Vercel (Next.js, frontend/)
                     │  src/proxy.ts adds x-uniconnect-client-ip + x-uniconnect-proxy-secret
                     │  next.config.ts rewrites /api/* to API_ORIGIN
                     ▼
               Railway or Render: "api" service    (pnpm --filter @uniconnect/backend start)
               Railway or Render: "worker" service (pnpm --filter @uniconnect/backend start:worker)
                     │
         ┌───────────┴───────────┐
   Neon Postgres `production`   Upstash Redis (TLS, eviction off, persistence on)
   pooled URL at runtime,       BullMQ queues, rate limits, chatbot cache
   direct URL for migrations
```

- **The browser only talks to Vercel.** Session cookies stay first-party (D23).
- **The API refuses any request without the proxy secret** (403 `PROXY_REQUIRED`), except `/api/v1/health` and `/api/v1/health/ready`, which the host's health checks call directly. So the API's public URL is not a second way in (H1).
- **One worker service runs every BullMQ worker and the daily schedules.** The API runs with `RUN_WORKERS_IN_API=false`, so each job runs in exactly one place.

## Environment by service

Names only; values live in each platform's secret store. Source of truth: `backend/src/config/env.ts` and the two `.env.example` files.

### API and worker (Railway or Render; both services get the same set)

| Variable                                                                       | Production rule                                                                            | Notes                                                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                     | `production`; required on Railway or Render (the API refuses to start there otherwise, L3) |                                                                                                                           |
| `PORT`                                                                         | set by the host                                                                            | API only                                                                                                                  |
| `FRONTEND_ORIGIN`                                                              | **required, https**                                                                        | the Vercel URL; CORS and the cross-site check (I4)                                                                        |
| `BETTER_AUTH_URL`                                                              | **required, https**                                                                        | the Vercel URL; cookies get `Secure` from it                                                                              |
| `BETTER_AUTH_SECRET`                                                           | required, 32+ characters                                                                   | `openssl rand -hex 32`; never reuse the development one                                                                   |
| `PROXY_SHARED_SECRET`                                                          | **required**, 32+ characters                                                               | the same value as on Vercel                                                                                               |
| `DATABASE_URL`                                                                 | required                                                                                   | Neon `production`, **pooled** host. Use `sslmode=verify-full` (pg warns that `require` changes meaning in its next major) |
| `DATABASE_URL_UNPOOLED`                                                        | for `prisma migrate deploy` only                                                           | Neon `production`, direct host                                                                                            |
| `REDIS_URL`                                                                    | required                                                                                   | `rediss://` (TLS)                                                                                                         |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`                             | **required**                                                                               | provider pending (PRD #20)                                                                                                |
| `SMTP_PORT`                                                                    | default 587                                                                                |                                                                                                                           |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`         | **required**                                                                               |                                                                                                                           |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                                               | **required**                                                                               | model per D44                                                                                                             |
| `PAYMENT_GATEWAY`                                                              | `mock` is **refused**                                                                      | see the release blockers                                                                                                  |
| `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_IS_LIVE`       | for the future gateway                                                                     | unused today                                                                                                              |
| `AUTH_EMAIL_LIMITS`                                                            | `off` is **refused**                                                                       | leave unset (`on`)                                                                                                        |
| `API_DOCS`                                                                     | default `off`                                                                              | `on` serves `/api/docs` to the super admin only                                                                           |
| `RUN_WORKERS_IN_API`                                                           | default `false`                                                                            | keep `false` while the worker service runs                                                                                |
| `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD`, `SEED_SUPER_ADMIN_NAME` | only when running `db:seed` once                                                           | remove afterwards                                                                                                         |
| `TEST_DATABASE_URL`, `TEST_DATABASE_URL_UNPOOLED`                              | **never** set in production                                                                | local test runs only                                                                                                      |

### Frontend (Vercel)

| Variable              | Rule     | Notes                                                              |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `API_ORIGIN`          | required | the API service's URL; server-side only, never sent to the browser |
| `PROXY_SHARED_SECRET` | required | the same value as the API's                                        |

`VERCEL=1` is set by Vercel itself. `src/proxy.ts` trusts `x-real-ip` only there, because Vercel's edge overwrites it.

## First deploy

1. Create the Neon `production` branch (a person, not the agent) and run `pnpm --filter @uniconnect/backend db:deploy` with its direct URL.
2. Run `pnpm --filter @uniconnect/backend db:seed` once with the `SEED_*` variables set (departments, one club each, the super admin). It is safe to rerun. Remove the seed variables afterwards.
3. In Upstash, confirm eviction is off and persistence is on (BullMQ needs both, PRD §21).
4. Create the two backend services from the repo:
   - build `pnpm install --frozen-lockfile && pnpm --filter @uniconnect/shared build && pnpm --filter @uniconnect/backend build`
   - start `pnpm --filter @uniconnect/backend start` or `start:worker`
   - health check path `/api/v1/health/ready` on the API service
5. Create the Vercel project with the root directory `frontend/`, and set its two variables.
6. Run the smoke checks below.

## Release (development → main)

1. CI is green on `development` (`.github/workflows/ci.yml`), and the local QA gate passed (below).
2. Open a PR `development` → `main`, review, and merge (no force-push, no history rewrite).
3. If the release adds migrations: run `db:deploy` against `production` **before** the new API starts. Migrations are forward-only and additive by convention. If one must be undone, write a new migration that reverses it; never edit an applied one.
4. Deploy the worker, then the API, then Vercel. The worker first, so jobs enqueued by the new API find a worker that understands them.
5. Run the smoke checks.

**Rollback:** redeploy the previous build on each platform. That is safe whenever the release's migrations were additive. If they weren't, apply the reversing migration first.

## Smoke checks after a deploy

- `GET https://<api>/api/v1/health/ready` returns `{ db: "ok", redis: "ok" }`.
- `GET https://<api>/api/v1/departments` returns **403 `PROXY_REQUIRED`**. This proves the API port is closed to direct callers.
- `https://<site>/` loads, and its response has `Content-Security-Policy` with `frame-ancestors 'none'`.
- Sign in as the super admin. The overview's health strip shows every queue `OK` (the worker is running).
- One read per module: clubs, events, announcements, the blood hub, the audit log and chatbot logs.
- Ask the assistant one question and check it answers in under 3 s (PRD §21).

## Backups and the restore drill (PRD §21, #24)

Neon keeps point-in-time history for the project (its retention window depends on the plan; check it in the console before relying on it). A restore creates a **new branch** from a past timestamp; nothing is overwritten.

Drill steps (run on `development`, never `production`; each Neon command beyond a read needs explicit approval at the time, CLAUDE.md):

1. Note a timestamp T a few minutes ago, and the row counts of `users`, `events` and `audit_logs` on `development` now.
2. Create a branch from `development` at T: `neon branches create --name restore-drill --parent development@<T>` (in `backend/`).
3. Get its connection string (`neon connection-string restore-drill`) and compare the same row counts with a read-only query. They should match the state at T.
4. Delete the branch: `neon branches delete restore-drill`.
5. Record the date, T, the counts and how long the restore took in `docs/DECISIONS.md` (PRD #24 row).

A real restore uses the same steps against `production`, then points `DATABASE_URL` at the restored branch (or promotes it to primary in the Neon console). A person does that.

## `main` release checklist

- [ ] Both release blockers above are resolved.
- [ ] CI green; locally: full backend unit and integration suites, frontend unit, full `pnpm e2e` (including `responsive.spec.ts` and `security-headers.spec.ts`), and `pnpm build`.
- [ ] Live Gemini check passed (`AI_LIVE=1 … e2e/ai.live.spec.ts`), with ask latency under 3 s.
- [ ] `docs/DECISIONS.md` §7 has no open High or Medium finding.
- [ ] The restore drill has been done and recorded.
- [ ] Every production variable above is set, and the secrets are new (not the development ones).
- [ ] `docs/SESSION_HANDOFF.md` and `docs/TASKS.md` are current. Tag the release: `git tag v1.0.0` on the merge commit, pushed with `git push origin v1.0.0`.
