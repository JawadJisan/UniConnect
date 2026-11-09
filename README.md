# UniConnect

University club management platform: memberships, events, announcements, blood donation and an AI chatbot.

Requirements are in [the PRD](docs/UniConnect_PRD_V1.md) and [the database schema](docs/DATABASE_SCHEMA_V1.md). Open decisions are in [DECISIONS.md](docs/DECISIONS.md), progress in [TASKS.md](docs/TASKS.md).

**Status:** the database schema, the authentication backend, the landing page and the design system are built. Feature modules (clubs, memberships, events, announcements, blood, chatbot, dashboards) and the app screens are not built yet.

## Project layout

| Path               | Contents                                       |
| ------------------ | ---------------------------------------------- |
| `backend/`         | Express 5 API, Prisma config                   |
| `frontend/`        | Next.js App Router, Tailwind v4, shadcn/ui     |
| `packages/shared/` | `@uniconnect/shared`: constants and Zod enums  |
| `docs/`            | PRD, database schema, decisions, design, tasks |

## Getting started

You need Node 24, pnpm 12, the [Neon CLI](https://neon.com/docs/reference/neon-cli) (Postgres) and an Upstash Redis database. Docker is not required.

```sh
pnpm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cd backend && neon checkout development && cd ..   # writes DATABASE_URL and DATABASE_URL_UNPOOLED
```

Then fill in the rest of `backend/.env`: `REDIS_URL` (Upstash, `rediss://`), `BETTER_AUTH_SECRET` (at least 32 characters) and the `SEED_SUPER_ADMIN_*` values. Leave `SMTP_HOST` empty in development and emails are printed to the API console.

```sh
pnpm --filter @uniconnect/backend db:deploy   # apply migrations to the checked-out branch
pnpm --filter @uniconnect/backend db:seed     # departments and the super admin; safe to rerun
pnpm dev
```

| URL                                 | What                             |
| ----------------------------------- | -------------------------------- |
| http://localhost:3000               | Frontend                         |
| http://localhost:4000/api/v1/health | API health check                 |
| http://localhost:3000/api/v1/health | The same check through the proxy |

If port 3000 is taken, Next.js moves to the next free port. `FRONTEND_ORIGIN` and `BETTER_AUTH_URL` in `backend/.env` must match the real port, or sign-in cookies and email links break.

## Commands

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Run shared, API and frontend with watch          |
| `pnpm build`     | Build everything                                 |
| `pnpm typecheck` | Type-check everything                            |
| `pnpm lint`      | Lint everything                                  |
| `pnpm test`      | Run all tests                                    |
| `pnpm format`    | Format with Prettier                             |
| `pnpm db:up`     | Optional, untested: Postgres and Redis in Docker |
| `pnpm db:down`   | Stop them                                        |

## Working with Claude Code

`CLAUDE.md` holds the project instructions, `.claude/rules/` the backend, database, frontend and testing rules, and `.claude/settings.json` the shared permissions. Each session starts from `docs/SESSION_HANDOFF.md` and the next row in `docs/TASKS.md`, and ends by updating both.
