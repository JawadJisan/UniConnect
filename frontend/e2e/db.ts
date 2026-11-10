import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Every seeded account's password (backend/scripts/e2e-db.ts). */
export const PASSWORD = 'Str0ng!pass';

export const USERS = {
  student: { email: 'student@e2e.test', name: 'Ayesha Rahman' },
  student2: { email: 'student2@e2e.test', name: 'Tanvir Ahmed' },
  student3: { email: 'student3@e2e.test', name: 'Nadia Islam' },
  faculty: { email: 'faculty@e2e.test', name: 'Dr. Karim Hossain' },
  admin: { email: 'admin@e2e.test', name: 'System Admin' },
} as const;

/** Runs backend/scripts/e2e-db.ts on the Neon test branch (through with-test-db.mjs). */
export function e2eDb(...args: string[]) {
  execFileSync('pnpm', ['--filter', '@uniconnect/backend', 'e2e:db', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
