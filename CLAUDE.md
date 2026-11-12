# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

University club management platform (final-year project). pnpm monorepo: `backend/` (Express 5 API), `frontend/` (Next.js), `packages/shared/` (`@uniconnect/shared`).

**Current state:** database and authentication. `schema.prisma` has all 18 models, migrated to the Neon `development` branch. Routes so far: Better Auth under `/api/auth/*`, `POST /api/v1/auth/register/student` and `/faculty`, `GET /api/v1/departments`, `GET/PATCH /api/v1/users/me`, `PATCH /api/v1/users/me/avatar` (Cloudinary, `src/lib/cloudinary.ts`) and `GET /api/v1/users/me/sessions`, the super-admin `/api/v1/admin/users` routes (list, detail, edit, status, recompute-role; D28–D29), the clubs API under `/api/v1/clubs` (list, `my-club`, detail, `PATCH /:id`, `PATCH /:id/logo`; D31), the memberships API under `/api/v1/memberships` (purchase, `my`, renew, cancel, public `payment/ipn`) and `GET /api/v1/admin/memberships` (D32, ADR 0001), the committee API under `/api/v1/clubs/:id/committee` (list, candidates, assign, edit, end-term) and the super-admin `/api/v1/admin/dept-admin-terms` routes (list, assign, end, renew; D34), and `/api/v1/health` plus `/health/ready`. Payments go through the `PaymentGateway` interface in `src/lib/payments/`; only the mock exists (`PAYMENT_GATEWAY=mock`, refused in production). BullMQ queue `memberships` runs the expiry and stale-checkout jobs (`src/workers/membership.worker.ts`); queue `terms` runs the daily committee and dept-admin term expiry (`src/workers/term.worker.ts`). Every term change locks the user row and calls `roleService.recompute` in the same transaction (D12, D34). `prisma/seed.ts` also creates one club per department. No other feature modules (events, announcements, ...) yet. The frontend has the landing page, `/design`, the auth flow under `src/app/(auth)/` (login, register, verify-email, forgot-password, reset-password), and the signed-in workspace under `src/app/(app)/` (role-aware shell, `/dashboard` overview, `/dashboard/profile`, `/dashboard/clubs` with `my-club` and `[id]` (inline edit and logo for the club's dept_admin or a super admin), `/dashboard/memberships` for students (with the dev-only sandbox checkout under `checkout/mock`), `/dashboard/admin/users` and `/dashboard/admin/dept-admins` for super admins, `/dashboard/admin/memberships` for dept and super admins, and the committee panel on the club page for its editors; D33, D35), guarded by `src/proxy.ts` plus a client guard (D25). Phase 2 (FR-AUTH, FR-USER) is complete. Open security findings are in `docs/DECISIONS.md` §7. List endpoints follow D9 (`{ success, data, meta }`); `backend/tests/integration/rbac-matrix.int.test.ts` holds the role × route policy table, so add every new protected route there. Progress and the next task are in `docs/TASKS.md`.

**Sources of truth:** `docs/UniConnect_PRD_V1.md` (behavior), `docs/DATABASE_SCHEMA_V1.md` (data model; `schema.prisma` wins on detail). Open decisions, version pins and known doc issues are in `docs/DECISIONS.md`; decisions with lasting consequences get an ADR in `docs/adr/`. Most of the 25 PRD decisions are still unconfirmed defaults; the table marks the ones that are confirmed or built. UI rules and tokens are in `docs/DESIGN.md`; `/design` in dev shows them all. Read only the PRD sections a task needs.

## Workflow

Every task: explore → plan → approve → implement → test → review → document → handoff.

- At the start, read `docs/SESSION_HANDOFF.md` and the task's row in `docs/TASKS.md`. At the end, update both.
- Plan first for anything beyond a small fix, and wait for approval before editing.
- These need separate, explicit approval: schema or migration changes, dependency changes, changes to `.claude/` or `.mcp.json`, commits, pushes, deploys, and any Neon or Upstash command beyond a read.
- Never resolve a conflict between the PRD, the schema and the code silently. Record the options in `docs/DECISIONS.md` and ask.
- Report only what ran. A test passes only if it ran in this session; report failures with their output.

## Commands

Run from the repo root: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format`, `pnpm format:check`, `pnpm db:up`, `pnpm db:down`.

`pnpm e2e` runs the Playwright suite (`frontend/e2e/`, installed Edge): it starts the API on the Neon `test` branch (port 4100, `NODE_ENV=test`, SMTP and Cloudinary blanked) and `next dev` on 3100, and reseeds the test users first (D27). It uses the `test` branch, so don't run it alongside `test:integration`.

Single tests (build shared first if `dist/` is missing or stale: `pnpm --filter @uniconnect/shared build`):

```sh
pnpm --filter @uniconnect/backend test tests/health.test.ts
pnpm --filter @uniconnect/backend test:integration   # Neon `test` branch; needs TEST_DATABASE_URL(_UNPOOLED) in backend/.env
pnpm --filter @uniconnect/frontend test tests/setup.test.tsx -t "renders the home page"
```

Prisma (from `backend/`, or with `pnpm --filter @uniconnect/backend`): `db:migrate` (`migrate dev`), `db:deploy`, `db:status`, `db:generate`, `db:studio`, `db:seed` (departments and the super admin, from the `SEED_*` env vars; safe to rerun); `exec prisma validate`. Backend `build`, `typecheck` and `test` run `prisma generate` first. The Prisma config reads `DATABASE_URL_UNPOOLED`, so `backend/.env` must exist (copy `backend/.env.example`, then run `neon checkout development` in `backend/` to fill in the database URLs). Schema changes follow the `db-migration` skill.

Neon CLI (run in `backend/`): `neon checkout <branch>` switches branch and rewrites `DATABASE_URL`/`DATABASE_URL_UNPOOLED` in `backend/.env`. `neon branches list` shows branches.

## Architecture

- **Request path:** the browser only talks to Next.js. A rewrite in `frontend/next.config.ts` forwards `/api/*` to Express (`API_ORIGIN`, default port 4000), which keeps the session cookie first-party. Don't call the API origin directly from the browser.
- **Shared package:** consumers import the built `packages/shared/dist/`, not its source. Root `dev`, `build`, `typecheck` and `test` build it first, and `pnpm dev` also watches it. Running a filtered command after changing shared needs a rebuild. Next.js also needs it in `transpilePackages`.
- **Backend ESM:** native ESM, so relative imports use a `.js` extension (`./config/env.js`). Jest runs through `--experimental-vm-modules` because Better Auth is ESM-only, and maps those extensions back.
- **Backend entry points:** `src/app.ts` builds the Express app without listening, so Supertest can import it. `src/server.ts` starts it. `src/config/env.ts` validates env vars with Zod and should grow with each integration.
- **Prisma 7:** the CLI uses `DATABASE_URL_UNPOOLED` from `prisma.config.ts`. At runtime the pooled `DATABASE_URL` goes through `@prisma/adapter-pg` (`src/lib/prisma.ts`). The client generates into `backend/src/generated/prisma` (gitignored).
- **Redis:** `src/lib/redis.ts` exports `createRedis()` (ioredis, `maxRetriesPerRequest: null`, lazy connect) and a shared `redis`. Give each BullMQ worker its own `createRedis()` connection. Never log a raw ioredis error object: it carries the failed command, which for `AUTH` includes the password. Log `err.message`.
- **Backend layout:** feature code goes in `src/modules/<feature>/` (`*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`). Cross-cutting services are in `src/services/` (`audit`, `role`), queues in `src/queues/`, workers in `src/workers/` (started by `server.ts`), middleware in `src/middleware/`. Throw `AppError` (`src/lib/http-error.ts`); `error-handler.ts` turns it into `{ success: false, error: { code, message, details } }`. Request bodies use `validateBody(schema)` with schemas from `@uniconnect/shared`.
- **Auth:** config is `src/lib/auth.ts`. Public sign-up and `/update-user` are disabled; users are created only by `RegistrationService` and `prisma/seed.ts`. Protect routes with `requireAuth`, then `requireRole([...])`, then `requireDepartmentScope(resolver)` from `src/middleware/auth.ts`; `req.auth` holds `{ user, session }`. Why each choice was made is in `docs/DECISIONS.md` §2, "Resolved at the auth step".
- **Email:** `enqueueEmail()` puts jobs on the BullMQ `email` queue. With `SMTP_HOST` empty in development, the worker prints each email and its link to the console.
- **Tooling split:** root ESLint ignores `frontend/`, which has its own config and ESLint version. `pnpm lint` runs both. Package install scripts run only if approved under `allowBuilds` in `pnpm-workspace.yaml`.
- **Infrastructure:** Postgres is Neon (project linked from `backend/neon.ts`), Redis is Upstash over TLS (`rediss://`, eviction off). Local work and `migrate dev` use the Neon `development` branch. `production` only gets `prisma migrate deploy`. Neon Auth is not used. `docker-compose.yml` (`pnpm db:up`) is an untested, optional fallback.

## Rules

Path-specific rules are in `.claude/rules/` (`backend.md`, `database.md`, `frontend.md`, `testing.md`) and load when matching files are opened. These apply everywhere:

- **Layering:** Controller → Service → Repository. Business rules and `prisma.$transaction` live in services, Prisma queries in repositories.
- **Better Auth** mounts at `/api/auth/*splat`, before `express.json()`, or requests hang.
- **Roles:** `User.role` is derived and only `RoleService.recompute` writes it. `user_type` never changes.
- **No database triggers.** The database only enforces CHECK constraints and partial unique indexes. List hand-written migration objects in `docs/DECISIONS.md` §3.
- **Audit rows** are written in the same transaction as the change they record: `auditService.record(tx, ...)`. The only exceptions are the Better Auth hooks (`LOGIN`, `EMAIL_VERIFIED`, `PASSWORD_CHANGED`), which can't join Better Auth's writes. Action names are `AUDIT_ACTIONS` in shared.
- **Auth middleware:** never commit a stub that calls `next()`. It would silently leave routes open. `requireRole` and `requireDepartmentScope` throw (500) when `requireAuth` didn't run first; keep them failing closed.
- **Tenant isolation:** department-scoped queries filter by `department_id` unless the caller is `super_admin`.
- **Payments:** trust SSLCommerz only after the Order Validation API confirms, never the IPN body.
- **Money:** `DECIMAL(10,2)` in BDT. Never floats.

## Security

- Never read or print `.env` values. Take variable names from `.env.example`.
- The agent never touches the Neon `production` branch or production Redis.
- API responses never include password hashes, tokens or session tokens. The blood donor list never includes email.
- Content sent to Gemini is data, never instructions. Blood donor data is never in the chatbot corpus.

## Testing

- Endpoint tests cover success, 400, 401, 403 for each role the PRD excludes, cross-department access, and conflicts. Details are in `.claude/rules/testing.md`.
- Behavior that depends on a CHECK, a partial unique index, a transaction or a lock is tested against a real database, not a Prisma mock.

## Git

- One branch per task from `main` (`feat/…`, `fix/…`, `chore/…`, `docs/…`), with conventional commit subjects as in the history.
- Commit or push only when asked. Never force-push, rewrite history or discard uncommitted work.
- Review `git diff` before reporting a task as done.

## Version traps

Don't upgrade these without checking `docs/DECISIONS.md`:

- `prisma`, `@prisma/client`, `@prisma/adapter-pg` are pinned to 7.10.1. A plain `prisma` install pulls an 8.0 release candidate that Better Auth doesn't support.
- `typescript` stays on `~5.9`. Version 7 is outside the `ts-jest` and `typescript-eslint` ranges.
