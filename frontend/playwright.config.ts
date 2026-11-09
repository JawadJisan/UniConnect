import { defineConfig, devices } from '@playwright/test';

// End-to-end tests for FR-AUTH and FR-USER (docs/DECISIONS.md D27). They run the real Next.js
// app and the real API, on their own ports so a normal `pnpm dev` can keep running, with the
// API pointed at the Neon `test` branch through with-test-db.mjs (never development). The API
// runs with NODE_ENV=test, so its rate limiters are off and the suite can sign in repeatedly.
const WEB = 3100;
const API = 4100;
const origin = `http://localhost:${WEB}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // One database shared by every test, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Each sign-in makes several round trips to Neon, and `next dev` compiles a route on its first
  // visit, so single steps can take seconds.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: origin,
    // Installed Microsoft Edge, so no browser download is needed on Windows.
    channel: 'msedge',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } }],
  webServer: [
    {
      command: 'pnpm --filter @uniconnect/backend dev:e2e',
      cwd: '..',
      url: `http://localhost:${API}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API),
        FRONTEND_ORIGIN: origin,
        BETTER_AUTH_URL: origin,
        // Never reach real outside services from a test run: with SMTP_HOST empty the email
        // worker prints messages instead of sending them, and with Cloudinary unset an upload
        // that somehow reached the API answers 503 (the suite stubs the upload route anyway).
        // Empty values count as unset (src/config/env.ts) and win over backend/.env.
        SMTP_HOST: '',
        CLOUDINARY_CLOUD_NAME: '',
        CLOUDINARY_API_KEY: '',
        CLOUDINARY_API_SECRET: '',
      },
    },
    {
      command: `pnpm exec next dev -p ${WEB}`,
      url: origin,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_ORIGIN: `http://localhost:${API}` },
    },
  ],
});
