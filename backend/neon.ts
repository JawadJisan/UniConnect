import { defineConfig } from '@neon/config/v1';

// Neon project config (Postgres only). Better Auth runs in Express, so Neon Auth stays off.
// Branches: `production` gets `prisma migrate deploy` only; `development` is the local
// working branch for `prisma migrate dev`. See docs/DECISIONS.md.
export default defineConfig({
  auth: false,
  branch: (branch) => {
    if (branch.isDefault) {
      return {};
    }
    if (!branch.exists) {
      // The long-lived development branch never expires; throwaway branches do after 7 days.
      return branch.name === 'development' ? {} : { ttl: '7d' };
    }
    return {};
  },
});
