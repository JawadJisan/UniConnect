# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

University club management platform. pnpm monorepo: `backend/` (Express 5 API), `frontend/` (Next.js), `packages/shared/` (`@uniconnect/shared`).

**Current state:** database and authentication. `schema.prisma` has all 18 models, migrated to the Neon `development` branch. Routes so far: Better Auth under `/api/auth/*`, `POST /api/v1/auth/register/student` and `/faculty`, and `/api/v1/health` plus `/health/ready`. No feature modules (clubs, events, payments, ...) yet.

**Sources of truth:** `docs/UniConnect_PRD_V1.md`, `docs/DATABASE_SCHEMA_V1.md`. Open decisions, version pins and known doc issues are in `docs/DECISIONS.md`. Most of its 25 PRD decisions are still unconfirmed defaults; the table marks the ones that are confirmed or built. UI rules and tokens are in `docs/DESIGN.md`; `/design` in dev shows them all.

## Commands

Run from the repo root: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format`, `pnpm format:check`, `pnpm db:up`, `pnpm db:down`.

Single tests (build shared first if `dist/` is missing or stale: `pnpm --filter @uniconnect/shared build`):

```sh
pnpm --filter @uniconnect/backend test tests/health.test.ts
pnpm --filter @uniconnect/frontend test tests/setup.test.tsx -t "renders the home page"
```

Prisma (from `backend/`, or with `pnpm --filter @uniconnect/backend`): `db:migrate` (`migrate dev`), `db:deploy`, `db:status`, `db:generate`, `db:studio`, `db:seed` (departments and the super admin, from the `SEED_*` env vars; safe to rerun); `exec prisma validate`. Backend `build`, `typecheck` and `test` run `prisma generate` first. The Prisma config reads `DATABASE_URL_UNPOOLED`, so `backend/.env` must exist (copy `backend/.env.example`, then run `neon checkout development` in `backend/` to fill in the database URLs).

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

- **Layering:** Controller → Service → Repository. Business rules and `prisma.$transaction` live in services, Prisma queries in repositories.
- **Better Auth** mounts at `/api/auth/*splat`, before `express.json()`, or requests hang.
- **Roles:** `User.role` is derived and only `RoleService.recompute` writes it. `user_type` never changes.
- **No database triggers.** The database only enforces CHECK constraints and partial unique indexes. List hand-written migration objects in `docs/DECISIONS.md` §3.
- **Audit rows** are written in the same transaction as the change they record: `auditService.record(tx, ...)`. The only exceptions are the Better Auth hooks (`LOGIN`, `EMAIL_VERIFIED`, `PASSWORD_CHANGED`), which can't join Better Auth's writes. Action names are `AUDIT_ACTIONS` in shared.
- **Auth middleware:** never commit a stub that calls `next()`. It would silently leave routes open. `requireRole` and `requireDepartmentScope` throw (500) when `requireAuth` didn't run first; keep them failing closed.
- **Tenant isolation:** department-scoped queries filter by `department_id` unless the caller is `super_admin`.
- **Payments:** trust SSLCommerz only after the Order Validation API confirms, never the IPN body.
- **Money:** `DECIMAL(10,2)` in BDT. Never floats.
- **UI:** use tokens from `globals.css`, not raw hex. Import `cn` from `@/lib/utils`: `shadcn add` writes the wrong import, and custom type or shadow names must be registered there. Use `m.*`, not `motion.*`, which throws under strict `LazyMotion`.

## Before building on these

- **Database schema:** value sets are `VARCHAR` + CHECK, never Prisma enums. Hand-written objects (partial uniques, CHECKs, GIN indexes) are listed in `docs/DECISIONS.md` §3. Add new ones in a `--create-only` migration and list them there.
- **Routes:** register `/clubs/my-club` and `/events/my-registrations` before their `/:id` routes.
- **Session-dependent pages:** `cacheComponents` and `partialPrefetching` are on in `frontend/next.config.ts`. Revisit them when these pages are built.
- **Rate limiting:** Express `trust proxy` is `1`, for the Next.js rewrite. Raise it if another proxy goes in front, or every client behind it shares one limit. Rate limiters are skipped when `NODE_ENV=test`, because tests mock Redis.
- **Better Auth CLI:** use `auth@latest generate`, not `@better-auth/cli`. It writes to `schema.prisma`, so review the diff.

## Version traps

Don't upgrade these without checking `docs/DECISIONS.md`:

- `prisma`, `@prisma/client`, `@prisma/adapter-pg` are pinned to 7.10.1. A plain `prisma` install pulls an 8.0 release candidate that Better Auth doesn't support.
- `typescript` stays on `~5.9`. Version 7 is outside the `ts-jest` and `typescript-eslint` ranges.
