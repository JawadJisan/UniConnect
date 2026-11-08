# UniConnect: Decisions

Referenced by the PRD (§3, §25) and the database schema (§22).

## 1. Open decisions (from PRD §25)

These are the PRD's defaults. **None is confirmed yet.** Change a row's status once it's decided, and update the PRD and schema if the answer differs.

| #   | Decision                       | Default                                                                                  | Status                             |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Canonical role names           | Five roles; "Club Executive" is a committee position; "Central Admin" unused             | Pending                            |
| 2   | Several roles per user         | One effective role, derived; highest authority wins                                      | Pending                            |
| 3   | Moderator scope                | Own club only                                                                            | Pending                            |
| 4   | Faculty sign-up                | Self-registration with email verification, no admin approval                             | Confirmed 2026-11-08               |
| 5   | Student identity               | No university email domain; `(department_id, student_id)` unique                         | Pending                            |
| 6   | Cross-department clubs         | A student may join only their own department's club                                      | Pending                            |
| 7   | Cross-department events        | Visibility and registration by the `EventDepartment` rule                                | Pending                            |
| 8   | Membership pricing and refunds | Per club, monthly or yearly; no refund                                                   | Pending                            |
| 9   | SSLCommerz merchant            | One merchant account for the university                                                  | Pending                            |
| 10  | Committee terms                | Role recomputed on end; one current position per user per club                           | Pending                            |
| 11  | Dept admin terms               | One current admin per department; super admin appoints                                   | Pending                            |
| 12  | Soft delete                    | None in V1                                                                               | Pending                            |
| 13  | Audit retention                | Append-only, kept indefinitely; no retention job                                         | Pending                            |
| 14  | Blood privacy                  | Phone shown to authenticated users; no email; eligibility interval and consent undecided | Pending                            |
| 15  | Blood request creators         | Any authenticated user; no donor notification in V1                                      | Pending                            |
| 16  | Event capacity                 | Hard cap, no waitlist, manual check-in; paid events out of scope                         | Pending                            |
| 17  | Announcement audience          | Department and club scope; no scheduling or digest                                       | Pending                            |
| 18  | Chatbot content and retention  | Events, announcements, clubs the user may see; ChatLog 90 days                           | Pending                            |
| 19  | Session policy                 | 7-day sliding session; no remember-me toggle                                             | Built as default                   |
| 20  | Email verification             | Link valid 24 hours; resend 1 per 5 minutes; provider chosen at deployment               | Built as default; provider pending |
| 21  | Uploads                        | JPEG, PNG, WebP, max 5MB; avatars, club logos, event posters; no moderation              | Pending                            |
| 22  | Locale                         | `Asia/Dhaka` time zone, English                                                          | Pending                            |
| 23  | Domains and cookies            | Same-origin `/api/*` proxy through Next.js                                               | Built as default                   |
| 24  | Non-functional targets         | 500 concurrent users, 99.5% uptime, Neon daily backups                                   | Pending                            |
| 25  | MVP scope if time runs short   | First to defer: AI chatbot, then dashboard analytics, then blood module                  | Pending                            |

## 2. Resolved at setup (2026-11-07)

`pnpm-lock.yaml` holds the exact versions.

