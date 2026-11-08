import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// The Prisma CLI uses the direct (unpooled) connection. At runtime the app connects through
// DATABASE_URL (pooled) via @prisma/adapter-pg. Prisma 7 removed `directUrl`.
// `neon checkout <branch>` rewrites both URLs in backend/.env.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL_UNPOOLED'),
  },
});
