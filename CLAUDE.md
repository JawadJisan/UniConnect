# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

University club management platform. pnpm monorepo: `backend/` (Express 5 API), `frontend/` (Next.js), `packages/shared/` (`@uniconnect/shared`).

**Current state:** project setup only. The only route is `/api/v1/health`, the only page is a placeholder, and `schema.prisma` has no models. Most patterns below come from the PRD and aren't in the code yet.

**Sources of truth:** `docs/UniConnect_PRD_V1.md`, `docs/DATABASE_SCHEMA_V1.md`. Open decisions, version pins and known doc issues are in `docs/DECISIONS.md`. All 25 PRD decisions there are unconfirmed defaults. UI rules and tokens are in `docs/DESIGN.md`; `/design` in dev shows them all.

## Commands

Run from the repo root: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format`, `pnpm format:check`, `pnpm db:up`, `pnpm db:down`.

Single tests (build shared first if `dist/` is missing or stale: `pnpm --filter @uniconnect/shared build`):

```sh
pnpm --filter @uniconnect/backend test tests/health.test.ts
pnpm --filter @uniconnect/frontend test tests/setup.test.tsx -t "renders the home page"
```

Prisma: `pnpm --filter @uniconnect/backend exec prisma validate`. The Prisma config reads `DIRECT_URL`, so `backend/.env` must exist (copy `backend/.env.example`).

## Architecture

- **Request path:** the browser only talks to Next.js. A rewrite in `frontend/next.config.ts` forwards `/api/*` to Express (`API_ORIGIN`, default port 4000), which keeps the session cookie first-party. Don't call the API origin directly from the browser.
- **Shared package:** consumers import the built `packages/shared/dist/`, not its source. Root `dev`, `build`, `typecheck` and `test` build it first, and `pnpm dev` also watches it. Running a filtered command after changing shared needs a rebuild. Next.js also needs it in `transpilePackages`.
- **Backend ESM:** native ESM, so relative imports use a `.js` extension (`./config/env.js`). Jest runs through `--experimental-vm-modules` because Better Auth is ESM-only, and maps those extensions back.
- **Backend entry points:** `src/app.ts` builds the Express app without listening, so Supertest can import it. `src/server.ts` starts it. `src/config/env.ts` validates env vars with Zod and should grow with each integration.
- **Prisma 7:** the CLI uses `DIRECT_URL` from `prisma.config.ts`. At runtime the pooled `DATABASE_URL` goes through `@prisma/adapter-pg`. The client generates into `backend/src/generated/prisma` (gitignored).
- **Tooling split:** root ESLint ignores `frontend/`, which has its own config and ESLint version. `pnpm lint` runs both. Package install scripts run only if approved under `allowBuilds` in `pnpm-workspace.yaml`.
- **Local infrastructure:** `docker-compose.yml` runs Postgres 17 and Redis 7 (`noeviction` for BullMQ). It hasn't been tested yet.

## Rules

- **Layering:** Controller → Service → Repository. Business rules and `prisma.$transaction` live in services, Prisma queries in repositories.
- **Better Auth** mounts at `/api/auth/*splat`, before `express.json()`, or requests hang.
- **Roles:** `User.role` is derived and only `RoleService.recompute` writes it. `user_type` never changes.
- **No database triggers.** The database only enforces CHECK constraints and partial unique indexes. List hand-written migration objects in `docs/DECISIONS.md` §3.
- **Audit rows** are written in the same transaction as the change they record.
- **Auth middleware:** never commit a stub that calls `next()`. It would silently leave routes open.
- **Tenant isolation:** department-scoped queries filter by `department_id` unless the caller is `super_admin`.
- **Payments:** trust SSLCommerz only after the Order Validation API confirms, never the IPN body.
- **Money:** `DECIMAL(10,2)` in BDT. Never floats.
- **UI:** use tokens from `globals.css`, not raw hex. Import `cn` from `@/lib/utils`: `shadcn add` writes the wrong import, and custom type or shadow names must be registered there. Use `m.*`, not `motion.*`, which throws under strict `LazyMotion`.

## Before building on these

- **Database schema:** the docs contradict themselves on enums, and §22 omits CHECKs (`docs/DECISIONS.md` §4, issues 1 and 2). Settle the enum rule before writing models.
- **Routes:** register `/clubs/my-club` and `/events/my-registrations` before their `/:id` routes.
- **Session-dependent pages:** `cacheComponents` and `partialPrefetching` are on in `frontend/next.config.ts`. Revisit them when these pages are built.
- **Rate limiting:** set Express `trust proxy` to the real proxy count, or every client behind the Next.js proxy shares one limit.
- **Better Auth CLI:** use `auth@latest generate`, not `@better-auth/cli`. It writes to `schema.prisma`, so review the diff.

## Version traps

Don't upgrade these without checking `docs/DECISIONS.md`:

- `prisma`, `@prisma/client`, `@prisma/adapter-pg` are pinned to 7.10.1. A plain `prisma` install pulls an 8.0 release candidate that Better Auth doesn't support.
- `typescript` stays on `~5.9`. Version 7 is outside the `ts-jest` and `typescript-eslint` ranges.
