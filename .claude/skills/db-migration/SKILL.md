---
name: db-migration
description: Use when changing backend/prisma/schema.prisma or adding a CHECK, partial unique index or GIN index in UniConnect. Covers approval, Neon branch safety, create-only migrations, shared-constant sync and DECISIONS.md bookkeeping. Not for seed-only changes.
---

# UniConnect database migration

## Purpose

Change the schema without drifting from the docs, the shared constants, or the hand-written objects Prisma cannot declare, and without touching the wrong Neon branch.

## When to use

Any change to `backend/prisma/schema.prisma`, to a value set (roles, statuses, blood groups), or to an index or CHECK. Not for changes to `prisma/seed.ts` alone.

## Required context

- `.claude/rules/database.md`
- `docs/DECISIONS.md` §3 (hand-written objects) and the decision or ADR that motivates the change
- The affected sections of `docs/DATABASE_SCHEMA_V1.md`

## Procedure

1. **Approval.** Confirm the change is approved: an accepted ADR, a decided row in `docs/DECISIONS.md` §5, or explicit approval in this session. If not, stop and ask.
2. **Branch.** Confirm with the user that `backend/.env` points at the Neon `development` branch (`neon checkout development` in `backend/`). Never run a migration against `production`. Don't read `.env` to check.
3. **Edit and validate.** Edit `schema.prisma`, then run `pnpm --filter @uniconnect/backend exec prisma validate`.
4. **Create without applying.** Ask, then run `pnpm --filter @uniconnect/backend exec prisma migrate dev --create-only --name <snake_case_name>`.
5. **Review the SQL.** Read the generated `migration.sql`. Add hand-written objects at the end. A changed value set needs `ALTER TABLE … DROP CONSTRAINT …` then `ADD CONSTRAINT …` with the new list. Make sure nothing in the file drops or rewrites data unexpectedly.
6. **Show and apply.** Show the user the SQL. Apply only after approval: `pnpm --filter @uniconnect/backend db:migrate`.
7. **Bookkeeping, same change:**
   - `docs/DECISIONS.md` §3: list every new hand-written object.
   - `docs/DATABASE_SCHEMA_V1.md`: update the table, the DDL and §22 or §23 if affected.
   - `packages/shared/src/constants/index.ts` and `src/schemas/enums.ts`: update value sets.
8. **Rebuild and test.** `pnpm --filter @uniconnect/shared build`, `pnpm --filter @uniconnect/backend db:generate`, `pnpm typecheck`, `pnpm test`. Add an integration test that proves the new constraint rejects bad data (once the test database exists; until then, say the constraint is untested).

## Verification

- `pnpm --filter @uniconnect/backend db:status` reports the migration applied and nothing pending on `development`.
- The new constraint's test fails on invalid data and passes on valid data.
- `git diff` shows the migration, `schema.prisma`, both docs and the shared constants changing together.

## Output

Migration name; objects added or changed; docs and constants updated; every command run with its result; anything left unverified.
