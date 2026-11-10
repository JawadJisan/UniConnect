# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Phase 3, clubs: FR-CLUB-001–004, end to end. Backend first, then the frontend; each was planned in plan mode and approved before it was built. Branch `feat/clubs`, cut from `development` (2026-11-10). **Nothing is committed.**

Your choices (structured questions):

- **Logo:** a separate multipart `PATCH /clubs/:id/logo`. `PATCH /clubs/:id` stays JSON and refuses `logo_url` (D31).
- **Seed:** this task seeds one club per department.
- **Editing:** inline panels on the club page (the admin record layout), not a dialog or sheet.

## Completed work

**Shared** (`schemas/club.ts`):

- `clubIdParamSchema` and `clubListQuerySchema`
- `updateClubSchema`: `.strict()`, `null` clears a field
- `feeSchema`: a number or string, normalized to a 2-decimal string
- `FEE_MESSAGE`
- response schemas and `LOGO_FIELD`
- audit actions `CLUB_UPDATED`, `CLUB_LOGO_UPDATED`

**Backend** (`src/modules/clubs/*`, at `/api/v1/clubs`):

- **Routes:** list, `my-club` (registered before `/:id`), detail (current committee only, with no email or phone), `PATCH /:id`, `PATCH /:id/logo`.
- **Edit check:** `requireRole(['dept_admin','super_admin'])`, then `requireDepartmentScope` on the club's department (403 across departments). The service then locks the club row and checks again.
- **Audit:** changed fields only; a no-op writes nothing. Fees are strings.
- **Shared code:** `lib/image.ts` (`isAllowedImage`), `imageUpload(field)` / `logoUpload`, `uploadClubLogo`.
- **Seeds:** `seed.ts` and the E2E seed create `"<Dept> Club"` per department.

**Frontend:**

- **Pages:**
  - `/dashboard/clubs`: a bento grid with `৳` fees in mono and a "Your department" badge
  - `/dashboard/clubs/[id]`: the record layout. Read-only About on the left; on the right, Committee, then "Details & fees" and "Logo" for editors only.
  - `/dashboard/clubs/my-club`: a super admin gets an info alert, not an error
- **Hooks:** `use-clubs.ts` (`useClubs`, `useClub`, `useMyClub`, `useUpdateClub`, `useUploadClubLogo`).
- **Helpers:** `lib/club-access.ts` (`canEditClub`, display only) and `formatBdt` (string math, no `Number()` on money).
- **Edit form:** React Hook Form + `zodResolver`. Fee fields are validated with the shared `feeSchema` and `FEE_MESSAGE`. Only dirty fields are sent, `''` as `null`. Save follows DESIGN's secondary/default rule, with Discard.
- **Drop zone:** `components/image-drop-zone.tsx`, extracted from the avatar upload, which now wraps it. The avatar tests passed unchanged.
- **Nav:** a "Clubs" group, with "My club" for every role except `super_admin` and "All clubs" for everyone. Overview capabilities link to my-club.

## Files changed

`git status` lists them all. In short:

- **shared:** `schemas/club.ts`, `constants`, `index`
- **backend:** `modules/clubs/*`, `lib/{image,cloudinary}.ts`, `middleware/upload.ts`, `modules/users/user.service.ts`, `app.ts`, `prisma/seed.ts`, `scripts/e2e-db.ts`; tests `clubs.test.ts`, `integration/{clubs.int,rbac-matrix.int,users.int}.test.ts`, `harness.ts`, `users.test.ts`
- **frontend:** `app/(app)/dashboard/clubs/**`, `components/image-drop-zone.tsx`, `hooks/use-clubs.ts`, `lib/{club-access,format}.ts`, `_components/nav.ts`, `profile/_components/avatar-upload.tsx`; tests `tests/app/{clubs.test.tsx,nav.test.ts}`, `e2e/{clubs,shell}.spec.ts`
- **docs:**
  - `DECISIONS.md`: D31; D18 partly built; issues 16 and 6; PRD #1, #2, #21 built as default
  - `UniConnect_PRD_V1.md`: FR-CLUB-003, §16, API table
  - `DESIGN.md`: Image drop zone, Club directory, Club record, §11 tags
  - `TASKS.md`, `CLAUDE.md`, this file

## Database/migration changes

None. No command touched `development` or `production`. Integration tests and E2E used the Neon `test` branch.

## Commands executed and results

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: pass.
- `pnpm test`: backend 11 suites, 162/162; frontend 14 suites, 199/199.
  - Earlier in the session one frontend run failed once in `admin-users.test.tsx`, while the integration suite was running alongside it. It passed when rerun.
- `pnpm --filter @uniconnect/backend test:integration`: 8 suites, 215/215, including the RBAC matrix (1028 s).
- `pnpm e2e`: first run 24 passed, 3 failed.
  - **The failures:** `shell.spec.ts` asserted exactly 2 sidebar links. The Clubs group made it 4. The super-admin case was already stale from Phase 2's Users link, but last session's run never reached it.
  - **The fix:** the spec now asserts the exact link names per user.
  - **Rerun:** `shell.spec.ts` alone, 5/5. In the full run, `clubs.spec.ts` (3/3) and the admin specs (5/5) passed, which verifies the previous session's admin fix.
- `impeccable detect` on the new UI files: `[]`.

## Not covered

- A dept_admin in E2E: the E2E seed has none (task 1b). Unit tests and the backend RBAC matrix cover the role.
- A real Cloudinary logo upload: a manual check.
- A manual `pnpm dev` check on the `development` branch: `db:seed` there needs your approval, and that branch has no departments yet.
- OpenAPI entries: task 1c.

## Current blockers

None.

## Approved decisions and ADR links

D31 (new), D18 (partly built). No ADR.

## Risks and unresolved questions

- The dept-admin edit check compares the club's department with the caller's `department_id`. The Phase 3 term endpoints must enforce `term.department_id = user.department_id` (D31).
- Committee rows are ordered by position name alphabetically, not by rank. Revisit with the committee endpoints.
- The directory asks for `limit=100` and has no pager. That's fine for one club per department.
- The integration suite takes about 17 minutes against Neon, and E2E about 10.
- Still open from before:
  - H1, L3–L6, I1–I6
  - D16
  - the `development` branch has no departments

## Exact next task

Commit `feat/clubs` when you ask. Then Phase 3 continues: committee endpoints (assign, edit, end term) and dept admin terms. They need PRD decisions #3, #10, #11 and the D12 user-row lock. Task 1b (factories, a demo dept_admin and moderator in the E2E seed) would let E2E cover editors.

## Recommended resume instruction

> Read `CLAUDE.md`, `docs/SESSION_HANDOFF.md` and `docs/DECISIONS.md` D12, D31. Plan the committee and dept-admin-term endpoints (Phase 3) in plan mode, after confirming PRD decisions #3, #10, #11.
