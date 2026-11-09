import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

export default createJestConfig({
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    // better-auth/react is ESM-only, and every test should control the session anyway, so
    // createAuthClient() returns the double in tests/mocks/auth-client.ts. (Mapping
    // '@/lib/auth-client' itself doesn't work: next/jest rewrites '@/' before mapping.)
    '^better-auth/react$': '<rootDir>/tests/mocks/better-auth-react.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
});
