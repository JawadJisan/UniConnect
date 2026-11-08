---
paths:
  - 'backend/tests/**'
  - 'frontend/tests/**'
  - 'frontend/e2e/**'
  - '**/*.test.ts'
  - '**/*.test.tsx'
---

# Testing rules

- Backend unit tests (mocked Prisma) cover pure rules. Integration tests (Supertest against the test database) cover routes, constraints, transactions and locks. Until the test database exists (`docs/TASKS.md`, task 01b), say plainly which behavior is covered only by mocks.
- For each endpoint: success; 400 for a bad body and for an unknown key; 401; 403 for every role the PRD excludes; 403 or 404 across departments; 409 conflicts; and the audit row it must write.
- Races (event capacity, duplicate checkout, role recompute): fire parallel requests with `Promise.all` against the real database and assert the invariant.
- Mock SSLCommerz, Gemini, Cloudinary and SMTP at their client modules. No test calls a real external service.
- Never weaken or delete an assertion to make a test pass. Find the cause (`/debug`).
- Frontend: React Testing Library, querying by role and label rather than class names. Cover form validation and the loading, empty and error states.
- E2E: Playwright Test in `frontend/e2e/`, with per-role storage state from a seeded test database. Exploring with Playwright MCP does not replace it.
- Run the narrowest test first, then the package suite, then `pnpm test` before handoff.
