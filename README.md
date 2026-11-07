# UniConnect

University club management platform: memberships, events, announcements, blood donation and an AI chatbot.

Requirements are in [the PRD](docs/UniConnect_PRD_V1.md) and [the database schema](docs/DATABASE_SCHEMA_V1.md). Open decisions are in [DECISIONS.md](docs/DECISIONS.md).

## Project layout

| Path               | Contents                                      |
| ------------------ | --------------------------------------------- |
| `backend/`         | Express 5 API, Prisma config                  |
| `frontend/`        | Next.js App Router, Tailwind v4, shadcn/ui    |
| `packages/shared/` | `@uniconnect/shared`: constants and Zod enums |
| `docs/`            | PRD, database schema, decisions               |

## Getting started

You need Node 24 and pnpm 12. Docker Desktop is needed once the app uses the database or Redis.

```sh
pnpm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
pnpm dev
```

| URL                                 | What                             |
| ----------------------------------- | -------------------------------- |
| http://localhost:3000               | Frontend                         |
| http://localhost:4000/api/v1/health | API health check                 |
| http://localhost:3000/api/v1/health | The same check through the proxy |

If port 3000 is taken, Next.js moves to the next free port. Later, when auth is added, `FRONTEND_ORIGIN` and `BETTER_AUTH_URL` in `backend/.env` must match the real port.

## Commands

| Command          | What it does                            |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | Run shared, API and frontend with watch |
| `pnpm build`     | Build everything                        |
| `pnpm typecheck` | Type-check everything                   |
| `pnpm lint`      | Lint everything                         |
| `pnpm test`      | Run all tests                           |
| `pnpm format`    | Format with Prettier                    |
| `pnpm db:up`     | Start Postgres and Redis in Docker      |
| `pnpm db:down`   | Stop them                               |
