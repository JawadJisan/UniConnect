import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'backend/src/generated/**',
      '.claude/skills/impeccable/**',
      // The frontend is linted by its own Next.js config (pnpm --filter @uniconnect/frontend lint).
      'frontend/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
