# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

`uniconnect-00-project-audit` (2026-11-08). Audit the repository against PRD v1.2 and schema v1.2, then apply the approved config and docs changes (task 1a in `docs/TASKS.md`). No source, schema or dependency changes.

## Source documents reviewed

`docs/UniConnect_PRD_V1.md` (all), `docs/DATABASE_SCHEMA_V1.md` (all), `docs/DECISIONS.md`, `docs/DESIGN.md`, `CLAUDE.md`, `README.md`, `PRODUCT.md`, every backend, shared and frontend source file, both migrations, all tests, the Claude Code config (project and user, no secret values).

## Completed work (verified)

- Audit: what exists is foundations (schema, auth backend, landing page, design system). No feature module and no app screens exist. Every check passed: both ESLint configs, Prettier, backend and frontend `tsc`, backend Jest 54/54, frontend Jest 13/13. The first frontend run failed once loading a Windows SWC binary; three reruns passed.
- Approved alignment applied on branch `chore/engineering-alignment`:
  - `CLAUDE.md` gained Workflow, Security, Testing and Git sections.
  - Domain rules moved into `.claude/rules/`.
  - `.claude/settings.json` has permissions.
  - New docs: task tracker, this handoff, ADR folder, `db-migration` skill.
  - `DECISIONS.md` gained §4 issues #9–#16, §5 pending decisions and §6 resolved alignment decisions.
  - README and PRODUCT.md were updated.

## Files changed

`CLAUDE.md`, `README.md`, `PRODUCT.md`, `docs/DECISIONS.md`, `.claude/settings.json` (edited); `.claude/rules/{backend,database,frontend,testing}.md`, `.claude/skills/db-migration/SKILL.md`, `docs/TASKS.md`, `docs/SESSION_HANDOFF.md`, `docs/adr/README.md`, `docs/adr/0000-template.md` (new).

## Database/migration changes

None. No database command was run; the Neon migration state is as `CLAUDE.md` claims, not re-verified.

## Commands executed and results

Audit (read-only):

- `eslint .` and frontend `eslint` passed.
- `prettier --check .` passed.
- Backend `tsc --noEmit` and frontend `tsc --noEmit` passed.
- Backend Jest and frontend Jest passed.
- No database or Neon command was run.

After the changes:

- `git switch -c chore/engineering-alignment`.
- `prettier --write` on the changed files: tables re-aligned only.
- `.claude/settings.json` and `.claude/settings.local.json` parse as JSON.
- `pnpm format:check` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed (it rebuilt shared and ran `prisma generate`).
- `git diff --stat`: only the files listed above.

## Tests executed and results

`pnpm test` after the changes:

- Backend: 6 suites, 54/54 passed.
- Frontend: 2 suites, 13/13 passed.

These are the same counts as before the changes.

## Current blockers

Task 1b needs decisions D5 (test database), D12 (role-change lock) and D18 (seed clubs). See `docs/DECISIONS.md` §5.

## Approved decisions and ADR links

D1 (project-native workflow docs), D2 (ADRs in `docs/adr/`), D3 (path rules in `.claude/rules/`) were approved with the plan; see `docs/DECISIONS.md` §6. No ADR written yet.

## Risks and unresolved questions

- All tests mock Prisma: CHECKs, partial uniques, transactions and races are unverified against a real database.
- Design gaps waiting on decisions: role-recompute race (D12), membership double checkout and early renewal (D11), dashboards for student moderators (D13), donor phone privacy (D14).
- The neural-network design identity conflicts with `docs/DESIGN.md` (D16).
- D4 (disable the Stripe plugin in `.claude/settings.local.json`) awaits the user's yes.
- The `.claude/settings.json` permission rules load in the next session; check with `/permissions`.

## Exact next task

`uniconnect-01b-test-harness` (task 1b in `docs/TASKS.md`), after D5, D12 and D18 are answered.

## Acceptance criteria

- `pnpm --filter @uniconnect/backend test` runs a unit project (mocked, default) and an integration project against a dedicated test database, never `development` or `production`.
- Integration tests prove every schema §20 role transition, including two parallel term changes for one user.
- Better Auth hooks are tested: suspension blocks session creation, the per-email limit fails open, the password policy applies to reset and change, audit rows are written.
- The seed creates one club per department idempotently.
- `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.

## Recommended resume instruction

> Read `CLAUDE.md`, `docs/SESSION_HANDOFF.md` and task 1b in `docs/TASKS.md`. Decisions D5, D12 and D18 are: … (fill in). Plan task 1b in plan mode and wait for approval.
