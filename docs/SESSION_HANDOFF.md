# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Seed verified test users for manual testing, 2026-11-17, on `chore/seed-test-users` from `main`. Not committed yet.

## Completed work

- `backend/prisma/seed-test-users.ts` (`pnpm --filter @uniconnect/backend db:seed:test-users`): 10 students and 4 faculty per department (CSE, ECE, BBA), 42 in total. Every account has `emailVerified: true` and a full profile (blood group, phone; students also get session, year, semester and student ID), and each insert writes a `USER_REGISTERED` audit row with `via: 'test-seed'`. Refuses `NODE_ENV=production`. Skips existing emails and student IDs, so it is safe to rerun. Kept out of `seed.ts`, so `db:seed` never creates demo users.
- Faculty names are from ist.edu.bd/faculty-members; student names are invented. Emails are `<dept>.<student|faculty>NN@uniconnect.test`, and the password is `Jawad@123` for all.
- The script writes `docs/testing/TEST_USERS.md` and `test-users.csv`. `docs/testing/TEST_USERS.pdf` was printed from the CSV with headless Edge (the HTML template was a scratchpad script, not in the repo).
- The script is in `backend/tsconfig.json` `include`.

## Commands executed and results

| Command                                                                                              | Result                                                                        |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm --filter @uniconnect/backend typecheck`, `eslint` on the script                                | Pass                                                                          |
| `pnpm db:seed:test-users` on Neon `development`                                                      | 42 created, 0 skipped                                                         |
| Same, rerun                                                                                          | 0 created, 42 skipped                                                         |
| Group-by on `@uniconnect.test` users; `auth.api.signInEmail` for `cse.student01` and `ece.faculty01` | 10 students and 4 faculty per department, all verified; both sign-ins succeed |

## Not covered

- The PDF's rendering was not viewed (no PDF renderer here); Edge reported 178 KB written.
- Not run on the `test` branch; e2e users still come from `e2e:db`.