| Item                 | Choice                                                 | Why                                                                                                    |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Node, pnpm           | 24.x, 12.18.0                                          | PRD §3. pnpm was installed with `npm i -g` because Windows blocked `corepack enable`                   |
| Prisma               | Exact `7.10.1`                                         | `prisma@latest` is `8.0.0-rc.33`; Better Auth allows up to `^7`                                        |
| TypeScript           | `~5.9`                                                 | `latest` is 7.0.2; `ts-jest` needs `<7` and `typescript-eslint` needs `<6.1`                           |
| Better Auth CLI      | `auth` package                                         | The current docs use `auth@latest generate`                                                            |
| Tailwind             | v4                                                     | What `create-next-app` and the shadcn CLI use                                                          |
| shadcn/ui            | Default preset `base-nova`                             | CLI default; can be changed before components are added                                                |
| Recharts, TanStack   | Recharts 3, Table 9                                    | The PRD lists 2.x and 8.x as minimums                                                                  |
| API docs             | `swagger-ui-express`, `@asteasolutions/zod-to-openapi` | Generates the spec from Zod schemas                                                                    |
| Local infrastructure | Docker Compose: Postgres 17, Redis 7                   | Optional fallback only. Superseded by Neon and Upstash (below)                                         |
| Next.js options      | `cacheComponents`, `partialPrefetching` on             | `create-next-app` defaults. Revisit when session-dependent pages are built                             |
| Frontend ESLint      | `^9`                                                   | `create-next-app` default. pnpm warns that 9.x is deprecated; the root config uses 10                  |
| Install scripts      | Allowed: `prisma`, `@prisma/engines`, `esbuild`        | Denied: `@scarf/scarf`, `msgpackr-extract`, `protobufjs`, `@parcel/watcher`. See `pnpm-workspace.yaml` |
| Theme                | Dark only, one indigo accent                           | Project brief. Rules are in `DESIGN.md`                                                                |
| Fonts                | Inter with `opsz`, JetBrains Mono                      | `opsz` gives the Inter Display cut without a second UI font                                            |
| `cn` helper          | `@/lib/utils`, not the `cn` package directly           | The package drops custom sizes such as `text-micro`. ESLint enforces this                              |

### Resolved at backend setup (2026-11-08)

| Item               | Choice                                                                                                                                                                 | Why                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres           | Neon project `ancient-flower-26184549`, linked from `backend/` (`neon.ts`; `.neon` is gitignored)                                                                      | PRD §3. Replaces Docker for development                                                                                                                                         |
| Neon branches      | `development` for local work and `prisma migrate dev`. `production` (default) gets `prisma migrate deploy` only                                                        | Resets and bad migrations never touch production. `neon.ts` exempts `development` from the 7-day TTL that other new branches get                                                |
| Connection strings | `DATABASE_URL` (pooled) at runtime through `@prisma/adapter-pg`. `DATABASE_URL_UNPOOLED` (direct) for the Prisma CLI                                                   | These are the names `neon checkout` writes, so switching branches updates both. `DIRECT_URL` is gone                                                                            |
| Neon cold starts   | `PrismaClient` `transactionOptions`: `maxWait` and `timeout` 10s                                                                                                       | Waking a suspended compute took longer than the 2s default `maxWait`                                                                                                            |
| Neon Auth          | Not enabled                                                                                                                                                            | Better Auth runs in Express with its tables in our schema                                                                                                                       |
| Redis              | Upstash over TLS (`REDIS_URL=rediss://…`), one ioredis factory in `src/lib/redis.ts`                                                                                   | BullMQ, `rate-limit-redis` and the cache all use ioredis, so the REST API is unused. Eviction must stay off for BullMQ, and its polling counts toward the Upstash command quota |
| Enum storage       | `String @db.VarChar(n)` + CHECK in the `db_invariants` migration + the shared Zod enums                                                                                | Resolves §4 issue 1                                                                                                                                                             |
| Column nullability | Columns with a default (`created_at`, `status`, booleans) are `NOT NULL`, even where the schema doc's reference DDL leaves them nullable                               | A default should always apply. A nullable status would also slip past its CHECK, since CHECK passes on NULL                                                                     |
| Better Auth tables | `User` core fields, `Session`, `Account`, `Verification` written by hand in `schema.prisma`, using Better Auth's field names. `verifications.identifier` gets an index | When the auth step runs `auth@latest generate`, diff its output against these models. Better Auth must leave UUID generation to the database (`gen_random_uuid()`)              |

### Resolved at the auth step (2026-11-08)

Checked against the installed `better-auth` 1.7.18 source, not only its docs.

