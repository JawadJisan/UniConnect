# UniConnect

University club management platform. pnpm monorepo: `backend/` (Express 5 API), `frontend/` (Next.js), `packages/shared/` (`@uniconnect/shared`).

**Sources of truth:** `docs/UniConnect_PRD_V1.md`, `docs/DATABASE_SCHEMA_V1.md`. Open decisions, version pins and known doc issues are in `docs/DECISIONS.md`.

## Commands

Run from the repo root: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format`, `pnpm db:up`, `pnpm db:down`.

## Rules

- **Layering:** Controller → Service → Repository. Business rules and `prisma.$transaction` live in services, Prisma queries in repositories.
- **Better Auth** mounts at `/api/auth/*splat`, before `express.json()`, or requests hang.
- **Roles:** `User.role` is derived and only `RoleService.recompute` writes it. `user_type` never changes.
- **No database triggers.** The database only enforces CHECK constraints and partial unique indexes.
- **Audit rows** are written in the same transaction as the change they record.
- **Auth middleware:** never commit a stub that calls `next()`. It would silently leave routes open.
- **Tenant isolation:** department-scoped queries filter by `department_id` unless the caller is `super_admin`.
- **Payments:** trust SSLCommerz only after the Order Validation API confirms, never the IPN body.
- **Money:** `DECIMAL(10,2)` in BDT. Never floats.

## Version traps

Don't upgrade these without checking `docs/DECISIONS.md`:

- `prisma`, `@prisma/client`, `@prisma/adapter-pg` are pinned to 7.10.1. A plain `prisma` install pulls an 8.0 release candidate that Better Auth doesn't support.
- `typescript` stays on `~5.9`. Version 7 is outside the `ts-jest` and `typescript-eslint` ranges.
