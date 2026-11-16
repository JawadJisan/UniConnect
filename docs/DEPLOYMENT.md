# Deployment and operations

How UniConnect runs in production, what each service needs, and how a release goes out. Decisions are in `docs/DECISIONS.md` (D46 for the hardening this relies on). The agent never touches the Neon `production` branch or production Redis (CLAUDE.md): every production step below is run by a person.

## Payments and email in production (resolved 2026-11-15, D47)

1. **Payments.** Set `PAYMENT_GATEWAY=disabled`. The API starts, and membership purchase and renew answer 503 `PAYMENTS_UNAVAILABLE` (the student sees "Membership payments are not available yet") without writing any row. `mock` is refused in production. When the SSLCommerz merchant account exists, build `sslcommerz.gateway.ts` (D32, ADR 0001) and switch the value.
2. **Email.** SMTP via Nodemailer is the V1 provider (PRD #20). Any SMTP relay works (the university's mail server or a transactional provider's SMTP endpoint). Set `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS by default), `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` (the sender, e.g. `UniConnect <no-reply@…>`). Env validation refuses to start without them; verification and reset emails depend on them. After the first deploy, register a test account and check that the verification email arrives.

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

This two-service layout is the target (PRD §3). The free-tier variant below is what V1 deploys first.

## Render free tier: one service (D48)

Render's free tier has web services and Key Value, but no background worker. So one web service runs the API **and** every BullMQ worker. That is `RUN_WORKERS_IN_API=true`, the same switch `pnpm dev` uses. Moving to the two-service layout later only means adding a worker service on `start:worker` and setting the flag back to `false`.

```
Browser ──https──> Vercel (Next.js, frontend/)
                     │  /api/* rewritten to API_ORIGIN, with the proxy secret
                     ▼
               Render free web service: API + embedded workers (RUN_WORKERS_IN_API=true)
                     │
         ┌───────────┴───────────┐
   Neon Postgres `production`   Render Free Key Value (internal URL, same region)
```

**Render web service**

- Root directory: the repo root.
- Runtime: Node.
- Build: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @uniconnect/shared build && pnpm --filter @uniconnect/backend build`
- Start: `pnpm --filter @uniconnect/backend start`
- Health check path: `/api/v1/health/ready`

**Render Free Key Value**

- Create it in the **same region** as the web service.
- Use its **internal** URL (`redis://red-…:6379`) as `REDIS_URL`. The internal URL stays on Render's private network and needs no TLS. Leave external access off.
- Set the max-memory policy to **`noeviction`**. BullMQ needs it, and an evicted job key corrupts a queue.
- The free instance has **no persistence**. A restart loses queued jobs (pending emails, event fan-outs). The daily schedules re-register when the service starts (`startWorkers()`), so only in-flight work is lost.
- Its memory is small. Queues trim completed jobs, and the chatbot cache has a TTL, so this fits V1's size. If `/health/ready` reports `redis: error` with OOM errors in the log, upgrade the instance.

**Free-tier behaviour to expect**

- The web service **sleeps after about 15 idle minutes** and takes up to a minute to wake on the next request. While it sleeps the workers sleep too: emails queued just before are sent on wake, and the daily jobs (membership and term expiry, event reminders, blood-request expiry, chat-log purge) run late, when the next visitor wakes it. That is acceptable for a demo, but not for production SLAs (PRD §21's 99.5% uptime needs a paid instance).
- Idle polling is kept light: in production each worker long-polls for **30 s** (`drainDelay`, `src/workers/options.ts`) instead of BullMQ's 5 s. BullMQ's stalled-job check (`stalledInterval`, 30 s per worker) is the remaining idle cost. Raise it there if Redis commands ever become a limit.

**Environment variables: Render (web service)**

| Variable                                                               | Value                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                             | `production` (required: Render sets `RENDER`, and the API refuses to start as development, L3) |
| `PORT`                                                                 | set by Render; don't set it                                                                    |
| `FRONTEND_ORIGIN`                                                      | the Vercel URL, `https://…`                                                                    |
| `BETTER_AUTH_URL`                                                      | the Vercel URL, `https://…` (the same value)                                                   |
| `BETTER_AUTH_SECRET`                                                   | new, `openssl rand -hex 32`                                                                    |
| `PROXY_SHARED_SECRET`                                                  | new, 32+ characters; **the same value as on Vercel**                                           |
| `DATABASE_URL`                                                         | Neon `production`, pooled                                                                      |
| `DATABASE_URL_UNPOOLED`                                                | Neon `production`, direct (only for `db:deploy`)                                               |
| `REDIS_URL`                                                            | the Key Value **internal** URL                                                                 |
| `RUN_WORKERS_IN_API`                                                   | `true`                                                                                         |
| `PAYMENT_GATEWAY`                                                      | `disabled`                                                                                     |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`        | the SMTP relay (D47)                                                                           |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | the Cloudinary account                                                                         |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                                       | the Gemini key and model (D44)                                                                 |
| `API_DOCS`                                                             | optional; `on` serves `/api/docs` to the super admin                                           |

Leave unset: `AUTH_EMAIL_LIMITS` (production refuses `off`), `SSLCOMMERZ_*`, `TEST_DATABASE_URL*`. Set `SEED_SUPER_ADMIN_*` only while running `db:seed` once.

**Environment variables: Vercel (project root `frontend/`)**

| Variable              | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| `API_ORIGIN`          | the Render service URL, `https://<service>.onrender.com` (server-side only) |
| `PROXY_SHARED_SECRET` | **the same value as on Render**                                             |

After both deploy, run the smoke checks, plus the checks deferred from the local QA (D48): the live Gemini spec's three steps by hand (ask, chatbot log without PII, Draft with AI), a p95 sample of the standard `/api/v1` reads (PRD §21: under 300 ms), and the assistant showing "isn't set up" if Gemini is ever unset. The free service's first request after sleeping is slow, so measure p95 after a warm-up request.

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
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`                             | **required**                                                                               | SMTP via Nodemailer, any relay (PRD #20, D47)                                                                             |
| `SMTP_PORT`                                                                    | default 587                                                                                |                                                                                                                           |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`         | **required**                                                                               |                                                                                                                           |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                                               | **required**                                                                               | model per D44                                                                                                             |
| `PAYMENT_GATEWAY`                                                              | `mock` is **refused**                                                                      | set `disabled` until SSLCommerz is built (D47)                                                                            |
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
   On Render Free Key Value, see the Render section above instead. Size the plan for BullMQ: its workers poll Redis even when idle, and on 2026-11-15 the shared development database hit Upstash's **500,000-request monthly limit** (`ERR max requests limit exceeded`). When that happens, sign-in fails closed (Better Auth's limiter store), the AI routes answer 503 `AI_UNAVAILABLE` (their limiter fails closed, D44), `/health/ready` reports `redis: error`, and queued emails stop. Use a plan without a request cap (or with headroom) for production, keep production on its own database, and alert on usage.
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
2. Create a scratch branch from the source's head, then restore that branch (only it) to the source at T (in `backend/`):
   - `neon branches create --name restore-drill --parent development --no-secrets`
   - `neon branches restore restore-drill development@<T>`

   Neon CLI 9.2 rejects `--parent development@<T>`, and a bare timestamp as `--parent` means the **default branch** (`production`), so never pass one.

3. Compare the same row counts on the restored branch with a read-only query (`neon connection-string restore-drill`, passed to the script through an env var, never printed). They should match the state at T.
4. Delete the branch: `neon branches delete restore-drill`, then `neon branches list`.
5. Record the date, T, the counts and how long the restore took below and in `docs/DECISIONS.md` (PRD #24 row).

### Drill record

| Date       | Source and T                          | Result                                                                                                                                                                                                                                                                                                                                                                                                             | Timing                                                         |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 2026-11-15 | `development` at 2026-11-15T16:58:48Z | **Pass.** Every count matched the source as of T: departments 3, users 4, clubs 3, audit_logs 6 (latest 2026-11-08T09:46Z), 3 applied migrations; memberships, payments, events, announcements, blood donations and chat logs 0. Branch deleted afterwards. `development` holds little data and had no writes between T and the drill, so this proves the procedure and its timing, not recovery of recent changes | create 4.0 s, restore 3.0 s, first query (cold compute) 12.8 s |

A real restore uses the same steps against `production`, then points `DATABASE_URL` at the restored branch (or promotes it to primary in the Neon console). A person does that.

## `main` release checklist

- [x] Payments and email decided (D47): `PAYMENT_GATEWAY=disabled`, SMTP via Nodemailer.
- [ ] CI green; locally: full backend unit and integration suites, frontend unit, full `pnpm e2e` (including `responsive.spec.ts` and `security-headers.spec.ts`), and `pnpm build`.
- [ ] Live Gemini check passed, with ask latency under 3 s. Locally with `AI_LIVE=1 … e2e/ai.live.spec.ts`, or, as D48 allows for the first release, on the deployed stack straight after the Render and Vercel deploy.
- [ ] `docs/DECISIONS.md` §7 has no open High or Medium finding.
- [x] The restore drill has been done and recorded (2026-11-15, above).
- [ ] Every production variable above is set, and the secrets are new (not the development ones).
- [ ] `docs/SESSION_HANDOFF.md` and `docs/TASKS.md` are current. Tag the release: `git tag v1.0.0` on the merge commit, pushed with `git push origin v1.0.0`.
