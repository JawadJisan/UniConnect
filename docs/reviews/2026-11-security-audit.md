# Security audit: IDOR, tenant isolation and PII (Phase 10)

Date: 2026-11-15. Branch `chore/hardening`. Scope: every `/api/v1` route in `backend/src/app.ts`, plus the Better Auth routes. This complements the auth review in `docs/DECISIONS.md` §7. Its findings H1, M4, L3–L6 and I1–I6 were fixed in this branch (D46).

## Method

1. **Inventory.** Every router in `app.ts` was listed (63 protected routes, plus the public departments list, registration, the payment IPN and health). All 63 protected routes are rows in `tests/integration/rbac-matrix.int.test.ts`, which checks 401 and each role's allow or deny.
2. **Ownership.** For each tenant-scoped action, the service's own check was read and matched to an integration test that exercises the cross-department or other-owner case against the Neon `test` branch.
3. **PII and secrets.** `tests/integration/pii-leak.int.test.ts` reads every GET route as six accounts:
   - a student, a faculty member, a moderator and a dept admin with real term rows
   - the super admin
   - a student of another department

   It runs over a seed with an event registration, an announcement, a blood request, a donation and a chat log. It fails on any secret-like key, and on any email or phone number outside a reviewed allow-list.

## Results by module

| Module                   | Who may act (middleware)                                              | Ownership and tenant check (service)                                                                                                                                   | Cross-tenant evidence (integration test)                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| users (`/users/me*`)     | any session                                                           | the caller's own row only; no id in the path                                                                                                                           | `users.int`: `department_id` refused on self-edit                                                                                                                                |
| admin-users              | super_admin                                                           | super admins can't change themselves or each other                                                                                                                     | `admin-users.int`: 403 for every other role, 403 on the caller and other super admins                                                                                            |
| clubs                    | edit: dept_admin, super_admin; scope `hide: false` (clubs are public) | dept_admin only for their department's club                                                                                                                            | `clubs.int`: another department's dept_admin gets 403 and the row is unchanged                                                                                                   |
| memberships              | student type; admin list for dept_admin and super_admin               | own membership only (404 otherwise); the admin list is filtered to the dept_admin's department; the IPN trusts only the validation call                                | `memberships.int`: another student's membership is 404, the dept_admin stays in their department, a `val_id` from another transaction is ignored                                 |
| committee                | dept_admin, super_admin; scope `hide: false`                          | the user must be in the club's department, even for super_admin                                                                                                        | `committee.int`: 400 for a user of another department, 404 for another club's member, 403 across departments                                                                     |
| dept-admin-terms         | super_admin                                                           | user row locked, then `roleService.recompute` (D12, D34)                                                                                                               | `dept-admin-terms.int`: 403 for dept_admin, and the race test                                                                                                                    |
| events                   | organizers; attendees                                                 | every organizer action goes through `loadManaged`/`lockManaged` (visible first, else 404; then manages, else 403)                                                      | `events.int`: another club's moderator gets 403 and an event they can't see is 404; `event-registrations.int`: another department's admin gets 403 on the list, CSV and check-in |
| announcements            | posters; pinners                                                      | `canManageWith` (seated author, the department's admin, super admin); visibility by D15                                                                                | `announcements.int`: another moderator gets 403, an ended seat gets 403, another department's admin gets 404 on edit, delete and pin                                             |
| blood                    | donors; admins verify                                                 | verify is scoped to the admin's department and refuses their own donation; cancel is the requester (or an admin); fulfill is open to any user by design (FR-BLOOD-007) | `blood.int`: another department's donation is 404, verifying your own is 403, cancel by others is 403, the fulfill race gives exactly one 200                                    |
| dashboards               | one role per view                                                     | each view reads only the caller's department, club or own rows                                                                                                         | `dashboard.int`: counts only CSE                                                                                                                                                 |
| audit-logs, chatbot logs | super_admin                                                           | none needed (system-wide by design)                                                                                                                                    | rbac-matrix                                                                                                                                                                      |
| chatbot, ai              | any session; ai for organizers                                        | retrieval runs the module's own visibility rules first; the cache key hashes the caller's scope (D44)                                                                  | `chatbot.int`: department posts stay in the department, and one scope never gets another scope's answer                                                                          |

## PII and secrets

- **Secret-like keys** (`password`, `token`, `hash`, `secret`, session tokens): none in any GET body for any role. Better Auth's `/get-session` and sign-in bodies no longer carry the session token either (I1, tested in `security-fixes.int`).
- **Emails** appear only in:
  - the caller's own `/users/me`
  - the super-admin-only user management (`/admin/users`, `/admin/users/:id`)
  - the super-admin-only dept-admin term list

  Never in the donor list, event registrations (JSON or CSV), committee candidates, chat logs or announcements.

- **Phone numbers** appear only in:
  - the caller's own profile
  - super admin user detail
  - the donor list (a donor's own phone; "Not shared" when empty)
  - the `contact_phone` a requester typed on a blood request, which is shown to everyone because finding a donor quickly is the point of FR-BLOOD-006
- **Chat logs** store the PII-stripped question (D44) and show the asker's name and role only.
- **Audit log** `old_value`/`new_value` can hold a changed phone number. That is by design, for the super admin only.

## Findings

No new IDOR or leak was found. Two notes, neither needing a change:

1. **Blood request contact phones are visible across departments.** This is intended (FR-BLOOD-006 lists every pending request to every signed-in user). If that changes, the allow-list in `pii-leak.int.test.ts` is where it shows.
2. **Audit log values can contain contact details.** They are super-admin-only, and audit fidelity is the purpose (FR-AUDIT-001).

## Regression protection

- **RBAC:** any new protected route must be added to the matrix (CLAUDE.md).
- **PII:** any new place an email or phone appears fails `pii-leak.int.test.ts` until it is added to the allow-list with a reason.
- **Department scope:** `requireDepartmentScope` now hides cross-department existence by default (L5), so a new scoped route can't become an existence oracle by omission.
