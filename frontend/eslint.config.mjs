import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // `shadcn add` writes `from 'cn'`, which bypasses the custom type and shadow names in lib/utils.ts.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/utils.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'cn', message: "Import cn from '@/lib/utils' instead." }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
