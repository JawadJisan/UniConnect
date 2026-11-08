// Integration tests: Supertest against the real app, Better Auth and Prisma on the Neon `test`
// branch. Run through `pnpm test:integration`, which uses scripts/with-test-db.mjs to point the
// database URLs at the test branch and refuses to run against development.
import unit from './jest.config.mjs';

export default {
  ...unit,
  roots: ['<rootDir>/tests/integration'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30_000,
};
