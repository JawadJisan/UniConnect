---
paths:
  - 'backend/src/**'
  - 'backend/tests/**'
  - 'packages/shared/src/schemas/**'
---

# Backend rules

## Module shape

- A feature lives in `src/modules/<feature>/`: `<feature>.routes.ts` → `.controller.ts` (HTTP only) → `.service.ts` (business rules, `prisma.$transaction`, audit) → `.repository.ts` (Prisma only). Repository methods take `db: Db` (`src/repositories/audit.repository.ts`), so they run inside a caller's transaction.
- Request schemas live in `packages/shared/src/schemas/<feature>.ts`. Mutation bodies are `.strict()`. Parse params and query strings too, not only bodies.
- Success responses: `{ success: true, data, message? }`. Errors: throw the helpers in `src/lib/http-error.ts`; never build an error response in a controller.
- Money: Prisma `Decimal`, serialized as a string. Never `Number()` it.
- New env vars go in `src/config/env.ts` (Zod) and `backend/.env.example` in the same change.

## Routes and authorization

- Middleware order: `requireAuth` → `requireRole([...])` → `requireDepartmentScope(resolver)` → `validateBody(schema)`.
- Register `/clubs/my-club` and `/events/my-registrations` before their `/:id` routes.
- Middleware checks role and department. Services still check the resource itself: a moderator acts only on a club where they hold a current committee row, and a student only on their own rows.
- Rate limiting: Express `trust proxy` is `1`, for the Next.js rewrite. Raise it if another proxy goes in front, or every client behind it shares one limit. Rate limiters are skipped when `NODE_ENV=test`, because tests mock Redis.

## Transactions and integrations

- One transaction per business operation, with its audit row inside it.
- A unique-index race surfaces as Prisma `P2002`; map known index names to the PRD's specific 409 messages rather than the generic one.
- Redis: one `createRedis()` connection per BullMQ worker. Log `err.message`, never an ioredis error object.
- SSLCommerz: trust only the Order Validation API response; the IPN handler is idempotent (`WHERE payment_status = 'pending'`).
- Capacity checks (event registration; DECISIONS D36): lock the parent row with `SELECT … FOR UPDATE` in its own statement, then count in a **separate, later** statement. A `FOR UPDATE` that waited re-reads only the locked row; subqueries and joins in the same statement keep their pre-wait snapshot, which overbooked 10 registrations into 3 seats. Lock order is parent → child.
- Under such a lock, run `SET LOCAL lock_timeout = '15s'` with transaction options `{ maxWait: 15_000, timeout: 25_000 }`, and map a lock wait (`55P03`, Prisma `P2028`) to 503 `EVENT_BUSY` rather than a 500.
- Gemini: the model comes from `GEMINI_MODEL`. External services (SSLCommerz, Gemini, Cloudinary, SMTP) sit behind small client modules that tests can mock.

## Open, decide before first use (`docs/DECISIONS.md` §5)

- **D9** list response shape and pagination. Proposed: `{ success, data, meta: { page, limit, total } }`, `limit` default 20, max 100.
- **D12** role-change concurrency. Proposed: every term-changing transaction locks the user row (`SELECT … FOR UPDATE`) before `roleService.recompute`.
