/* global process, console, URL */
// Runs a command against the Neon `test` branch: `node scripts/with-test-db.mjs <cmd> [args...]`.
// Points DATABASE_URL and DATABASE_URL_UNPOOLED at TEST_DATABASE_URL(_UNPOOLED) and refuses to
// run when those are missing or match the development URLs, so integration tests and
// `migrate deploy` can never touch `development` or `production`. Never prints a URL.
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';

const fileEnv = {};
config({ processEnv: fileEnv, quiet: true });

const read = (key) => process.env[key] || fileEnv[key] || '';
const testPooled = read('TEST_DATABASE_URL');
const testDirect = read('TEST_DATABASE_URL_UNPOOLED');
const devPooled = fileEnv.DATABASE_URL ?? '';
const devDirect = fileEnv.DATABASE_URL_UNPOOLED ?? '';

function refuse(reason) {
  console.error(`[with-test-db] refusing to run: ${reason}`);
  process.exit(1);
}

if (!testPooled || !testDirect) {
  refuse('TEST_DATABASE_URL and TEST_DATABASE_URL_UNPOOLED must be set in backend/.env');
}
const host = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return refuse('a TEST_DATABASE_URL value is not a valid URL');
  }
};
const testHosts = new Set([host(testPooled), host(testDirect)]);
for (const url of [devPooled, devDirect]) {
  if (url && testHosts.has(host(url))) {
    refuse('the test database URLs point at the same host as DATABASE_URL (development)');
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) refuse('no command given');

const result = spawnSync(cmd, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: testPooled,
    DATABASE_URL_UNPOOLED: testDirect,
  },
});
process.exit(result.status ?? 1);
