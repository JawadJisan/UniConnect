import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config = createJestConfig({
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

/**
 * TanStack Table v9 (and its table-core and store packages) ship ESM only, which Jest can't
 * require. next/jest only lets `transpilePackages` through its transformIgnorePatterns, and
 * adding them there would change the Next build too, so the test config alone adds `@tanstack`
 * next to `@uniconnect/shared`. Throws if next/jest's patterns change shape.
 */
export default async function jestConfig() {
  const resolved = await config();
  let patched = 0;
  resolved.transformIgnorePatterns = resolved.transformIgnorePatterns.map((pattern) => {
    const next = pattern
      .replace('(@uniconnect/shared|', '(@uniconnect/shared|@tanstack/[^/]+|')
      .replace('(@uniconnect\\+shared|', '(@uniconnect\\+shared|@tanstack\\+[^@]+|')
      .replace(
        '(@uniconnect[\\\\/]shared|',
        '(@uniconnect[\\\\/]shared|@tanstack[\\\\/][^\\\\/]+|',
      );
    if (next !== pattern) patched += 1;
    return next;
  });
  if (patched !== 2) {
    throw new Error(
      'jest.config.mjs: next/jest transformIgnorePatterns changed; update the @tanstack patch',
    );
  }
  return resolved;
}
