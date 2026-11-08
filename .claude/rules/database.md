---
paths:
  - 'backend/prisma/**'
  - 'packages/shared/src/constants/**'
  - 'docs/DATABASE_SCHEMA_V1.md'
---

# Database rules

Use the `db-migration` skill for any schema change.

- `backend/prisma/schema.prisma` is the source of truth. Update `docs/DATABASE_SCHEMA_V1.md` in the same change.
- Value sets are `String @db.VarChar(n)` + a CHECK + the constant in `packages/shared/src/constants/index.ts`, never Prisma enums. Changing one needs a new migration that drops and re-adds the CHECK, plus the constant and its Zod enum.
- Hand-written objects (partial uniques, CHECKs, GIN indexes) go in a `prisma migrate dev --create-only` migration, reviewed before it is applied, and are listed in `docs/DECISIONS.md` §3.
- Never edit an applied migration. Never run `migrate reset` or `db push`. Run `migrate dev` only with approval and only on the Neon `development` branch; `production` gets `migrate deploy` only.
- No triggers. Money is `Decimal(10,2)` in BDT. User foreign keys are UUID; other primary keys are integers.
- Full-text queries must repeat the indexed expression exactly, or the GIN index is skipped. For events: `to_tsvector('simple', title || ' ' || coalesce(description, ''))`; see the `db_invariants` migration for announcements and clubs.
- Better Auth tables keep Better Auth's field names; rename columns with `@map` only. Use `auth@latest generate`, not `@better-auth/cli`. It writes to `schema.prisma`, so review the diff.
- `prisma/seed.ts` stays idempotent: upserts and existence checks only.