| Item               | Choice                                                                                                                                                                                                                                                                                | Why                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public sign-up     | `emailAndPassword.disableSignUp: true` and `disabledPaths: ['/sign-up/email', '/update-user']`                                                                                                                                                                                        | `disableSignUp` blocks server calls to `signUpEmail` too, and `input: false` fields are rejected even from the server, so Better Auth's sign-up can't set `user_type` or `role`. Resolves §4 issue 8 |
| User creation      | `RegistrationService` and the seed script write `User` and the `credential` `Account` in one `prisma.$transaction`, hashing with `(await auth.$context).password.hash`                                                                                                                | The same two rows Better Auth's sign-up writes, plus the audit row in the same transaction. Then `auth.api.sendVerificationEmail` runs after commit                                                  |
| Extra user fields  | All declared in `user.additionalFields` with `input: false`                                                                                                                                                                                                                           | Nothing reaches them through `/api/auth/*`. Profile edits go through `PATCH /api/v1/users/me` (FR-USER-002)                                                                                          |
| Suspension         | `databaseHooks.session.create.before` throws 403, and `requireAuth` checks `isActive` on every request                                                                                                                                                                                | No session is created for a suspended user, and an existing one stops working at once                                                                                                                |
| Session cookie     | Same origin through the Next.js rewrite: `baseURL` = `BETTER_AUTH_URL` (the frontend), `httpOnly`, `SameSite=Lax`, `Secure` in production, cookie cache off                                                                                                                           | Decision #23. Cookie cache off makes role changes apply on the next request                                                                                                                          |
| Database ids       | `advanced.database.generateId: false`                                                                                                                                                                                                                                                 | Postgres `gen_random_uuid()` creates every id                                                                                                                                                        |
| Verification token | Better Auth's signed token in the link, not a `verifications` row                                                                                                                                                                                                                     | Better Auth 1.7 behaviour. Password reset tokens do use `verifications`                                                                                                                              |
| Rate limits        | Better Auth limiter on in every environment except tests, stored in Redis through `customStorage.consume` (Lua `INCR` + `EXPIRE`). Per email: resend 1 per 5 minutes, reset 3 per hour (`hooks.before`). Registration: 10 per hour per IP (`express-rate-limit` + `rate-limit-redis`) | PRD FR-AUTH-003.4 and 007.5. The per-email limit fails open if Redis is down; the others fail closed                                                                                                 |
| Audit exception    | `USER_REGISTERED` and `ROLE_CHANGED` are written in the change's transaction. `LOGIN`, `EMAIL_VERIFIED` and `PASSWORD_CHANGED` are written by hooks right after Better Auth's own write, and a failure is logged                                                                      | Better Auth wraps only sign-up and update-user in transactions, so its sign-in, verify-email and reset writes can't share ours                                                                       |
| Email delivery     | BullMQ `email` queue, worker in the API process (V1). With no `SMTP_HOST` in development, emails are printed to the console                                                                                                                                                           | Decision #20: provider chosen at deployment. `env.ts` requires `SMTP_*` in production                                                                                                                |
| Secrets in logs    | Queue and rate-limit errors are rethrown with the message only                                                                                                                                                                                                                        | ioredis errors carry the failed command, and for `AUTH`/`HELLO` that includes the Redis password                                                                                                     |

**Deployment note:** Express `trust proxy` is `1` (the Next.js rewrite). If another proxy or load balancer goes in front, raise it to the real hop count, or every client behind it shares one rate limit. A client-sent `X-Forwarded-For` becomes a list after the rewrite appends to it, and Better Auth then records no IP rather than a forged one.

## 3. DB objects

Hand-written migration objects get listed here so a `prisma migrate dev` diff isn't mistaken for drift (schema §22).

All of these are in `backend/prisma/migrations/20261108092642_db_invariants`. Prisma 7.10.1 ignores them when diffing: after they were applied, `prisma migrate diff` against the dev branch was empty.

