# UniConnect – Project Requirements Document (PRD)

**Version:** 1.2 (synced with `DATABASE_SCHEMA_V1.md` 1.2)
**Date:** 2026-11-07
**Status:** Final – Ready for Development (pending answers to the open decisions in Section 25)
**Related Files:** `DATABASE_SCHEMA_V1.md` (18 tables), `docs/DECISIONS.md` (created in Phase 0 from Section 25)

---

## Changelog (V1.0 → V1.2)

| # | Change | Sections affected |
|---|--------|-------------------|
| 1 | **Authentication is Better Auth sessions only.** The custom JWT access token, 7-day refresh token, Redis refresh-token store and `/auth/refresh` endpoint are removed. | 3, 4, 6, 7, 18, 19, 21 |
| 2 | Better Auth owns login, logout, email verification and password reset (`/api/auth/*`). Registration keeps two thin custom endpoints so a client can never choose its own role. | 6, 18 |
| 3 | Role is **derived**: `User.user_type` (immutable) is the base; `User.role` is recomputed from active terms. The direct role-override endpoint is replaced by `recompute-role`. | 5, 7, 10, 11, 19 |
| 4 | **Database triggers removed.** Role sync and `last_donation_date` are service-layer logic inside one transaction. | 10, 11, 14, 19 |
| 5 | `DepartmentAdminTerm` uniqueness fixed with partial unique indexes. | 11, 19 |
| 6 | Membership has a `pending` status; it becomes `active` only after SSLCommerz **Order Validation API** confirms payment (IPN is not signed). | 9, 19 |
| 7 | Gemini model is read from `GEMINI_MODEL` (the PRD no longer names a retired model). `ChatLog` is a decided table with 90-day retention. | 3, 15 |
| 8 | Stack upgrades: Node 24 LTS, Express 5, current Prisma and Next.js, `motion`, pnpm monorepo. | 3 |
| 9 | Consistency fixes: members-only visibility rule, who can cancel registrations, who can record blood donations, who can buy memberships (by `user_type`), email-verification expiry now in V1. | 5, 9, 12, 14, 19 |
| 10 | Added scheduled-jobs table, same-origin cookie strategy, glossary of role names, open decisions (Section 25). | 4, 11, 25 |

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals & Success Metrics](#2-goals--success-metrics)
3. [Tech Stack Summary](#3-tech-stack-summary)
4. [System Architecture](#4-system-architecture)
5. [User Roles & Capabilities Matrix](#5-user-roles--capabilities-matrix)
6. [Module FR-AUTH — Authentication & Authorization](#6-module-fr-auth--authentication--authorization)
7. [Module FR-USER — User Profile Management](#7-module-fr-user--user-profile-management)
8. [Module FR-CLUB — Club Management](#8-module-fr-club--club-management)
9. [Module FR-MEM — Membership & Payments](#9-module-fr-mem--membership--payments)
10. [Module FR-COMM — Club Committee Management](#10-module-fr-comm--club-committee-management)
11. [Module FR-ADMIN — Department Admin Term Management](#11-module-fr-admin--department-admin-term-management)
12. [Module FR-EVENT — Event Management](#12-module-fr-event--event-management)
13. [Module FR-ANNOUNCE — Announcements](#13-module-fr-announce--announcements)
14. [Module FR-BLOOD — Blood Donation & Requests](#14-module-fr-blood--blood-donation--requests)
15. [Module FR-AI — AI Chatbot (RAG)](#15-module-fr-ai--ai-chatbot-rag)
16. [Module FR-AUDIT — Audit Logs](#16-module-fr-audit--audit-logs)
17. [Module FR-DASHBOARD — Dashboards](#17-module-fr-dashboard--dashboards)
18. [API Endpoint Reference](#18-api-endpoint-reference)
19. [Business Rules & Constraints](#19-business-rules--constraints)
20. [Feature-to-Table Cross Reference](#20-feature-to-table-cross-reference)
21. [Non-Functional Requirements](#21-non-functional-requirements)
22. [Email & Notification System](#22-email--notification-system)
23. [Error Handling Standards](#23-error-handling-standards)
24. [Out of Scope (V1)](#24-out-of-scope-v1)
25. [Open Decisions](#25-open-decisions)

---

## 1. Project Overview

**UniConnect** is a multi-department university club management platform supporting the full lifecycle of student club operations — membership, events, announcements, blood donation coordination, and an AI-powered chatbot. It serves students, faculty, club moderators, department admins, and a super admin under a unified, role-based system.

**Supported Departments (V1):** CSE, ECE, BBA (expandable)

**Core Modules:**
- Role-based authentication (Better Auth sessions) with term-based admin logic
- Club registration and paid membership (SSLCommerz)
- Event creation, cross-department visibility, and registration
- Blood donation records and requests with admin verification
- Announcements scoped to clubs or departments
- AI chatbot powered by Google Gemini (RAG pattern)
- Full audit logging for critical actions

### Role name glossary

The platform has exactly **five roles**: `student`, `faculty`, `moderator`, `dept_admin`, `super_admin`. Other names used in conversation map as follows.

| Informal name | Meaning in this system |
|---------------|------------------------|
| Club Executive | A **position** (`ClubCommitteeMember.position`, e.g. President). The person holds the `moderator` role while the position is current. Not a separate role. |
| Central Admin | Not used. Platform-wide administration is `super_admin`. |
| Department Admin | `dept_admin` |

---

## 2. Goals & Success Metrics

| Goal | Metric |
|------|--------|
| Digitize club membership | 80%+ members enroll online within first semester |
| Centralize event management | All department events managed through platform |
| Enable cross-dept collaboration | Events with multi-dept participation tracked in EventDepartment |
| Blood donation network | Requests fulfilled within 24 hours via platform |
| AI self-service | Chatbot resolves 60%+ common queries without human intervention |
| Auditability | 100% of role changes and critical actions logged in AuditLog |

---

## 3. Tech Stack Summary

> Versions are minimums at the time of writing (November 2026). Confirm the exact current versions at scaffold time (Phase 1) and record them in `docs/DECISIONS.md`.

### Backend

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Runtime | Node.js | 24 LTS (22 LTS acceptable) | JavaScript runtime. Node 20 reached end of life on 30 April 2026. |
| Package manager | pnpm (workspaces) | Latest | Monorepo: `backend/`, `frontend/`, `packages/shared/` |
| Framework | Express.js | 5.x | REST API framework (native async error handling) |
| Language | TypeScript | 5.x | Type safety, ESM modules |
| Database | PostgreSQL | 15+ | Primary relational store |
| ORM | Prisma | Current major (7.x) | Type-safe DB client, migrations, seeding. Triggers and partial indexes via hand-written migration SQL. |
| Authentication | Better Auth | Latest | Email/password, required email verification, password reset, **database-backed sessions in an `httpOnly` cookie**. No custom JWT. |
| Cache / Queue | Redis 7.x + BullMQ | — | Rate limiting, email queue, scheduled jobs, chatbot cache |
| Email | Nodemailer | Latest | Verification, password reset, event reminders, notifications |
| File Uploads | Multer + Cloudinary | Latest | Event posters, user avatars |
| Logging | Winston | 3.x | Structured logging (console + file) |
| Validation | Zod | Latest compatible with Better Auth and the shared package | API input validation (shared with frontend) |
| Security | Helmet, CORS, express-rate-limit | — | Headers, CORS, rate limiting. Password hashing is handled by Better Auth (scrypt by default). |
| Payment | SSLCommerz | — | Club membership payment (BDT) |
| AI | Google Gemini API (model name from env `GEMINI_MODEL`) | Current Flash model | RAG chatbot. Confirm the current model name and its retirement date when building FR-AI. |
| API Docs | Swagger (OpenAPI 3.0) | — | Auto-generated interactive docs |
| Testing | Jest + Supertest | Latest | Unit and integration tests |
| SSL | Let's Encrypt | — | HTTPS in production |

### Frontend

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Framework | Next.js (App Router) | Latest stable | SSR, routing, optional `/api/*` rewrite proxy |
| Language | TypeScript | 5.x | Type safety (shared types with backend) |
| Styling | Tailwind CSS | v4 (CSS-first `@theme`) if the current shadcn CLI requires it; v3.4 otherwise | Utility-first CSS. Decide at scaffold time and record in `docs/DECISIONS.md`. |
| UI Components | shadcn/ui | — | Accessible Tailwind-based components |
| Motion | `motion` (`motion/react`) | Latest | Animations, page and scroll motion, reduced-motion support |
| Auth client | Better Auth client | Latest | Session handling in the browser (cookie-based) |
| Server State | TanStack Query (React Query) | 5.x | API caching, pagination, background updates |
| HTTP Client | Axios | 1.x | `withCredentials` requests, error handling interceptors (no token injection) |
| Validation | Zod | Same as backend | Reuse shared schemas in forms |
| Data Tables | TanStack Table | 8.x | Event lists, user management |
| Charts | Recharts | 2.x | Dashboard statistics |
| Forms | React Hook Form + Zod resolver | Latest | Performant validated forms |
| Testing | Jest + React Testing Library + Playwright | Latest | Unit, component, E2E |

### Infrastructure & DevOps

| Item | Tool |
|------|------|
| Frontend Deployment | Vercel |
| Backend Deployment | Railway / Render / AWS (API process and BullMQ worker process run separately) |
| Database Hosting | Neon (serverless PostgreSQL; pooled URL at runtime, direct URL for migrations) / AWS RDS |
| CI/CD | GitHub Actions |
| Environment Config | `.env` (backend), `.env.local` (frontend); keys are never committed |

---

## 4. System Architecture

```
[Client (Next.js)] ──HTTPS──► [Express.js API]
                                     │
                    ┌────────────────┼──────────────────┐
                    │                │                  │
              [PostgreSQL]        [Redis]          [Gemini API]
          (Prisma ORM + Better     (Rate limit,       (AI Chatbot)
           Auth sessions)           Queue, Cache)
                                     │
                              [BullMQ Worker process]
                              (Email, scheduled jobs)
                                     │
                              [Nodemailer / SMTP]
```

**Architecture Pattern:** Layered — `Controller → Service → Repository (Prisma)`. Business rules and `prisma.$transaction` live in services; Prisma queries live in repositories.

**Auth Flow (Better Auth sessions):**
1. User signs in with email and password → Better Auth validates credentials and creates a row in `Session`.
2. The browser receives a **session cookie** (`httpOnly`, `Secure`, `SameSite=Lax`). No token is stored in JavaScript.
3. Every protected API call carries the cookie. The `requireAuth` middleware resolves the session from the database (`auth.api.getSession`) and loads the user, including `role`, `user_type`, `department_id` and `is_active`.
4. Sessions last 7 days and refresh while the user is active (sliding window). Role changes take effect on the next request because the user row is read from the database (the cookie cache is **disabled** in V1).
5. Logout deletes the session row and clears the cookie. A password reset revokes all of the user's sessions.

**Authentication endpoints:** Better Auth is mounted at `/api/auth/*` **before** `express.json()` (otherwise requests hang). The business API lives under `/api/v1/*`.

**Cookie and domain strategy (decide before deployment):** the default is **same-origin**: the Next.js app proxies `/api/*` to the Express API with `rewrites`, so the session cookie is first-party. The alternative is two subdomains of one registrable domain (`app.example.com`, `api.example.com`) with a shared cookie domain. A Vercel frontend and a Railway API on unrelated domains would make the cookie third-party and break login.

**File Upload Flow:**
Multer (multipart/form-data) → Cloudinary → URL stored in DB (`avatar_url`, `logo_url`, `poster_image_url`)

**Background work:** all email and scheduled work runs in a separate BullMQ worker process, never inline in a request.

---

## 5. User Roles & Capabilities Matrix

### Role Definitions

| Role | Who | Assignment | Validity |
|------|-----|-----------|---------|
| `student` | Registered student | Self-registration + email verification | Permanent |
| `faculty` | Teacher / staff | Self-registration (separate URL) + email verification | Permanent |
| `moderator` | Student or faculty | `ClubCommitteeMember` with `is_current = true` | Committee term (yearly) |
| `dept_admin` | Faculty member | Super Admin creates `DepartmentAdminTerm` | Term-based; falls back to the base role after the term ends |
| `super_admin` | Platform owner | Manually seeded in DB | Permanent |

### Base type vs effective role

Every user has two stored values:

- **`user_type`** — `student`, `faculty` or `super_admin`. Set at registration or seeding. **Never changes.**
- **`role`** — the **effective** role used for authorization. Derived by `RoleService.recompute` from `user_type` and active terms (see Schema Section 20). Never edited directly.

Rules that depend on *what kind of person* the user is (buying a membership, recording a blood donation, having academic fields) use **`user_type`**. Rules that depend on *current authority* (creating events, verifying donations) use **`role`**. A student who is a moderator can therefore still buy a membership.

### Role Hierarchy

```
super_admin > dept_admin > moderator > faculty / student
```

### Full Capabilities Matrix

| Feature / Action | student | faculty | moderator | dept_admin | super_admin |
|-----------------|---------|---------|-----------|------------|-------------|
| Self-registration | ✅ | ✅ (separate URL) | ❌ | ❌ | ❌ |
| Email verification | ✅ | ✅ | ✅ | ✅ | ✅ |
| Login / Logout | ✅ | ✅ | ✅ | ✅ | ✅ |
| Password reset | ✅ | ✅ | ✅ | ✅ | ✅ |
| Complete own profile | ✅ (with academic fields) | ✅ (no academic fields) | ✅ (academic fields if `user_type = student`) | ✅ | ✅ |
| Upload avatar | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| View club info (own dept) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Purchase club membership (own dept's club) | ✅ | ❌ | ✅ (if `user_type = student`) | ❌ | ❌ |
| Renew / cancel own membership | ✅ | ❌ | ✅ (if `user_type = student`) | ❌ | ❌ |
| Browse events | ✅ | ✅ | ✅ | ✅ | ✅ |
| Register for events | ✅ | ✅ | ✅ | ✅ | — |
| Cancel own event registration | ✅ | ✅ | ✅ | ✅ | — |
| Create events | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit / delete events | ❌ | ❌ | ✅ (own club) | ✅ (dept) | ✅ (any) |
| Publish / cancel event | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage event registrations (check-in, export) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Post announcements | ❌ | ❌ | ✅ (club) | ✅ (dept) | ✅ (system) |
| View announcements | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add blood donation record (self) | ✅ | ✅ | ✅ | ✅ | ❌ |
| View blood donor list | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create blood request | ✅ | ✅ | ✅ | ✅ | ✅ |
| Fulfill blood request | ✅ | ✅ | ✅ | ✅ | ✅ |
| Verify blood donations | ❌ | ❌ | ❌ | ✅ (dept only) | ✅ (any) |
| Assign committee members | ❌ | ❌ | ❌ | ✅ | ✅ |
| Assign dept admin term | ❌ | ❌ | ❌ | ❌ | ✅ |
| Edit club details | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage all users | ❌ | ❌ | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ❌ | ❌ | ❌ | ✅ |
| Use AI chatbot | ✅ | ✅ | ✅ | ✅ | ✅ |

> Changed in V1.2: moderators and department admins are still students or faculty, so they may record blood donations, cancel their own event registrations, and (if `user_type = student`) buy memberships. V1.0 excluded them, which made the same person lose a feature when appointed.

---

## 6. Module FR-AUTH — Authentication & Authorization

> **Better Auth owns** sign-in, sign-out, email verification, resend verification, forgot password and reset password under `/api/auth/*`. The two registration endpoints below are **custom thin wrappers** so that `user_type`, `role` and `is_active` are set only on the server. Exact Better Auth route and option names must be confirmed against its current documentation during the Phase 4b plan.

### FR-AUTH-001: Student Registration

**Priority:** CRITICAL
**Endpoint:** `POST /api/v1/auth/register/student`
**Tables:** `User`, `Account`, `Verification`, `Department`

**User Story:** As a student, I want to register with my academic details so I can access my department's club and events.

**Input Validation (Zod, from `@uniconnect/shared`):**

```typescript
{
  name: string (min 2, max 100),
  email: string (valid email, any domain),
  password: string (min 8, max 100, must include uppercase, lowercase, number, special char),
  department_id: number (must exist in Department table),
  blood_group: enum ['A+','A-','B+','B-','AB+','AB-','O+','O-'],
  academic_session: string (e.g. "2022-2023"),
  current_year: number (1–4),
  current_semester: number (1 or 2),
  student_id: string (university roll number),
  phone: string (optional, valid format)
}
// .strict(): any unknown key (role, user_type, is_active, ...) is rejected with 400
```

**System Actions:**
1. Validate all fields with Zod (`.strict()`).
2. Check email uniqueness (case-insensitive; emails are stored lowercase) → 409 if duplicate. Also check `(department_id, student_id)` uniqueness → 409.
3. Create the user through Better Auth's server API (password hashing and the `Account` row are handled by Better Auth). The service sets `user_type = 'student'`, `role = 'student'`, `is_active = true`, `email_verified = false`. These fields are declared `input: false` in the Better Auth config so the public sign-up route can never set them.
4. Better Auth creates a `Verification` row (link valid **24 hours**) and calls the `sendVerificationEmail` callback, which **queues** the email in BullMQ.
5. Write an `AuditLog` entry (`USER_REGISTERED`).
6. Return 201 (no sensitive fields).

**Success Response (HTTP 201):**

```json
{
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "data": { "id": "3f2b8c1e-5a7d-4e0a-9d6b-1c2d3e4f5a6b", "email": "student@example.com", "role": "student" }
}
```

**Error Scenarios:**

| Condition | HTTP Status | Message |
|-----------|------------|---------|
| Duplicate email | 409 Conflict | "Email already registered." |
| Duplicate student ID in the department | 409 Conflict | "Student ID already registered." |
| Invalid department_id | 400 Bad Request | "Department not found." |
| Weak password | 400 Bad Request | "Password does not meet requirements." |
| Missing required or unknown field | 400 Bad Request | Zod validation error detail |

> The public Better Auth sign-up route (`/api/auth/sign-up/email`) must not be usable directly. Disable it or guard it so only the two custom endpoints create users. Confirm the mechanism in the Phase 4b plan.

---

### FR-AUTH-002: Faculty Registration

**Priority:** CRITICAL
**Endpoint:** `POST /api/v1/auth/register/faculty`
**Tables:** `User`, `Account`, `Verification`, `Department`

**User Story:** As a faculty member, I want to register via a dedicated URL so I can access faculty-specific features.

**Input Validation (Zod):**

```typescript
{
  name: string (min 2, max 100),
  email: string (valid email),
  password: string (min 8, max 100, complexity rules),
  department_id: number,
  blood_group: enum [...],
  phone: string (optional)
  // academic_session, current_year, current_semester, student_id: NOT accepted (.strict())
}
```

**System Actions:** Same flow as student registration but `user_type = 'faculty'` and `role = 'faculty'`. Academic fields are rejected if provided. Faculty accounts are active after email verification; no admin approval in V1 (see Section 25, decision 4).

---

### FR-AUTH-003: Email Verification

**Priority:** CRITICAL
**Handled by:** Better Auth (`/api/auth/verify-email?token=<token>`)
**Tables:** `User` (`email_verified`), `Verification`

**Requirements:**

| ID | Requirement | Acceptance Criteria |
|----|------------|-------------------|
| FR-AUTH-003.1 | Token must be valid | Exists in `Verification`, not expired. **Expiry is 24 hours in V1.** |
| FR-AUTH-003.2 | Activate account on success | `email_verified = true`; the token row is consumed. `is_active` is unchanged (it only means "not suspended"). |
| FR-AUTH-003.3 | Redirect after verification | Redirect to `/login?verified=true` |
| FR-AUTH-003.4 | Resend verification | Better Auth "send verification email" route. Rate limit: 1 per 5 min per email (Better Auth rate limiter plus `express-rate-limit`). |
| FR-AUTH-003.5 | Audit | `EMAIL_VERIFIED` is written through a Better Auth hook. |

**Error Scenarios:**

| Condition | HTTP Status |
|-----------|------------|
| Token not found or expired | 400 Bad Request |
| Already verified | 200 OK (idempotent) |

---

### FR-AUTH-004: Login

**Priority:** CRITICAL
**Handled by:** Better Auth (`/api/auth/sign-in/email`)
**Tables:** `User`, `Account`, `Session`

**Input:**

```typescript
{ email: string, password: string }
```

**System Actions:**
1. Better Auth finds the user by email (case-insensitive) and verifies the password.
2. Better Auth is configured with `requireEmailVerification: true`; unverified users cannot sign in.
3. An after-sign-in hook rejects users with `is_active = false` (suspended), deletes the just-created session, and returns 403.
4. A `Session` row is created and the session cookie is set (7 days, sliding).
5. The hook writes a `LOGIN` entry to `AuditLog` (actor = the user, with IP).

**Success Response:** Better Auth's native response (the user object and session). The frontend uses the Better Auth client; it does not parse a custom envelope for this route.

**Error Scenarios:**

| Condition | HTTP Status | Message |
|-----------|------------|---------|
| Email not found | 401 | "Invalid credentials." |
| Wrong password | 401 | "Invalid credentials." |
| Email not verified | 403 | "Please verify your email first." |
| Account suspended (`is_active = false`) | 403 | "Account is suspended. Contact admin." |

---

### FR-AUTH-005: Session Lifetime (replaces Token Refresh)

**Priority:** HIGH
**There is no refresh endpoint.** The `/auth/refresh` endpoint of V1.0 is removed.

**Rules:**
1. Session lifetime: 7 days, extended by activity at most once per day (Better Auth `expiresIn` / `updateAge`).
2. The session cookie is `httpOnly`, `Secure` in production, `SameSite=Lax`.
3. The client simply sends the cookie; an expired session returns 401 and the client redirects to `/login`.
4. Idle timeout, "remember me" and "log out of all devices" are decided in Section 25 (decision 19). V1 default: 7-day sliding session; "log out of all devices" is the profile's "Sign out other devices" action (Better Auth `/api/auth/revoke-other-sessions`; DECISIONS D30).

---

### FR-AUTH-006: Logout

**Priority:** HIGH
**Handled by:** Better Auth (`/api/auth/sign-out`)

**System Actions:**
1. Delete the `Session` row.
2. Clear the session cookie.
3. Return 200 OK.

---

### FR-AUTH-007: Password Reset

**Priority:** HIGH
**Handled by:** Better Auth (request-reset and reset-password routes under `/api/auth/*`; confirm current route names in the Phase 4b plan)

**Requirements:**

| ID | Requirement | Acceptance Criteria |
|----|------------|-------------------|
| FR-AUTH-007.1 | Request reset | Accept email only; do not reveal if email exists (always return the same response) |
| FR-AUTH-007.2 | Secure token | Generated by Better Auth, stored in `Verification`, expires in **1 hour**, single use |
| FR-AUTH-007.3 | Apply new password | Better Auth hashes the password; **all existing sessions of the user are revoked**; the token is consumed |
| FR-AUTH-007.4 | Password policy | Same rules as registration; cannot reuse last 3 passwords (V2) |
| FR-AUTH-007.5 | Rate limiting | Max 3 requests per email per hour |
| FR-AUTH-007.6 | Audit | `PASSWORD_CHANGED` is written for resets and for the change-password route |

---

### FR-AUTH-008: Authorization Middleware

**Priority:** CRITICAL

Every protected route uses three middleware layers, in order:

```typescript
// Layer 1: requireAuth — resolves the Better Auth session from the cookie, loads the user
router.use(requireAuth);

// Layer 2: requireRole — checks the effective role
router.get('/admin/users', requireRole(['super_admin']), ...);
router.post('/events', requireRole(['moderator', 'dept_admin', 'super_admin']), ...);

// Layer 3: requireDepartmentScope — tenant isolation
// For dept_admin and moderator: the target club / department / user must belong to
// the caller's department (or club). super_admin bypasses.
router.patch('/clubs/:id', requireRole(['dept_admin', 'super_admin']), requireDepartmentScope('club'), ...);
```

**Middleware Behavior:**

| Condition | Response |
|-----------|---------|
| Missing session cookie | 401 Unauthorized |
| Expired or revoked session | 401 Unauthorized (client redirects to login) |
| Tampered cookie | 401 Unauthorized |
| Valid session, wrong role | 403 Forbidden |
| Valid session, resource in another department | 403 Forbidden (or 404 when existence should not be revealed) |
| Account suspended (`is_active = false`) | 403 Forbidden |

**Tenant isolation rule:** every tenant-scoped Prisma query filters by `department_id` unless the caller is `super_admin`.

---

## 7. Module FR-USER — User Profile Management

### FR-USER-001: View Own Profile

**Priority:** HIGH
**Endpoint:** `GET /api/v1/users/me`
**Auth:** Any authenticated user

**Returns:** All user fields except secrets. Password hashes (`Account.password`) and `Verification` tokens are never returned. Includes `user_type` and the effective `role`.

---

### FR-USER-002: Update Own Profile

**Priority:** HIGH
**Endpoint:** `PATCH /api/v1/users/me`
**Auth:** Any authenticated user
**Tables:** `User`

**Updatable Fields:**

| Field | Who may change it |
|-------|-------------------|
| `name` | Any user |
| `phone` | Any user |
| `blood_group` | Any user |
| `academic_session` | `user_type = student` (and `super_admin` when assisting) |
| `current_year` | `user_type = student` (and `super_admin`) |
| `current_semester` | `user_type = student` (and `super_admin`) |
| `student_id` | `user_type = student` (and `super_admin`) |
| `department_id` | `super_admin` only |
| `role` | **Nobody.** The role is derived (see Section 5). |
| `user_type` | **Nobody.** Immutable. |

**Constraints:** `department_id` cannot be changed after registration (except by super_admin). The request uses a strict Zod schema; unknown keys are rejected.

---

### FR-USER-003: Upload Avatar

**Priority:** MEDIUM
**Endpoint:** `PATCH /api/v1/users/me/avatar`
**Auth:** Any authenticated user

**System Actions:**
1. Accept `multipart/form-data` (Multer).
2. Upload to Cloudinary.
3. Save returned URL to `User.avatar_url`.
4. Return updated user object.

**Validation:** Image only (JPEG, PNG, WebP), max 5MB.

---

### FR-USER-004: Change Password

**Priority:** HIGH
**Handled by:** Better Auth change-password route (`/api/auth/change-password`)
**Auth:** Any authenticated user

**Input:** `{ currentPassword, newPassword, revokeOtherSessions? }` (the confirm-password check is done in the form, using the shared Zod schema).

**System Actions:**
1. Better Auth verifies `currentPassword`.
2. Validate `newPassword` complexity (same policy as registration).
3. Better Auth hashes and saves the new password.
4. Other sessions of this user are revoked.
5. `PASSWORD_CHANGED` is written to `AuditLog` through a hook.

> The V1.0 route `POST /users/me/change-password` is removed; the frontend calls Better Auth directly.

---

### FR-USER-005: Admin — View / Manage All Users

**Priority:** HIGH
**Endpoints:**
- `GET /api/v1/admin/users` — list users (filter by role, department, is_active)
- `GET /api/v1/admin/users/:id` — get user detail
- `PATCH /api/v1/admin/users/:id/status` — suspend / activate (`is_active`). Suspending also revokes all of the user's sessions.
- `POST /api/v1/admin/users/:id/recompute-role` — re-run `RoleService.recompute` for one user (repair tool, idempotent, audited)
- `PATCH /api/v1/admin/users/:id` — correct a user's details when assisting (FR-USER-002): name, phone, blood group, department, and academic fields for students. A department change is refused (409) while the user holds a current term or an active/pending membership (DECISIONS D29)

**Auth:** `super_admin` only

**Pagination:** `?page=1&limit=20&sort=created_at&order=desc`, plus `?search=` on name or email. Response `{ success, data, meta: { page, limit, total, total_pages } }` (DECISIONS D9, D28).

Super admins cannot suspend or edit themselves or another super admin through these routes.

> **Removed in V1.2:** `PATCH /admin/users/:id/role` (direct role override). The role is derived from `user_type` and active terms; a manual override would be silently reverted at the next recompute. To change someone's role, change the committee or admin term that grants it.

---

## 8. Module FR-CLUB — Club Management

### FR-CLUB-001: View Club Details

**Priority:** HIGH
**Endpoint:** `GET /api/v1/clubs/:id`
**Auth:** Any authenticated user
**Tables:** `Club`, `Department`, `ClubCommitteeMember`

**Returns:**
- Club info (name, description, logo, fees)
- Current committee members (where `is_current = true`)
- Department name

---

### FR-CLUB-002: View My Department's Club

**Priority:** HIGH
**Endpoint:** `GET /api/v1/clubs/my-club`
**Auth:** Any authenticated user

Shortcut — resolves club by `User.department_id`. For `super_admin` (no department) returns 404 with a message directing to `GET /clubs`.

---

### FR-CLUB-003: Edit Club Details

**Priority:** MEDIUM
**Endpoint:** `PATCH /api/v1/clubs/:id`
**Auth:** `dept_admin` (own dept), `super_admin`
**Tables:** `Club`

**Editable Fields:** `name`, `description`, `membership_fee_monthly`, `membership_fee_yearly` (JSON; fees as 2-decimal amounts, `null` clears)

**Logo:** `PATCH /api/v1/clubs/:id/logo`, multipart field `logo`, same auth. The logo is never set from a client-supplied URL (DECISIONS D31).

**System Actions:**
1. Verify requesting user is dept_admin of the club's department (or super_admin).
2. Upload new logo through the `/logo` route (Cloudinary).
3. Update fields. Log in `AuditLog` (old and new fee values included): `CLUB_UPDATED`, or `CLUB_LOGO_UPDATED` for the logo.

---

### FR-CLUB-004: List All Clubs

**Priority:** LOW
**Endpoint:** `GET /api/v1/clubs`
**Auth:** Any authenticated user

Returns all clubs with department name, logo, and membership fee.

---

## 9. Module FR-MEM — Membership & Payments

### FR-MEM-001: Purchase Club Membership

**Priority:** CRITICAL
**Endpoint:** `POST /api/v1/memberships`
**Auth:** any authenticated user with `user_type = 'student'` (students and student moderators)
**Tables:** `ClubMembership`, `PaymentTransaction`, `User`, `Club`

**User Story:** As a student, I want to purchase a monthly or yearly club membership via SSLCommerz so I can access members-only events.

**Input:**

```typescript
{
  club_id: number,
  type: 'monthly' | 'yearly'
}
```

**System Actions:**
1. Check `User.user_type === 'student'`.
2. Check `club.department_id === user.department_id` (V1: a student may join only their own department's club; see Section 25, decision 6).
3. Check no existing `active` membership for this `(user_id, club_id)` pair. Cancel any stale `pending` membership of the same pair older than 30 minutes.
4. Calculate the provisional `start_date` (today) and `end_date` (+1 month or +1 year).
5. In one transaction: create `ClubMembership` with **`status = 'pending'`** and `PaymentTransaction` with `payment_status = 'pending'`, a unique `transaction_id` (our `tran_id`), the fee amount from `Club`, and currency `BDT`.
6. Initiate the SSLCommerz payment session (sandbox while `is_live = false`) with `success_url`, `fail_url`, `cancel_url` and `ipn_url`.
7. Return the SSLCommerz payment URL → client redirects user.

**Payment Callback (SSLCommerz IPN):**
- `POST /api/v1/memberships/payment/ipn`
- **IPN messages are not signed.** Never trust the IPN body on its own.
- Step 1: read `tran_id` and `val_id` from the IPN. Load the `PaymentTransaction` by `transaction_id`.
- Step 2: call the SSLCommerz **Order Validation API** with `val_id` and the store credentials. Accept the payment only if the validation status is `VALID` or `VALIDATED` **and** the returned `tran_id`, amount and currency match the stored row.
- Step 3 (success), in one transaction and **idempotent**: `UPDATE payment_transactions SET payment_status = 'completed', val_id, bank_tran_id, validated_at, payment_gateway_response, payment_method WHERE transaction_id = $1 AND payment_status = 'pending'`. If a row was updated: set `ClubMembership.status = 'active'` and recompute its `start_date` / `end_date` from the activation day, write `MEMBERSHIP_PURCHASED` and `PAYMENT_COMPLETED` audit entries (actor = system), and queue the receipt email. If zero rows were updated the IPN is a duplicate: return 200 with no side effects.
- Step 4 (failure or mismatch): set `payment_status = 'failed'`, set the `pending` membership to `cancelled`, write `PAYMENT_FAILED`. Only a validation answer whose `tran_id` matches the stored row can fail a payment; an IPN with no `val_id`, or one whose `val_id` belongs to another transaction, changes nothing (DECISIONS D32).
- Built with a mock gateway until the merchant account exists (`PAYMENT_GATEWAY=mock`, refused in production; DECISIONS D32).
- The browser `success_url` / `fail_url` pages are **display only**; they never grant membership.

**Constraint:** One active membership per `(user_id, club_id)`, enforced by a partial unique index. Renewal only allowed after current expires or is cancelled (see FR-MEM-002 for the early-renewal exception).

---

### FR-MEM-002: Renew Membership

**Priority:** HIGH
**Endpoint:** `POST /api/v1/memberships/:id/renew`
**Auth:** any authenticated user with `user_type = 'student'`

Creates a **new** `ClubMembership` row (does not overwrite old) with `status = 'pending'` and follows the same payment flow as FR-MEM-001. Only an `active` or `expired` membership can be renewed (409 otherwise). On activation, `start_date = old end_date + 1 day` when the previous membership is still active, otherwise today. New payment transaction required. To keep the one-active-row rule, a paid early renewal becomes **`scheduled`** (ADR 0001, DECISIONS D11) and the daily `expire-memberships` job makes it `active` once the previous row has expired. One `pending` or `scheduled` row per user per club (partial unique index); a second renewal while one is scheduled is a 409.

---

### FR-MEM-003: Cancel Membership

**Priority:** HIGH
**Endpoint:** `PATCH /api/v1/memberships/:id/cancel`
**Auth:** owner (`user_type = student`), `dept_admin` (dept), `super_admin` (any)

Sets `ClubMembership.status = 'cancelled'` for a `pending`, `scheduled` or `active` row (409 otherwise); a `pending` row's payment becomes `failed`. No refund in V1. Writes `MEMBERSHIP_CANCELLED`. Anyone else (another student, faculty, another department's admin) gets 404, so a membership's existence is not revealed (DECISIONS D32).

---

### FR-MEM-004: View My Memberships

**Priority:** HIGH
**Endpoint:** `GET /api/v1/memberships/my`
**Auth:** any authenticated user with `user_type = 'student'`

Returns all memberships (pending, scheduled, active, expired, cancelled) for the authenticated student.

---

### FR-MEM-005: Admin — View All Department Memberships

**Priority:** MEDIUM
**Endpoint:** `GET /api/v1/admin/memberships`
**Auth:** `dept_admin` (own dept), `super_admin`

Filter by `status`, `type`. Shows user name, membership dates, payment status.

---

## 10. Module FR-COMM — Club Committee Management

### FR-COMM-001: View Club Committee

**Priority:** HIGH
**Endpoint:** `GET /api/v1/clubs/:id/committee`
**Auth:** Any authenticated user
**Tables:** `ClubCommitteeMember`, `User`

Returns all committee members with `position`, `term_start_year`, `term_end_year`, `is_current`.

---

### FR-COMM-002: Assign Committee Member

**Priority:** HIGH
**Endpoint:** `POST /api/v1/clubs/:id/committee`
**Auth:** `dept_admin` (same dept), `super_admin`
**Tables:** `ClubCommitteeMember`, `User`

**Input:**

```typescript
{
  user_id: string (uuid),
  position: string,      // e.g. "President", "Secretary"
  term_start_year: number,
  term_end_year: number,
  is_current: boolean
}
```

**System Actions (one `prisma.$transaction`):**
1. Verify `user.department_id` matches `club.department_id`. Verify `user.user_type` is `student` or `faculty`.
2. Insert `ClubCommitteeMember` row. The partial unique index rejects a second current position for the same user and club (409).
3. **Role recompute (service, not a trigger):** call `RoleService.recompute(user_id, tx)`. A `student` or `faculty` becomes `moderator`; a `dept_admin` stays `dept_admin`.
4. Log in `AuditLog`: `action = 'ASSIGN_COMMITTEE_MEMBER'` (and `ROLE_CHANGED` if the role changed).

**Constraint:** User must belong to the same department as the club.

---

### FR-COMM-003: End Committee Term

**Priority:** HIGH
**Endpoint:** `PATCH /api/v1/clubs/:clubId/committee/:memberId/end-term`
**Auth:** `dept_admin` (same dept), `super_admin`

**System Actions (one transaction):**
1. Set `ClubCommitteeMember.is_current = false`.
2. **Role recompute:** call `RoleService.recompute(user_id, tx)`. The role is recalculated from **all** the user's active terms: it falls back to `user_type` (`student` or `faculty`) only if no committee row and no admin term remains. A user who still holds another current committee row stays `moderator`; a faculty member with an active admin term stays `dept_admin`.
3. Log in `AuditLog`: `END_COMMITTEE_TERM` (and `ROLE_CHANGED` if applicable).

---

### FR-COMM-004: Edit Committee Member

**Priority:** LOW
**Endpoint:** `PATCH /api/v1/clubs/:clubId/committee/:memberId`
**Auth:** `dept_admin`, `super_admin`

Editable: `position`, `term_start_year`, `term_end_year`.

---

## 11. Module FR-ADMIN — Department Admin Term Management

### FR-ADMIN-001: Assign Department Admin

**Priority:** CRITICAL
**Endpoint:** `POST /api/v1/admin/dept-admin-terms`
**Auth:** `super_admin` only
**Tables:** `DepartmentAdminTerm`, `User`

**User Story:** As the super admin, I want to assign a faculty member as Dept Admin for a specific department and term so that they can manage their department's operations.

**Input:**

```typescript
{
  user_id: string (uuid),   // must have user_type = 'faculty'
  department_id: number,    // must equal the user's own department
  start_date: date,
  end_date: date
}
```

**System Actions (one transaction):**
1. Verify `user.user_type === 'faculty'` (not `user.role`: a faculty member who is currently a moderator still qualifies) and `user.department_id === department_id`.
2. Check the user has no other `is_current = true` term and the department has no other current admin. The partial unique indexes enforce this; the service returns 409 with a clear message.
3. Insert `DepartmentAdminTerm` with `is_current = true`.
4. **Role recompute:** `RoleService.recompute(user_id, tx)` → `dept_admin`.
5. Log in `AuditLog`: `action = 'ASSIGN_DEPT_ADMIN'` (and `ROLE_CHANGED`). Queue the "assigned as Dept Admin" email.

---

### FR-ADMIN-002: End / Expire Dept Admin Term

**Priority:** CRITICAL
**Endpoint:** `PATCH /api/v1/admin/dept-admin-terms/:id/end`
**Auth:** `super_admin` only

**System Actions (one transaction):**
1. Set `DepartmentAdminTerm.is_current = false`.
2. **Role recompute:** the role becomes `moderator` if the user still has a current committee row, otherwise `faculty`.
3. Log in `AuditLog`: `action = 'END_DEPT_ADMIN_TERM'` (and `ROLE_CHANGED`).

---

### FR-ADMIN-003: Extend / Renew Term

**Priority:** HIGH
**Endpoint:** `POST /api/v1/admin/dept-admin-terms/:id/renew`

In **one transaction**: set the old term `is_current = false`, insert the new `DepartmentAdminTerm` with the new dates and `is_current = true`, then recompute the role. The role stays `dept_admin` throughout. (V1.0 reused the create endpoint; with the partial unique indexes a separate renew operation is required so the old and new rows never overlap in time.)

---

### FR-ADMIN-004: View All Dept Admin Terms

**Priority:** HIGH
**Endpoint:** `GET /api/v1/admin/dept-admin-terms`
**Auth:** `super_admin`

Filter by `department_id`, `is_current`, `user_id`.

---

### FR-ADMIN-005: Scheduled Jobs (BullMQ repeatable)

**Frequency:** Daily at 00:05 `Asia/Dhaka` unless noted
**Trigger:** BullMQ repeatable jobs in the **worker** process

Every job calls the same services as the manual endpoints, so audit entries and role recomputation always run. Jobs are idempotent and safe to run twice.

| Job | Rule | Service called |
|-----|------|----------------|
| `expire-dept-admin-terms` | `is_current AND end_date < today` → end the term | `DepartmentAdminService.endTerm` (actor = system) |
| `expire-committee-terms` | `is_current AND term_end_year < current year (Asia/Dhaka)` → end the term | `CommitteeService.endTerm` (actor = system) |
| `expire-memberships` | `status = 'active' AND end_date < today` → `expired` | `MembershipService.expire` |
| `cancel-stale-pending-memberships` | `status = 'pending'` older than 30 minutes with no completed payment → `cancelled`, transaction `failed` (every 15 minutes) | `MembershipService.cancelStale` |
| `reconcile-payments` | `payment_status = 'pending'` older than 1 hour → query SSLCommerz Transaction Query API and settle the row | `PaymentService.reconcile` |
| `expire-blood-requests` | `status = 'pending' AND required_by_date < today` → `expired` (FR-BLOOD-009) | `BloodService.expireRequests` |
| `event-reminders` | published events starting within 24 hours → queue reminder emails once | `EventService.sendReminders` |
| `purge-chat-logs` | `ChatLog.created_at` older than 90 days → delete | `ChatService.purge` |

```sql
-- Illustrative selection only. The services perform the update + recompute + audit.
SELECT id FROM department_admin_terms WHERE is_current AND end_date < CURRENT_DATE;
SELECT id FROM club_committee_members
 WHERE is_current AND term_end_year < EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Dhaka');
```

---

## 12. Module FR-EVENT — Event Management

### FR-EVENT-001: Create Event

**Priority:** CRITICAL
**Endpoint:** `POST /api/v1/events`
**Auth:** `moderator`, `dept_admin`, `super_admin`
**Tables:** `Event`, `EventDepartment`, `Club`, `User`

**User Story:** As a moderator, I want to create a club event with cross-department visibility so that students from multiple departments can participate.

**Input:**

```typescript
{
  title: string (max 200),
  description: string (optional),
  organizer_club_id: number,
  visibility: 'public' | 'members_only',
  is_paid: boolean,
  fee_amount: number (required if is_paid = true),
  start_date: datetime (must be future),
  end_date: datetime (must be after start_date),
  venue: string (optional, max 200),
  max_attendees: number (optional),
  poster_image_url: string (optional — uploaded separately),
  department_ids: number[] (min 1 — departments involved, auto-includes organizer's dept)
}
```

**System Actions:**
1. Validate organizer: `moderator` can only create for own club (a club where they hold a current committee row); `dept_admin` for own dept's club; `super_admin` for any.
2. Insert `Event` with `status = 'draft'`.
3. Insert `EventDepartment` rows for each `department_id` (the organizer's department is added automatically).
4. Log in `AuditLog`.

---

### FR-EVENT-002: Upload Event Poster

**Priority:** MEDIUM
**Endpoint:** `PATCH /api/v1/events/:id/poster`
**Auth:** `moderator` (own club), `dept_admin`, `super_admin`

Multer → Cloudinary → save URL to `Event.poster_image_url`.

---

### FR-EVENT-003: Publish Event

**Priority:** CRITICAL
**Endpoint:** `PATCH /api/v1/events/:id/publish`
**Auth:** `moderator` (own club), `dept_admin`, `super_admin`

**System Actions:**
1. Validate `status = 'draft'`.
2. Set `status = 'published'`.
3. Queue email notifications to relevant users (BullMQ).
4. Log in `AuditLog`.

---

### FR-EVENT-004: Edit Event

**Priority:** HIGH
**Endpoint:** `PATCH /api/v1/events/:id`
**Auth:** `moderator` (own club), `dept_admin`, `super_admin`

**Constraints:**
- Cannot change `start_date` or `end_date` after `status = 'published'`.
- Cannot edit if `status = 'cancelled'` or `'completed'`.

---

### FR-EVENT-005: Cancel Event

**Priority:** HIGH
**Endpoint:** `PATCH /api/v1/events/:id/cancel`
**Auth:** `moderator` (own club), `dept_admin` (can override), `super_admin`

**System Actions:**
1. Set `Event.status = 'cancelled'`.
2. Queue cancellation emails to all registered users (BullMQ).
3. Log in `AuditLog`.

---

### FR-EVENT-006: Browse Events

**Priority:** CRITICAL
**Endpoint:** `GET /api/v1/events`
**Auth:** Any authenticated user

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `department_id` | number | Filter by involved department |
| `visibility` | `public` \| `members_only` | Filter by visibility |
| `status` | `upcoming` \| `past` \| `published` | Filter by event status |
| `is_paid` | boolean | Free or paid |
| `club_id` | number | Filter by organizer club |
| `page` | number | Pagination |
| `limit` | number | Items per page (default 10) |
| `search` | string | Full-text search on title (uses the `events_fts` index) |

**Visibility Logic (same rule as registration, FR-EVENT-007):**
- `public` events → visible to all authenticated users.
- `members_only` events → visible only to users who (a) have a `ClubMembership` with `status = 'active'` (and `end_date >= today`) in a club whose `department_id` is listed in `EventDepartment` for the event, **and** (b) whose own `department_id` is also in that list. Organizers (the committee of the organizer club), `dept_admin` of an involved department, and `super_admin` can always see the event.
- Draft events are visible only to the organizing club's moderators, `dept_admin` of the organizer's department, and `super_admin`.

---

### FR-EVENT-007: Event Registration

**Priority:** CRITICAL
**Endpoint:** `POST /api/v1/events/:id/register`
**Auth:** `student`, `faculty`, `moderator`, `dept_admin` (all roles except `super_admin`)
**Tables:** `EventRegistration`, `ClubMembership`, `EventDepartment`

**Eligibility Checks:**
1. Event `status = 'published'` and `end_date` is in the future.
2. If `visibility = 'members_only'`: user must have an active `ClubMembership` in a club whose `department_id` is in `EventDepartment` for this event, AND the user's own `department_id` must be in that set.
3. If `max_attendees` is set: the count of registrations with `status IN ('registered','attended')` must be < `max_attendees`. The count and the insert run in one transaction (serializable or with a row lock on the event) so concurrent requests cannot overbook.
4. User must not already hold an active registration (`UNIQUE (user_id, event_id)`). If the user previously **cancelled**, the existing row is reused (`status = 'registered'`, `cancelled_at = NULL`) instead of inserting a new one.

**System Actions:**
1. Insert (or reactivate) `EventRegistration` with `status = 'registered'`.
2. Queue registration confirmation email.

---

### FR-EVENT-008: Cancel Registration

**Priority:** HIGH
**Endpoint:** `DELETE /api/v1/events/:id/register`
**Auth:** `student`, `faculty`, `moderator`, `dept_admin` (own registration only)

**Constraint:** Can only cancel if `Event.start_date > NOW()`.

Sets `EventRegistration.status = 'cancelled'`, `cancelled_at = NOW()`.

---

### FR-EVENT-009: View My Registrations

**Priority:** HIGH
**Endpoint:** `GET /api/v1/events/my-registrations`
**Auth:** Any authenticated user

Returns list of events the user is registered for (upcoming and past), with status per registration.

---

### FR-EVENT-010: Event Check-In (Attendance)

**Priority:** HIGH
**Endpoint:** `PATCH /api/v1/events/:id/registrations/:regId/check-in`
**Auth:** `moderator` (own club), `dept_admin`, `super_admin`

**System Actions:**
1. Set `EventRegistration.status = 'attended'`, `checked_in_at = NOW()`.

---

### FR-EVENT-011: View Event Registrations

**Priority:** HIGH
**Endpoint:** `GET /api/v1/events/:id/registrations`
**Auth:** `moderator` (own club), `dept_admin`, `super_admin`

Returns list of registered users with check-in status. Supports CSV export (`?format=csv`).

---

### FR-EVENT-012: Mark Event Completed

**Priority:** MEDIUM
**Endpoint:** `PATCH /api/v1/events/:id/complete`
**Auth:** `moderator` (own club), `dept_admin`, `super_admin`

Sets `Event.status = 'completed'`. Can only be done after `end_date`.

---

## 13. Module FR-ANNOUNCE — Announcements

### FR-ANNOUNCE-001: Create Announcement

**Priority:** HIGH
**Endpoint:** `POST /api/v1/announcements`
**Auth:** `moderator` (club scope), `dept_admin` (dept scope), `super_admin` (any scope)
**Tables:** `Announcement`

**Input:**

```typescript
{
  title: string (max 200),
  content: string,
  club_id?: number,       // for moderator
  department_id?: number, // for dept_admin
  is_pinned?: boolean
  // At least one of club_id or department_id required
}
```

**Scope Enforcement:**
- `moderator` → `club_id` must belong to own club; `department_id` not allowed.
- `dept_admin` → `department_id` must be own dept; `club_id` within own dept allowed.
- `super_admin` → any combination (system-wide if neither is set — V2).

---

### FR-ANNOUNCE-002: View Announcements

**Priority:** HIGH
**Endpoint:** `GET /api/v1/announcements`
**Auth:** Any authenticated user

Returns announcements relevant to the user's department or clubs they are members of. Pinned announcements appear first.

**Query Params:** `?club_id=`, `?department_id=`, `?is_pinned=true`, `?page=`, `?limit=`

---

### FR-ANNOUNCE-003: Edit / Delete Announcement

**Priority:** MEDIUM
**Endpoints:**
- `PATCH /api/v1/announcements/:id`
- `DELETE /api/v1/announcements/:id`

**Auth:** Original `author_id` (if moderator), `dept_admin` (own dept), `super_admin`

---

### FR-ANNOUNCE-004: Pin / Unpin Announcement

**Priority:** LOW
**Endpoint:** `PATCH /api/v1/announcements/:id/pin`
**Auth:** `dept_admin`, `super_admin`

Toggles `is_pinned`.

---

## 14. Module FR-BLOOD — Blood Donation & Requests

### FR-BLOOD-001: Add Blood Donation Record

**Priority:** HIGH
**Endpoint:** `POST /api/v1/blood/donations`
**Auth:** `student`, `faculty`, `moderator`, `dept_admin` (all roles except `super_admin`)
**Tables:** `BloodDonation`, `User`

**User Story:** As a student, I want to record my blood donation so that others can find me as a potential donor.

**Input:**

```typescript
{
  donation_date: date (cannot be future),
  units: number (default 1, max 4),
  hospital_name: string (optional),
  notes: string (optional)
  // blood_group auto-copied from User.blood_group
}
```

**System Actions:**
1. Insert `BloodDonation` with `verified = false`, `verified_by = NULL`, `verified_at = NULL`.
2. `User.last_donation_date` is **not** changed (only verified donations count).
3. Confirm to user that record is pending verification.

---

### FR-BLOOD-002: Verify Blood Donation

**Priority:** HIGH
**Endpoint:** `PATCH /api/v1/blood/donations/:id/verify`
**Auth:** `dept_admin` (same dept as donor), `super_admin`
**Tables:** `BloodDonation`, `User`

**System Actions (one transaction, service layer — no database trigger):**
1. `dept_admin`: verify `BloodDonation.user.department_id === admin.department_id`. An admin cannot verify their own donation.
2. Set `verified = true`, `verified_by = current_user.id`, `verified_at = NOW()`.
3. Set `User.last_donation_date` to the latest `donation_date` among that user's **verified** donations.
4. Log `BLOOD_DONATION_VERIFIED` in `AuditLog`.

---

### FR-BLOOD-003: View Donation History (Self)

**Priority:** HIGH
**Endpoint:** `GET /api/v1/blood/donations/my`
**Auth:** Any authenticated user except `super_admin`

Returns all own donation records with verification status.

---

### FR-BLOOD-004: View Donor List

**Priority:** HIGH
**Endpoint:** `GET /api/v1/blood/donors`
**Auth:** Any authenticated user
**Tables:** `BloodDonation`, `User`

**Query Params:** `?blood_group=A+`, `?department_id=`, `?verified_only=true`

**Returns per donor:** name, blood group, department, last donation date, phone (if user has phone set), verified badge.

**Sorting:** By `User.last_donation_date` (most recent first).

**Privacy Note:** Do not expose `email`. Only `name`, `phone`, `blood_group`, `department`, `last_donation_date`. Whether phone numbers are shown to every authenticated user or only on request, and the donor consent model, are decided in Section 25 (decision 14).

---

### FR-BLOOD-005: Create Blood Request

**Priority:** HIGH
**Endpoint:** `POST /api/v1/blood/requests`
**Auth:** Any authenticated user
**Tables:** `BloodRequest`

**Input:**

```typescript
{
  patient_name: string,
  blood_group: enum [...],
  units_needed: number,
  reason: string (optional),
  contact_phone: string,
  hospital_name: string,
  required_by_date: date (must be future)
}
```

**System Actions:**
1. Insert `BloodRequest` with `status = 'pending'`, `requester_id = current_user.id`.
2. Optionally: notify users with matching blood group via email (BullMQ — configurable in V1).

---

### FR-BLOOD-006: View Blood Requests

**Priority:** HIGH
**Endpoint:** `GET /api/v1/blood/requests`
**Auth:** Any authenticated user

**Query Params:** `?status=pending`, `?blood_group=O+`, `?department_id=`

Returns active (pending) requests by default.

---

### FR-BLOOD-007: Fulfill Blood Request

**Priority:** HIGH
**Endpoint:** `PATCH /api/v1/blood/requests/:id/fulfill`
**Auth:** Any authenticated user

**System Actions:**
1. Set `BloodRequest.status = 'fulfilled'`, `fulfilled_by = current_user.id`, `resolved_at = NOW()`.
2. Does **NOT** auto-create a `BloodDonation` record. Donor must do that separately.
3. Notify requester via email.

---

### FR-BLOOD-008: Cancel Blood Request

**Priority:** MEDIUM
**Endpoint:** `PATCH /api/v1/blood/requests/:id/cancel`
**Auth:** `requester_id` (own), `dept_admin`, `super_admin`

Sets `status = 'cancelled'`, `resolved_at = NOW()`.

---

### FR-BLOOD-009: Cron — Expire Blood Requests

**Frequency:** Daily (see the job table in FR-ADMIN-005)

```sql
UPDATE blood_requests
SET status = 'expired', resolved_at = NOW()
WHERE status = 'pending'
  AND required_by_date < CURRENT_DATE;
```

---

### FR-BLOOD-010: Admin — View Unverified Donations

**Priority:** HIGH
**Endpoint:** `GET /api/v1/admin/blood/donations/unverified`
**Auth:** `dept_admin` (own dept), `super_admin`

Returns all `BloodDonation` records where `verified = false`, filtered by department.

---

## 15. Module FR-AI — AI Chatbot (RAG)

### FR-AI-001: Ask Chatbot

**Priority:** HIGH
**Endpoint:** `POST /api/v1/chatbot/ask`
**Auth:** Any authenticated user
**Tables:** `Event`, `Announcement`, `Club` (context), `ChatLog` (analytics)

**User Story:** As a user, I want to ask the chatbot questions about events, clubs, and blood donation so I can get instant answers.

**Input:**

```typescript
{ question: string (min 1, max 500) }
```

**System Flow (RAG):**

```
User Question
    ↓
[Backend] → PostgreSQL full-text search (GIN indexes) on:
  - Event (title, description, status, dates)
  - Announcement (title, content)
  - Club (name, description)
  **filtered first by what THIS user may see**
  (department scope, public vs members_only, published only)
    ↓
Top 5 relevant records retrieved
    ↓
Build LLM prompt:
  System: "You are a helpful assistant for UniConnect..."
  Context: retrieved records
  Question: user's question
    ↓
Google Gemini API (model from env GEMINI_MODEL)
    ↓
Return natural language answer + source ids
```

**Prompt Template:**

```
You are a helpful, friendly assistant for UniConnect — a university club management platform.
Use ONLY the following context to answer the user's question.
If the answer is not in the context, respond: "I don't have information about that. Please contact your club moderator or department admin."
Do not make up information.

Context:
{retrieved_context}

User question: {question}
```

**Visibility rule:** retrieval applies the same visibility rules as FR-EVENT-006 and FR-ANNOUNCE-002 **before** the similarity search, so the chatbot never reveals a members-only event or another department's announcement to a user who could not open it.

**Rate Limiting:** Max 10 requests per user per minute (Redis).

**Caching:** Cache frequent answers in Redis (TTL: 5 min) — key: `chatbot:<department_id>:<visibility_scope>:<hashed_question>` (the scope is part of the key so one user's answer is never served to a user with different visibility).

**Privacy:** Strip emails, phone numbers from context before sending to Gemini. Blood donor data is **not** part of the retrieval corpus.

**Model configuration:** the model name comes from `GEMINI_MODEL`; the code has no hard-coded model. Confirm the current model and its retirement date when building this module.

**Success Response (HTTP 200):**

```json
{
  "answer": "The next CSE event is CodeFest 2025 on March 15th at 2 PM in Room 301.",
  "sources": [{ "type": "event", "id": 12 }]
}
```

---

### FR-AI-002: Chat Log (Analytics)

`ChatLog` is a **decided table** in V1.2 (Schema Section 14). Each `ask` call writes one row (`user_id`, `question`, `answer`). **Retention: 90 days** (job `purge-chat-logs`, FR-ADMIN-005). Retrieved context is not stored.

`GET /api/v1/admin/chatbot/logs` — `super_admin` only, view common queries for improvement. Supports `?from=`, `?to=`, `?page=`, `?limit=`.

> V1.0 listed this as `POST`; viewing logs is a read, so it is `GET`.

---

### FR-AI-003: Event Description Generator

**Priority:** LOW (nice-to-have V1)
**Endpoint:** `POST /api/v1/ai/generate-event-description`
**Auth:** `moderator`, `dept_admin`, `super_admin`

**Input:** `{ title: string, club_name: string, date: string, venue: string }`

Calls Gemini to generate a 2–3 sentence engaging event description. Returns suggestion; user can edit before saving. Shares the chatbot's rate limit.

---

## 16. Module FR-AUDIT — Audit Logs

### FR-AUDIT-001: Log Critical Actions

**Priority:** HIGH
**Tables:** `AuditLog`
**Auth:** Automatic (system-generated)

**Rule:** every privileged mutation writes its audit row through `AuditService` **inside the same database transaction** as the change, so the log and the data can never disagree. Better Auth events (login, email verified, password changed) are written through Better Auth hooks. Audit rows are append-only.

**Actions to Log:**

| Action | Trigger |
|--------|---------|
| `USER_REGISTERED` | New user created |
| `EMAIL_VERIFIED` | Email verification success |
| `LOGIN` | Successful login |
| `PASSWORD_CHANGED` | Password change or reset |
| `ROLE_CHANGED` | Any `User.role` change made by `RoleService.recompute` |
| `PROFILE_UPDATED` | Own profile edited through `PATCH /users/me` (changed fields only; DECISIONS D24) |
| `AVATAR_UPDATED` | Own avatar replaced (DECISIONS D24) |
| `ASSIGN_COMMITTEE_MEMBER` | New `ClubCommitteeMember` inserted |
| `COMMITTEE_MEMBER_UPDATED` | Committee position or years edited (DECISIONS D34) |
| `END_COMMITTEE_TERM` | `is_current` set to false |
| `ASSIGN_DEPT_ADMIN` | New `DepartmentAdminTerm` inserted |
| `END_DEPT_ADMIN_TERM` | `is_current` set to false |
| `RENEW_DEPT_ADMIN_TERM` | Term renewed |
| `MEMBERSHIP_PURCHASED` | `ClubMembership` becomes `active` after validated payment |
| `MEMBERSHIP_CANCELLED` | `ClubMembership` cancelled |
| `PAYMENT_COMPLETED` | Validation API confirmed a payment (actor = system) |
| `PAYMENT_FAILED` | Payment failed or validation mismatch, or the gateway could not open a session (actor = system) |
| `MEMBERSHIP_SCHEDULED` | A paid early renewal became `scheduled` (actor = system; ADR 0001) |
| `MEMBERSHIP_ACTIVATED` | The daily job started a `scheduled` renewal (actor = system) |
| `MEMBERSHIP_EXPIRED` | The daily job expired an `active` membership past its end date (actor = system) |
| `CHECKOUT_EXPIRED` | An unpaid checkout older than 30 minutes was cancelled (stale job, or replaced by a new checkout) |
| `CLUB_UPDATED` | Club details or fees changed |
| `CLUB_LOGO_UPDATED` | Club logo replaced through `PATCH /clubs/:id/logo` |
| `EVENT_CREATED` | New event inserted |
| `EVENT_PUBLISHED` | Event `status → published` |
| `EVENT_CANCELLED` | Event `status → cancelled` |
| `EVENT_UPDATED` | Event fields or poster changed (changed fields only; DECISIONS D36) |
| `EVENT_COMPLETED` | Event `status → completed`; remaining registrations marked `no_show` (DECISIONS D36) |
| `EVENT_CHECK_IN` | An organizer checked a registrant in (DECISIONS D36) |
| `BLOOD_DONATION_VERIFIED` | `BloodDonation.verified → true` |
| `USER_SUSPENDED` | `User.is_active → false` |
| `USER_ACTIVATED` | `User.is_active → true` |
| `USER_UPDATED_BY_ADMIN` | A super admin edited another user through `PATCH /admin/users/:id` (changed fields only; DECISIONS D29) |

**Log Entry:**

```typescript
{
  user_id: string | null,   // actor (uuid); null = system / cron / IPN
  action: string,
  entity_type: string,      // e.g. "ClubCommitteeMember"
  entity_id: string,        // PK of affected row, as text (integer or uuid)
  old_value: JSON,          // state before (never passwords or tokens)
  new_value: JSON,          // state after
  ip_address: string
}
```

---

### FR-AUDIT-002: View Audit Logs

**Priority:** HIGH
**Endpoint:** `GET /api/v1/admin/audit-logs`
**Auth:** `super_admin` only

**Query Params:** `?user_id=`, `?action=`, `?entity_type=`, `?from=`, `?to=`, `?page=`, `?limit=`

---

## 17. Module FR-DASHBOARD — Dashboards

### FR-DASH-001: Student Dashboard

**Endpoint:** `GET /api/v1/dashboard/student`
**Auth:** `student`

**Returns:**
- Upcoming events (own department + cross-dept where `user.department_id` in `EventDepartment`)
- Own active club membership status + expiry date
- Latest announcements (own dept / club)
- Pending blood requests matching own blood group
- AI chatbot widget data (enabled)

---

### FR-DASH-002: Moderator Dashboard

**Endpoint:** `GET /api/v1/dashboard/moderator`
**Auth:** `moderator`

**Returns:**
- Summary: upcoming events (own club), total registrations, active members
- Events pending publish (drafts)
- Recent registrations for upcoming events
- Club member count
- Current committee list

---

### FR-DASH-003: Department Admin Dashboard

**Endpoint:** `GET /api/v1/dashboard/dept-admin`
**Auth:** `dept_admin`

**Returns:**
- Total users in department (by role)
- Events this month (own dept)
- Pending blood donation verifications count
- Active memberships count
- Announcements posted (own dept)
- Current committee assignment status
- Current admin term start/end dates

---

### FR-DASH-004: Super Admin Dashboard

**Endpoint:** `GET /api/v1/dashboard/super-admin`
**Auth:** `super_admin`

**Returns:**
- Global stats: users per role, users per department
- Total events (all statuses)
- Total active memberships + revenue (sum of completed PaymentTransactions)
- Total fulfilled blood requests
- Recent `AuditLog` entries (last 10)
- Active `DepartmentAdminTerm` entries
- System health indicators (including queue health)

---

## 18. API Endpoint Reference

Business endpoints are prefixed with `/api/v1`. Authentication is handled by Better Auth under `/api/auth` (mounted before `express.json()`).

### Auth

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| POST | `/api/v1/auth/register/student` | Public | Student registration (custom wrapper) |
| POST | `/api/v1/auth/register/faculty` | Public | Faculty registration (custom wrapper) |
| GET | `/api/auth/verify-email` | Public | Email verification (Better Auth) |
| POST | `/api/auth/send-verification-email` | Public | Resend verification email (Better Auth, rate limited) |
| POST | `/api/auth/sign-in/email` | Public | Login (Better Auth) |
| POST | `/api/auth/sign-out` | Session | Logout (Better Auth) |
| GET | `/api/auth/get-session` | Session | Current session (Better Auth) |
| POST | `/api/auth/request-password-reset` | Public | Request password reset (Better Auth; confirm route name in Phase 4b) |
| POST | `/api/auth/reset-password` | Public | Apply new password (Better Auth) |
| POST | `/api/auth/change-password` | Session | Change password (Better Auth) |

> Removed in V1.2: `POST /auth/refresh` (there are no refresh tokens) and `POST /users/me/change-password`. Better Auth route names above are the documented defaults; verify them against the installed version.

### Users

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| GET | `/users/me` | Session | View own profile |
| PATCH | `/users/me` | Session | Update own profile |
| PATCH | `/users/me/avatar` | Session | Upload avatar |
| GET | `/users/me/sessions` | Session | Count of other signed-in devices (FR-AUTH-005.4, DECISIONS D30) |
| GET | `/admin/users` | super_admin | List all users |
| GET | `/admin/users/:id` | super_admin | User detail |
| PATCH | `/admin/users/:id/status` | super_admin | Suspend / activate |
| POST | `/admin/users/:id/recompute-role` | super_admin | Recompute effective role (repair) |
| PATCH | `/admin/users/:id` | super_admin | Correct a user's details (assisting) |

### Clubs

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| GET | `/clubs` | Session | List all clubs |
| GET | `/clubs/my-club` | Session | Own dept's club |
| GET | `/clubs/:id` | Session | Club detail |
| PATCH | `/clubs/:id` | dept_admin, super_admin | Edit club |
| PATCH | `/clubs/:id/logo` | dept_admin, super_admin | Upload club logo |

### Memberships

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| POST | `/memberships` | user_type student | Purchase membership |
| GET | `/memberships/my` | user_type student | My memberships |
| POST | `/memberships/:id/renew` | user_type student | Renew membership |
| PATCH | `/memberships/:id/cancel` | owner, dept_admin, super_admin | Cancel membership |
| POST | `/memberships/payment/ipn` | SSLCommerz (validated via Order Validation API) | Payment IPN callback |
| GET | `/admin/memberships` | dept_admin, super_admin | All dept memberships |

### Committee

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| GET | `/clubs/:id/committee` | Session | View committee |
| POST | `/clubs/:id/committee` | dept_admin, super_admin | Assign member |
| PATCH | `/clubs/:id/committee/:memberId` | dept_admin, super_admin | Edit member |
| PATCH | `/clubs/:id/committee/:memberId/end-term` | dept_admin, super_admin | End term |

### Dept Admin Terms

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| POST | `/admin/dept-admin-terms` | super_admin | Assign dept admin |
| GET | `/admin/dept-admin-terms` | super_admin | List all terms |
| PATCH | `/admin/dept-admin-terms/:id/end` | super_admin | End term |
| POST | `/admin/dept-admin-terms/:id/renew` | super_admin | Renew term |

### Events

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| POST | `/events` | moderator, dept_admin, super_admin | Create event |
| GET | `/events` | Session | Browse events |
| GET | `/events/:id` | Session | Event detail |
| PATCH | `/events/:id` | moderator, dept_admin, super_admin | Edit event |
| PATCH | `/events/:id/poster` | moderator, dept_admin, super_admin | Upload poster |
| PATCH | `/events/:id/publish` | moderator, dept_admin, super_admin | Publish event |
| PATCH | `/events/:id/cancel` | moderator, dept_admin, super_admin | Cancel event |
| PATCH | `/events/:id/complete` | moderator, dept_admin, super_admin | Mark completed |
| POST | `/events/:id/register` | Session (not super_admin) | Register |
| DELETE | `/events/:id/register` | Session (not super_admin) | Cancel registration |
| GET | `/events/my-registrations` | Session | My registrations |
| GET | `/events/:id/registrations` | moderator, dept_admin, super_admin | All registrations |
| PATCH | `/events/:id/registrations/:regId/check-in` | moderator, dept_admin, super_admin | Check-in |

### Announcements

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| POST | `/announcements` | moderator, dept_admin, super_admin | Create |
| GET | `/announcements` | Session | View relevant announcements |
| PATCH | `/announcements/:id` | author / dept_admin / super_admin | Edit |
| DELETE | `/announcements/:id` | author / dept_admin / super_admin | Delete |
| PATCH | `/announcements/:id/pin` | dept_admin, super_admin | Pin / unpin |

### Blood

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| POST | `/blood/donations` | Session (not super_admin) | Add donation record |
| GET | `/blood/donations/my` | Session (not super_admin) | My donation history |
| PATCH | `/blood/donations/:id/verify` | dept_admin, super_admin | Verify donation |
| GET | `/blood/donors` | Session | Donor list |
| POST | `/blood/requests` | Session | Create request |
| GET | `/blood/requests` | Session | View requests |
| PATCH | `/blood/requests/:id/fulfill` | Session | Fulfill request |
| PATCH | `/blood/requests/:id/cancel` | requester / dept_admin / super_admin | Cancel request |
| GET | `/admin/blood/donations/unverified` | dept_admin, super_admin | Unverified donations |

### AI

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| POST | `/chatbot/ask` | Session | Ask chatbot |
| POST | `/ai/generate-event-description` | moderator, dept_admin, super_admin | AI event description |
| GET | `/admin/chatbot/logs` | super_admin | Chat log analytics |

### Dashboards & Audit

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| GET | `/dashboard/student` | student | Student dashboard |
| GET | `/dashboard/moderator` | moderator | Moderator dashboard |
| GET | `/dashboard/dept-admin` | dept_admin | Dept admin dashboard |
| GET | `/dashboard/super-admin` | super_admin | Super admin dashboard |
| GET | `/admin/audit-logs` | super_admin | View audit logs |

---

## 19. Business Rules & Constraints

### Registration & Accounts

- Email verification is required for all users before login is permitted (`email_verified`, enforced by Better Auth).
- No email domain restriction — any valid email is accepted.
- `blood_group` is mandatory at registration for both students and faculty (not required for the seeded `super_admin`).
- Academic fields (`academic_session`, `current_year`, `current_semester`, `student_id`) are mandatory for students and forbidden for everyone else (enforced by a database CHECK). `(department_id, student_id)` is unique.
- `department_id` cannot be changed after registration (except by super_admin).
- `is_active` means "not suspended" and defaults to `true`. An unverified account is blocked by `email_verified = false`, not by `is_active`.
- `user_type` is immutable. `role` is derived and never edited directly.
- Clients can never set `user_type`, `role` or `is_active`; registration schemas are `.strict()` and the Better Auth fields are `input: false`.
- Passwords are hashed by Better Auth (scrypt by default) and stored in `Account.password`. Passwords, hashes and tokens never appear in API responses, logs or audit values.

### Sessions

- Authentication uses Better Auth database sessions in an `httpOnly` cookie. There is no JWT and no refresh token.
- Session lifetime is 7 days, sliding. Password reset and account suspension revoke the user's sessions.
- The session cookie cache is disabled in V1 so role and `is_active` changes apply on the next request.

### Membership & Payments

- Only users with `user_type = 'student'` can purchase club memberships (moderators who are students included).
- In V1 a student may join only their own department's club.
- A student can have only one `active` membership per club at a time (partial unique index).
- A membership is `pending` until the SSLCommerz Order Validation API confirms payment, then `active`. A `pending` membership grants no access.
- Renewal creates a new `ClubMembership` row; it does not overwrite the existing one.
- If SSLCommerz payment fails or validation does not match, no active membership is granted.
- The IPN handler is idempotent (`WHERE payment_status = 'pending'`).
- Membership cancellation does not trigger a refund (V1).
- Money uses `DECIMAL(10,2)` BDT; never floating point.

### Events

- `members_only` events: user must have an active membership in a club whose `department_id` is listed in `EventDepartment` AND the user's own `department_id` must be in that list. Browse visibility uses the same rule.
- `max_attendees` hard cap: new registrations blocked when limit reached; enforced inside a transaction. No waitlist in V1.
- Event dates cannot be changed after `status = 'published'`.
- Paid events (`is_paid = true`) exist in the schema but payment for events is not processed in V1 (focus is on membership payments). The `is_paid` flag and `fee_amount` are stored for future use.
- A user cannot register for the same event twice (`UNIQUE (user_id, event_id)`); re-registering after a cancel reuses the same row.
- Registration cancellation is only allowed before `Event.start_date`.

### Role Transitions

- Role is **derived** by `RoleService.recompute` from `user_type` and active terms:
  - `super_admin` if `user_type = super_admin`;
  - else `dept_admin` if the user has a current `DepartmentAdminTerm`;
  - else `moderator` if the user has a current `ClubCommitteeMember` row;
  - else `user_type` (`student` or `faculty`).
- A student or faculty member assigned as `ClubCommitteeMember` with `is_current = true` becomes `moderator`.
- A faculty member (`user_type = faculty`, same department) assigned via `DepartmentAdminTerm` with `is_current = true` becomes `dept_admin`.
- A higher authority is never downgraded by a lower one (a `dept_admin` given a committee seat stays `dept_admin`).
- The role falls back only when **no** other active term remains.
- Every recompute runs inside the same transaction as the term change and writes a `ROLE_CHANGED` audit row.
- **There is no direct role override.** `POST /admin/users/:id/recompute-role` repairs a user whose role is out of sync.
- A department has at most one current admin; a user has at most one current admin term (partial unique indexes).

### Blood Donation

- Users can submit multiple donation records; each is unverified by default.
- `User.last_donation_date` is only updated based on **verified** donations, by `BloodService.verify` inside a transaction (no database trigger).
- Fulfilling a `BloodRequest` does NOT auto-create a `BloodDonation` record — the donor must add it separately.
- `dept_admin` can only verify donations from users in their own department and cannot verify their own.
- Blood requests with `required_by_date < today` are automatically expired by the daily job.

### Audit & Security

- All role changes, event cancellations, term assignments, payments and user suspensions must be logged in the same transaction as the change.
- Rate limiting: 100 req/min per IP globally; 10/min for chatbot per user; 3/hour for password reset per email; 1 per 5 min per email for verification resend; stricter limits on auth and payment routes.
- SSLCommerz IPN callbacks must be confirmed with the Order Validation API (amount, currency, `tran_id` match) before processing; the IPN body itself is never trusted.
- Database triggers are not used. Database-level guarantees are limited to CHECK constraints and partial unique indexes added through reviewed migration SQL.
- Tenant isolation: every tenant-scoped query filters by `department_id` unless the caller is `super_admin`.

---

## 20. Feature-to-Table Cross Reference

| Feature | Tables Involved |
|---------|----------------|
| Student registration | `User`, `Account`, `Verification`, `Department`, `AuditLog` |
| Faculty registration | `User`, `Account`, `Verification`, `Department`, `AuditLog` |
| Email verification | `User` (email_verified), `Verification` |
| Login / session | `User`, `Account`, `Session`, `AuditLog` |
| Password reset / change | `Account`, `Verification`, `Session`, `AuditLog` |
| Profile update + avatar | `User` |
| Purchase membership | `ClubMembership`, `PaymentTransaction`, `User`, `Club`, `AuditLog` |
| Renew / cancel membership | `ClubMembership`, `PaymentTransaction` |
| Payment IPN / reconciliation | `PaymentTransaction`, `ClubMembership`, `AuditLog` |
| Browse events | `Event`, `EventDepartment`, `Department`, `Club`, `ClubMembership` (members-only visibility) |
| Register for event | `EventRegistration`, `Event`, `User`, `ClubMembership` (eligibility) |
| Event check-in | `EventRegistration` |
| Create / edit event | `Event`, `EventDepartment`, `Club`, `User` |
| Upload event poster | `Event` |
| Cancel event | `Event`, `EventRegistration`, `AuditLog` |
| View announcements | `Announcement`, `Club`, `Department` |
| Post announcements | `Announcement`, `User` |
| Assign committee member | `ClubCommitteeMember`, `User` (role recompute), `AuditLog` |
| End committee term | `ClubCommitteeMember`, `User` (role recompute), `AuditLog` |
| Assign dept admin | `DepartmentAdminTerm`, `User` (role recompute), `AuditLog` |
| End / renew dept admin term | `DepartmentAdminTerm`, `User` (role recompute), `AuditLog` |
| Add blood donation | `BloodDonation`, `User` |
| Verify blood donation | `BloodDonation`, `User` (verified_by, last_donation_date), `AuditLog` |
| View donor list | `BloodDonation`, `User` |
| Create blood request | `BloodRequest`, `User` |
| Fulfill blood request | `BloodRequest`, `User` |
| AI chatbot | `Event`, `Club`, `Announcement` (RAG context), `ChatLog` |
| Audit log write | `AuditLog`, `User` |
| Audit log view | `AuditLog` |
| Student dashboard | `Event`, `EventDepartment`, `ClubMembership`, `Announcement`, `BloodRequest` |
| Moderator dashboard | `Event`, `EventRegistration`, `ClubMembership`, `ClubCommitteeMember` |
| Dept admin dashboard | `User`, `Event`, `BloodDonation`, `ClubMembership`, `DepartmentAdminTerm` |
| Super admin dashboard | All tables |

---

## 21. Non-Functional Requirements

### Performance

| Metric | Target |
|--------|--------|
| API response time (p95) | < 300ms for standard endpoints |
| Chatbot response time | < 3 seconds (includes Gemini API call) |
| Database query time | < 100ms for indexed queries |
| File upload time | < 5 seconds for images ≤ 5MB |
| Concurrent users (V1) | Support 500 concurrent users |

### Security

- HTTPS enforced in production (Let's Encrypt).
- Helmet.js for secure HTTP headers.
- CORS: only allow the frontend origin, with credentials.
- Session cookie: `httpOnly`, `Secure`, `SameSite=Lax`; first-party through the same-origin proxy or a shared parent domain.
- Rate limiting: per IP (global) and per user (chatbot, auth endpoints).
- Password hashing and sign-in rate limiting provided by Better Auth, plus `express-rate-limit` in front.
- Zod validation on all inputs (`.strict()` on mutation bodies) — no raw user input reaches the database.
- SQL injection protection via Prisma parameterized queries.
- SSLCommerz payments validated through the Order Validation API, idempotent processing.
- Multer limits (type, size) on every upload route.
- Sensitive fields (password hashes, `Verification` tokens, session tokens) never returned in API responses or written to logs.
- Cross-department access (IDOR) is tested for every tenant-scoped route.

### Availability

- Target uptime: 99.5% (Railway / Render managed hosting).
- Database backups: daily (Neon automatic backups). A restore drill is part of the final phase.
- Redis persistence: AOF enabled for queue durability.

### Scalability

- API is stateless: sessions live in PostgreSQL, so the API scales horizontally. The BullMQ worker is a separate process.
- BullMQ for async jobs — decoupled from request cycle.
- Redis caching for chatbot responses — reduces Gemini API calls.
- Pagination on all list endpoints — prevents large payload responses.

### Maintainability

- Full TypeScript throughout — type-safe end-to-end.
- pnpm monorepo: Zod schemas shared between frontend and backend via `packages/shared` (`@uniconnect/shared`).
- Winston structured logging — all requests and errors logged with a request id.
- Swagger auto-generated docs — always up-to-date with routes.
- Prisma migrations — version-controlled schema changes; hand-written SQL objects are listed in `docs/DECISIONS.md`.
- Jest + Supertest coverage target: 70%+ for service and controller layers, plus an RBAC matrix test (every role × every endpoint).

---

## 22. Email & Notification System

**Stack:** Nodemailer + BullMQ (Redis-backed job queue)

| Trigger | Recipient | Template |
|---------|---------|---------|
| User registered | User | "Verify your UniConnect email" (link valid 24 hours) |
| Password reset requested | User | "Reset your UniConnect password" (link valid 1 hour) |
| Membership activated | User | "Membership confirmation + expiry date" |
| Event registration | User | "You're registered for {event_title}" |
| Event cancelled | All registrants | "Event {title} has been cancelled" |
| Event reminder | All registrants | "Reminder: {event_title} is tomorrow" |
| Blood request created | Users with matching blood group (opt-in, V2) | "Urgent blood request: {blood_group} needed" |
| Blood request fulfilled | Requester | "Your blood request has been fulfilled" |
| Dept admin term assigned | Faculty user | "You've been assigned as Dept Admin" |

**Email Queue Pattern (BullMQ):**

```typescript
// Producer (in service, or in Better Auth's sendVerificationEmail / sendResetPassword callbacks)
await emailQueue.add('send-email', {
  to: user.email,
  subject: 'Verify your email',
  templateId: 'email-verification',
  data: { name: user.name, url: verificationUrl }   // url supplied by Better Auth
});

// Worker (separate process; processes in background)
const emailWorker = new Worker('email', async (job) => {
  await transporter.sendMail(buildTemplate(job.data));
}, { connection });   // ioredis connection with maxRetriesPerRequest: null
```

> The queue and worker API shown is illustrative; confirm current BullMQ names with the library documentation when implementing. Never put tokens in job logs.

---

## 23. Error Handling Standards

**Global Error Handler** (Express middleware):

```typescript
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errors: err.errors || null // Zod validation errors
  });
});
```

**Standard Error Response:**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

**HTTP Status Code Convention:**

| Code | Use Case |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Validation error / bad request |
| 401 | Unauthenticated |
| 403 | Authenticated but unauthorized |
| 404 | Resource not found |
| 409 | Conflict (duplicate email, active membership, current term exists) |
| 422 | Unprocessable entity |
| 429 | Too many requests (rate limit) |
| 500 | Internal server error |

> Better Auth routes under `/api/auth/*` return Better Auth's own error shape. The frontend maps both shapes in one Axios / auth-client error handler. Error messages never reveal whether an email exists on password-reset requests.

---

## 24. Out of Scope (V1)

The following features are acknowledged but explicitly deferred to V2:

| Feature | Notes |
|---------|-------|
| Event payment processing | `is_paid` and `fee_amount` fields exist in DB; SSLCommerz integration deferred |
| Waitlist for full events | `max_attendees` enforced; no waitlist logic |
| In-app notifications (bell icon) | Dashboard shows data; push/in-app notifications are V2 |
| Email domain restriction | V1 accepts any email |
| Last 3 passwords policy | Password history check deferred to V2 |
| Blood request email notifications to matching donors | Opt-in system and group email deferred to V2 |
| pgvector for chatbot | V1 uses PostgreSQL full-text search; vector embeddings are V2 |
| EventFeedback / sentiment analysis | Schema placeholder only; feature is V2 |
| Settings table | Config managed via environment variables in V1 |
| Multiple clubs per department | `Club.department_id` is UNIQUE in V1 |
| Joining another department's club | V1: students join only their own department's club |
| Soft delete | No soft delete in V1; clubs are not deletable, events are cancelled |
| Refunds | No refund flow for memberships |
| Social login, MFA | Better Auth supports them; not enabled in V1 |
| Redis session store | Sessions are stored in PostgreSQL in V1 |
| Bangla UI | English only in V1 |
| CI/CD pipeline | GitHub Actions setup recommended but not required for V1 launch |

> Removed from this table in V1.2 because they are now **in scope**: verification-token expiry (24-hour expiry now in V1, handled by Better Auth).

---

## 25. Open Decisions

These defaults were applied in V1.2 so the documents are internally consistent. Each is **the author's recommendation, not a confirmed requirement**. Confirm or change them in Phase 0 and record the answers in `docs/DECISIONS.md`; update this PRD and the schema if an answer differs.

| # | Decision | Default applied in V1.2 | Where it shows up |
|---|----------|--------------------------|-------------------|
| 1 | Canonical role names | Five roles in this PRD; "Club Executive" is a committee position; "Central Admin" unused | §1, §5 |
| 2 | Can a user hold several roles? | One effective role, derived (highest authority wins) | §5, §19, Schema §20 |
| 3 | Moderator scope | Own club only | §12, §13 |
| 4 | Faculty sign-up | Self-registration with email verification, no admin approval | FR-AUTH-002 |
| 5 | Student identity | No university email domain; `(department_id, student_id)` unique | FR-AUTH-001 |
| 6 | Cross-department clubs | A student may join only their own department's club | FR-MEM-001 |
| 7 | Cross-department events | Visibility and registration by `EventDepartment` rule | FR-EVENT-006/007 |
| 8 | Membership pricing and refunds | Per club, monthly or yearly; no refund | FR-MEM |
| 9 | SSLCommerz merchant | One merchant account for the university | FR-MEM-001 |
| 10 | Committee terms | Role recomputed on end; one current position per user per club | FR-COMM |
| 11 | Dept admin terms | One current admin per department; super admin appoints | FR-ADMIN |
| 12 | Soft delete | None in V1 | Schema Conventions |
| 13 | Audit retention | Append-only, kept indefinitely; no retention job | FR-AUDIT |
| 14 | Blood privacy | Phone shown to authenticated users; no email; eligibility interval and donor consent **undecided** | FR-BLOOD-004 |
| 15 | Blood request creators | Any authenticated user; no notification to donors in V1 | FR-BLOOD-005 |
| 16 | Event capacity | Hard cap, no waitlist, manual check-in; paid events out of scope | FR-EVENT |
| 17 | Announcement audience | Department and club scope; no scheduling or digest | FR-ANNOUNCE |
| 18 | Chatbot content and retention | Events, announcements, clubs the user may see; ChatLog 90 days | FR-AI |
| 19 | Session policy | 7-day sliding session; no remember-me toggle | FR-AUTH-005 |
| 20 | Email verification | Link valid 24 hours; resend 1 per 5 minutes; provider chosen at deployment | FR-AUTH-003 |
| 21 | Uploads | JPEG, PNG, WebP, max 5MB; avatars, club logos, event posters; no moderation | FR-USER-003 |
| 22 | Locale | `Asia/Dhaka` time zone, English | §21 |
| 23 | Domains and cookies | Same-origin `/api/*` proxy through Next.js | §4 |
| 24 | Non-functional targets | 500 concurrent users, 99.5% uptime, Neon daily backups | §21 |
| 25 | MVP scope if time runs short | First to defer: AI chatbot, then dashboard analytics, then blood module | Build order |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-15 | Initial PRD — 14 tables, 5 roles, all modules documented with full endpoint reference, business rules, and non-functional requirements |
| 1.2 | 2026-11-07 | Synced with Schema 1.2 (18 tables). Better Auth sessions replace custom JWT and refresh tokens; derived roles (`user_type`); triggers removed in favour of service-layer transactions; partial unique indexes; `pending` membership and SSLCommerz Order Validation; `ChatLog` decided; stack upgrades; consistency fixes in the capability matrix and visibility rules; scheduled-jobs table; open decisions list |
