# UniConnect: Decisions

Referenced by the PRD (§3, §25) and the database schema (§22).

## 1. Open decisions (from PRD §25)

These are the PRD's defaults. **None is confirmed yet.** Change a row's status once it's decided, and update the PRD and schema if the answer differs.

| #   | Decision                       | Default                                                                                  | Status  |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------- | ------- |
| 1   | Canonical role names           | Five roles; "Club Executive" is a committee position; "Central Admin" unused             | Pending |
| 2   | Several roles per user         | One effective role, derived; highest authority wins                                      | Pending |
| 3   | Moderator scope                | Own club only                                                                            | Pending |
| 4   | Faculty sign-up                | Self-registration with email verification, no admin approval                             | Pending |
| 5   | Student identity               | No university email domain; `(department_id, student_id)` unique                         | Pending |
| 6   | Cross-department clubs         | A student may join only their own department's club                                      | Pending |
| 7   | Cross-department events        | Visibility and registration by the `EventDepartment` rule                                | Pending |
| 8   | Membership pricing and refunds | Per club, monthly or yearly; no refund                                                   | Pending |
| 9   | SSLCommerz merchant            | One merchant account for the university                                                  | Pending |
| 10  | Committee terms                | Role recomputed on end; one current position per user per club                           | Pending |
| 11  | Dept admin terms               | One current admin per department; super admin appoints                                   | Pending |
| 12  | Soft delete                    | None in V1                                                                               | Pending |
| 13  | Audit retention                | Append-only, kept indefinitely; no retention job                                         | Pending |
| 14  | Blood privacy                  | Phone shown to authenticated users; no email; eligibility interval and consent undecided | Pending |
| 15  | Blood request creators         | Any authenticated user; no donor notification in V1                                      | Pending |
| 16  | Event capacity                 | Hard cap, no waitlist, manual check-in; paid events out of scope                         | Pending |
| 17  | Announcement audience          | Department and club scope; no scheduling or digest                                       | Pending |
| 18  | Chatbot content and retention  | Events, announcements, clubs the user may see; ChatLog 90 days                           | Pending |
| 19  | Session policy                 | 7-day sliding session; no remember-me toggle                                             | Pending |
| 20  | Email verification             | Link valid 24 hours; resend 1 per 5 minutes; provider chosen at deployment               | Pending |
| 21  | Uploads                        | JPEG, PNG, WebP, max 5MB; avatars, club logos, event posters; no moderation              | Pending |
| 22  | Locale                         | `Asia/Dhaka` time zone, English                                                          | Pending |
| 23  | Domains and cookies            | Same-origin `/api/*` proxy through Next.js                                               | Pending |
| 24  | Non-functional targets         | 500 concurrent users, 99.5% uptime, Neon daily backups                                   | Pending |
| 25  | MVP scope if time runs short   | First to defer: AI chatbot, then dashboard analytics, then blood module                  | Pending |

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
| Local infrastructure | Docker Compose: Postgres 17, Redis 7                   | Redis uses AOF and `noeviction` for BullMQ                                                             |
| Next.js options      | `cacheComponents`, `partialPrefetching` on             | `create-next-app` defaults. Revisit when session-dependent pages are built                             |
| Frontend ESLint      | `^9`                                                   | `create-next-app` default. pnpm warns that 9.x is deprecated; the root config uses 10                  |
| Install scripts      | Allowed: `prisma`, `@prisma/engines`, `esbuild`        | Denied: `@scarf/scarf`, `msgpackr-extract`, `protobufjs`, `@parcel/watcher`. See `pnpm-workspace.yaml` |

**Deployment note:** when rate limiting is added, set Express `trust proxy` to match the real number of proxies. Behind the Next.js proxy, every client otherwise appears to come from one IP and shares a single limit.

## 3. DB objects

Hand-written migration objects get listed here so a `prisma migrate dev` diff isn't mistaken for drift (schema §22).

None yet.

## 4. Doc issues to resolve

Found while setting up. The PRD and schema were not edited.

| #   | Where              | Issue                                                                                                                                                                                                                                             | Recommendation                                                                        |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Schema Conventions | Says enums are VARCHAR + CHECK, and also Prisma native enums. Native enums create Postgres enum types instead.                                                                                                                                    | `String @db.VarChar` + CHECK + the shared Zod enums                                   |
| 2   | Schema §22         | The migration SQL omits CHECKs that exist only in the inline DDL, and Prisma won't generate them: all `IN (...)` value sets, `current_year` and `current_semester` ranges, fee `>= 0`, `units`, `max_attendees`, and the announcement scope rule. | Add them to the `db_invariants` migration                                             |
| 3   | Schema Conventions | `npx @better-auth/cli generate` is out of date, and the CLI writes to `prisma/schema.prisma`, the declared source of truth.                                                                                                                       | Use `auth@latest generate`; review its output as a diff                               |
| 4   | PRD §3, ORM row    | Still mentions triggers, which v1.2 removed.                                                                                                                                                                                                      | Remove the word                                                                       |
| 5   | PRD §5 vs §17      | The matrix gives faculty a dashboard, but no endpoint exists. Faculty-type moderators also need a defined result.                                                                                                                                 | Add a faculty dashboard or change the matrix                                          |
| 6   | PRD §10 vs §18     | Committee routes use `:clubId` in one place and `:id` in the other.                                                                                                                                                                               | Pick one. Also register `/clubs/my-club` and `/events/my-registrations` before `/:id` |
| 7   | PRD §3, §6, §25    | Cites Phase 0, Phase 1, Phase 4b and a "Build order", but no document defines them.                                                                                                                                                               | Write the phase plan or drop the references                                           |
| 8   | PRD FR-AUTH-001    | The Better Auth docs page checked names no switch that disables public sign-up while allowing server-side creation. It does document a `databaseHooks.user.create.before` hook.                                                                   | Settle this in the auth step                                                          |