- **Partial unique indexes:** `users_student_id_per_dept`, `one_active_membership_per_user_club`, `one_current_position_per_user_club`, `dept_admin_one_current_per_dept`, `dept_admin_one_current_per_user`
- **Full-text GIN indexes:** `events_fts`, `announcements_fts`, `clubs_fts`
- **CHECK, users:** `users_user_type_valid`, `users_role_valid`, `users_blood_group_valid`, `users_current_year_range`, `users_current_semester_range`, `users_dept_required`, `users_blood_required`, `users_academic_fields`, `users_role_vs_type`
- **CHECK, clubs:** `clubs_fee_monthly_non_negative`, `clubs_fee_yearly_non_negative`
- **CHECK, club_memberships:** `membership_type_valid`, `membership_status_valid`, `membership_dates_valid`
- **CHECK, payment_transactions:** `payment_amount_positive`, `payment_status_valid`
- **CHECK, terms:** `committee_years_valid`, `admin_term_dates_valid`
- **CHECK, events:** `events_visibility_valid`, `events_status_valid`, `events_fee_non_negative`, `events_max_attendees_positive`, `events_dates_valid`, `events_fee_when_paid`
- **CHECK, event_registrations:** `registration_status_valid`, `registration_payment_status_valid`
- **CHECK, announcements:** `announcements_scope_required`
- **CHECK, blood_donations:** `donation_blood_group_valid`, `donation_units_range`, `donation_verification_consistent`
- **CHECK, blood_requests:** `blood_request_blood_group_valid`, `blood_request_units_positive`, `blood_request_status_valid`

The value sets match `packages/shared/src/constants/index.ts`. Changing one needs a new migration that drops and re-adds the CHECK.

## 4. Doc issues to resolve

Found while setting up. Issues 1 and 3 were fixed in the schema doc on 2026-11-08; the PRD was not edited.

| #   | Where              | Issue                                                                                                                                                                                                                                             | Recommendation                                                                            |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Schema Conventions | Says enums are VARCHAR + CHECK, and also Prisma native enums. Native enums create Postgres enum types instead.                                                                                                                                    | **Resolved 2026-11-08:** `String @db.VarChar` + CHECK + the shared Zod enums (§2)         |
| 2   | Schema §22         | The migration SQL omits CHECKs that exist only in the inline DDL, and Prisma won't generate them: all `IN (...)` value sets, `current_year` and `current_semester` ranges, fee `>= 0`, `units`, `max_attendees`, and the announcement scope rule. | **Resolved 2026-11-08:** all added to the `db_invariants` migration (§3)                  |
| 3   | Schema Conventions | `npx @better-auth/cli generate` is out of date, and the CLI writes to `prisma/schema.prisma`, the declared source of truth.                                                                                                                       | Use `auth@latest generate`; review its output as a diff                                   |
| 4   | PRD §3, ORM row    | Still mentions triggers, which v1.2 removed.                                                                                                                                                                                                      | Remove the word                                                                           |
| 5   | PRD §5 vs §17      | The matrix gives faculty a dashboard, but no endpoint exists. Faculty-type moderators also need a defined result.                                                                                                                                 | Add a faculty dashboard or change the matrix                                              |
| 6   | PRD §10 vs §18     | Committee routes use `:clubId` in one place and `:id` in the other.                                                                                                                                                                               | Pick one. Also register `/clubs/my-club` and `/events/my-registrations` before `/:id`     |
| 7   | PRD §3, §6, §25    | Cites Phase 0, Phase 1, Phase 4b and a "Build order", but no document defines them.                                                                                                                                                               | Write the phase plan or drop the references                                               |
| 8   | PRD FR-AUTH-001    | The Better Auth docs page checked names no switch that disables public sign-up while allowing server-side creation. It does document a `databaseHooks.user.create.before` hook.                                                                   | **Resolved 2026-11-08:** public sign-up is disabled; see "Resolved at the auth step" (§2) |
