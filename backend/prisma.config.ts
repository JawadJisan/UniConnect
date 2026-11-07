import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// The Prisma CLI uses the direct connection. At runtime the app connects through
// DATABASE_URL (pooled) via @prisma/adapter-pg. Prisma 7 removed `directUrl`.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
