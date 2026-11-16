# UniConnect – Database Schema V1 (PostgreSQL)

**Version:** 1.2 (synced with PRD 1.2)
**Date:** 2026-11-07 (Updated)
**Database:** PostgreSQL 15+ (Neon)
**ORM:** Prisma (current major, see PRD §3)
**Tables:** 18 — 14 domain tables + `ChatLog` + 3 Better Auth tables (`Session`, `Account`, `Verification`)

---

## Changelog (V1.1 → V1.2)

| Change | Reason |
|--------|---------|
| Authentication moved to **Better Auth sessions only**. Removed `password_hash` and `verification_token` from `User`. Added Better Auth tables `Session`, `Account`, `Verification` (Tables 15–17). | The PRD no longer uses a custom JWT + Redis refresh token. Better Auth stores password hashes in `Account.password` and verification/reset tokens in `Verification`. |
| `User.id` is now **UUID**; every `user_id`-style foreign key is UUID. Domain tables keep `SERIAL` integer keys. | Better Auth issues string ids; UUIDs avoid id enumeration on user-facing URLs. |
| Added `User.user_type` (`student` / `faculty` / `super_admin`), immutable after creation. | `role` is now an **effective** role derived from active terms. `user_type` is the base the role falls back to when a term ends. Fixes the "revert to previous role" bug for users holding two roles. |
| `User.is_active` now means **not suspended** (default `TRUE`). Email verification is tracked only by `email_verified`. | Login is gated by `email_verified` (Better Auth) plus `is_active` (suspension). |
| `User.department_id` and `User.blood_group` are nullable **only for `super_admin`** (CHECK). | The seeded platform owner is not a member of a department. |
| Added CHECK that academic fields are present for students and absent for everyone else. Added `UNIQUE (department_id, student_id)`. | Enforces PRD business rule at the database level. |
| **Removed all three PostgreSQL triggers** (role sync ×2, `last_donation_date`). Replaced by service-layer logic inside one `prisma.$transaction`. | Prisma cannot model triggers; they are invisible to the client, hard to test, and caused the role-revert bug. See Section 17. |
| `DepartmentAdminTerm`: replaced `UNIQUE (user_id, department_id, is_current)` with **partial unique indexes**. | The old constraint failed as soon as one user had two ended terms (both rows `is_current = false`). |
| `ClubCommitteeMember`: added partial unique index (one current row per user per club) and year CHECK. | Prevents duplicate active positions. |
| `ClubMembership`: added `pending` status and partial unique index (one `active` row per user per club). | A membership must not be `active` before payment is validated. |
| `PaymentTransaction`: added `val_id`, `bank_tran_id`, `validated_at`, `updated_at`. | SSLCommerz IPN is not signed; the Order Validation API (`val_id`) is the trust source. |
| Added `ChatLog` (Table 14) with 90-day retention. | Promoted from "optional" to a decided table. |
| `AuditLog.user_id` is nullable. | System actions (cron jobs, payment IPN) have no human actor. |
| Added Section 18 (Indexes) and database CHECK constraints on every table. | Performance and integrity. |
| Added physical naming convention (snake_case, plural) and Prisma mapping rules. | `User` is a reserved word in PostgreSQL; consistent naming avoids quoting. |

### Changelog (V1.0 → V1.1) — retained

| Change | Reason |
|--------|---------|
| Added `email_verified` & `verification_token` to `User` | Email verification required for all users (no domain restriction) |
| Added `academic_session`, `current_year`, `current_semester`, `student_id` to `User` | Capture student academic details |
| Added `DepartmentAdminTerm` table | Track term-based assignment of faculty as Dept Admin |
| Added `verified_by` & `verified_at` to `BloodDonation` | Admin verification of blood donation records |
| Updated role management logic | Faculty → `dept_admin` for a term; reverts after term ends |

---

## Table of Contents

- [UniConnect – Database Schema V1 (PostgreSQL)](#uniconnect--database-schema-v1-postgresql)
  - [Changelog](#changelog-v11--v12)
  - [Conventions](#conventions)
  - [1. Department](#1-department)
  - [2. User](#2-user)
  - [3. Club](#3-club)
  - [4. ClubMembership](#4-clubmembership)
  - [5. PaymentTransaction](#5-paymenttransaction)
  - [6. ClubCommitteeMember](#6-clubcommitteemember)
  - [7. DepartmentAdminTerm](#7-departmentadminterm)
  - [8. Event](#8-event)
  - [9. EventDepartment](#9-eventdepartment)
  - [10. EventRegistration](#10-eventregistration)
  - [11. Announcement](#11-announcement)
  - [12. BloodDonation](#12-blooddonation)
  - [13. BloodRequest](#13-bloodrequest)
  - [14. ChatLog](#14-chatlog)
  - [15. Session (Better Auth)](#15-session-better-auth)
  - [16. Account (Better Auth)](#16-account-better-auth)
  - [17. Verification (Better Auth)](#17-verification-better-auth)
  - [18. AuditLog](#18-auditlog)
  - [19. Table Relationships](#19-table-relationships)
  - [20. Role Management Logic](#20-role-management-logic)
  - [21. Service-Layer Logic Replacing Triggers](#21-service-layer-logic-replacing-triggers)
  - [22. Hand-Written Migration SQL (constraints and indexes Prisma cannot declare)](#22-hand-written-migration-sql)
  - [23. Index Plan](#23-index-plan)
  - [24. ER Diagram (Mermaid)](#24-er-diagram-mermaid)
  - [Version History](#version-history)

> **Numbering note:** tables are numbered 1–18 in the order below. `AuditLog` is table 18 (it was 14 in V1.1). The "Tables" count in the header is 18.

---

## Conventions

| Topic | Rule |
|-------|------|
| Source of truth | `backend/prisma/schema.prisma`. The SQL in this file is **reference DDL** plus the exact hand-written objects Prisma cannot declare (Section 22). If they disagree, fix `schema.prisma` and this file together. |
| Prisma model names | PascalCase, singular (`ClubMembership`). |
| Physical table names | snake_case, plural, set with `@@map` (`club_memberships`). The user table is `users` because `user` is reserved in PostgreSQL. |
| Column names | snake_case in the database; camelCase in Prisma with `@map`. |
| Primary keys | `User`, `Session`, `Account`, `Verification`: `UUID` (`@db.Uuid`, default `gen_random_uuid()`). All other tables: `SERIAL` integer. |
| Foreign keys to users | `UUID`. |
| Money | `DECIMAL(10,2)` in BDT. Never `float`. In code use Prisma `Decimal`, transport as string. |
| Timestamps | `TIMESTAMP` stored in UTC; displayed in `Asia/Dhaka`. Every mutable table has `created_at` and `updated_at` (Prisma `@updatedAt`). |
| Enums | Stored as `VARCHAR` with CHECK constraints (PRD roles, statuses). Prisma models them as `String @db.VarChar(n)`, not native `enum`. The CHECKs live in the `db_invariants` migration and the value sets in `@uniconnect/shared` constants, validated with its Zod enums. |
| Deletes | No soft delete in V1. Clubs are not deletable. Events are cancelled, not deleted. Rows are never hard-deleted by the application except `EventDepartment` (cascade from `Event`) and `Session` (cascade from `User`). |
| Better Auth tables | Written in `schema.prisma` with Better Auth's field names. Check them against `npx auth@latest generate` output (it writes to `schema.prisma`, so review it as a diff) and keep them in sync with the Better Auth config. Rename columns with `@map`, never the Prisma field names. |

---

## 1. Department

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `name` | VARCHAR(50) | UNIQUE, NOT NULL | Department name |
| `description` | TEXT | | Optional description |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |

```sql
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Relationships:**
- One `Department` → Many `User` (students/faculty)
- One `Department` → One `Club` (one club per dept, initially)
- One `Department` → Many `DepartmentAdminTerm`
- One `Department` → Many `EventDepartment`
- One `Department` → Many `Announcement` (nullable)

---

## 2. User

> **Better Auth core table, extended with additional fields.** Better Auth owns `id`, `name`, `email`, `email_verified`, the avatar field (mapped to `avatar_url`), `created_at`, `updated_at`. All other columns are Better Auth `additionalFields`. Fields that clients must never set (`user_type`, `role`, `is_active`, `last_donation_date`) are declared with `input: false`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Any domain allowed. Stored lowercase. |
| `name` | VARCHAR(100) | NOT NULL | Full name |
| `email_verified` | BOOLEAN | NOT NULL, DEFAULT FALSE | Set by Better Auth when the verification link is used. Login is blocked until `TRUE`. |
| `user_type` | VARCHAR(12) | CHECK IN ('student','faculty','super_admin'), NOT NULL | ⭐ Immutable registration type. The base the effective `role` falls back to. |
| `role` | VARCHAR(20) | DEFAULT 'student' CHECK IN ('student','faculty','moderator','dept_admin','super_admin'), NOT NULL | Effective role, **derived** by `RoleService.recompute` (Section 20). Never edited directly. |
| `department_id` | INT | FK → departments(id) | Home department. NOT NULL unless `user_type = 'super_admin'`. |
| `blood_group` | VARCHAR(3) | CHECK IN ('A+','A-','B+','B-','AB+','AB-','O+','O-') | NOT NULL unless `user_type = 'super_admin'`. |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT TRUE | ⭐ `FALSE` = suspended by an admin. Not related to email verification. |
| `academic_session` | VARCHAR(20) | | e.g. "2022-2023". Students only. |
| `current_year` | INT | CHECK BETWEEN 1 AND 4 | Students only. |
| `current_semester` | INT | CHECK BETWEEN 1 AND 2 | Students only. |
| `student_id` | VARCHAR(50) | | University roll/ID number. Students only. |
| `avatar_url` | VARCHAR(500) | | Profile picture URL (Better Auth `image` field mapped to this column) |
| `last_donation_date` | DATE | | Denormalized from verified `BloodDonation` rows, written by `BloodService.verify` |
| `phone` | VARCHAR(20) | | Contact number |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| CHECK | `user_type = 'super_admin' OR department_id IS NOT NULL` | | |
| CHECK | `user_type = 'super_admin' OR blood_group IS NOT NULL` | | |
| CHECK | student-only academic fields (see SQL) | | Required for students, `NULL` otherwise |
| CHECK | `role <> 'super_admin' OR user_type = 'super_admin'` and `role <> 'dept_admin' OR user_type = 'faculty'` | | Only faculty can be `dept_admin`; only the seeded owner is `super_admin` |

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    user_type VARCHAR(12) NOT NULL CHECK (user_type IN ('student','faculty','super_admin')),
    role VARCHAR(20) NOT NULL DEFAULT 'student'
        CHECK (role IN ('student','faculty','moderator','dept_admin','super_admin')),
    department_id INT REFERENCES departments(id),
    blood_group VARCHAR(3) CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    academic_session VARCHAR(20),
    current_year INT CHECK (current_year BETWEEN 1 AND 4),
    current_semester INT CHECK (current_semester BETWEEN 1 AND 2),
    student_id VARCHAR(50),
    avatar_url VARCHAR(500),
    last_donation_date DATE,
    phone VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT users_dept_required CHECK (user_type = 'super_admin' OR department_id IS NOT NULL),
    CONSTRAINT users_blood_required CHECK (user_type = 'super_admin' OR blood_group IS NOT NULL),
    CONSTRAINT users_academic_fields CHECK (
        (user_type = 'student'
            AND academic_session IS NOT NULL AND current_year IS NOT NULL
            AND current_semester IS NOT NULL AND student_id IS NOT NULL)
        OR
        (user_type <> 'student'
            AND academic_session IS NULL AND current_year IS NULL
            AND current_semester IS NULL AND student_id IS NULL)
    ),
    CONSTRAINT users_role_vs_type CHECK (
        (role <> 'super_admin' OR user_type = 'super_admin')
        AND (role <> 'dept_admin' OR user_type = 'faculty')
    )
);
-- Partial unique index (hand-written, Section 22):
-- CREATE UNIQUE INDEX users_student_id_per_dept ON users (department_id, student_id) WHERE student_id IS NOT NULL;
```

**Relationships:**
- Belongs to one `Department` (nullable only for `super_admin`)
- One `User` → Many `Session`, `Account` (Better Auth)
- One `User` → Many `ClubMembership`
- One `User` → Many `ClubCommitteeMember` (positions over time)
- One `User` → Many `DepartmentAdminTerm` (faculty only)
- One `User` → Many `EventRegistration`
- One `User` → Many `BloodDonation` (as donor)
- One `User` → Many `BloodDonation` (as verifier, via `verified_by`)
- One `User` → Many `BloodRequest` (as requester)
- One `User` → Many `BloodRequest` (as fulfiller, nullable)
- One `User` → Many `Announcement` (as author)
- One `User` → Many `AuditLog` (as actor, nullable)
- One `User` → Many `ChatLog`

---

## 3. Club

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `name` | VARCHAR(100) | NOT NULL | Club name |
| `department_id` | INT | FK → departments(id), UNIQUE, NOT NULL | One club per dept |
| `description` | TEXT | | |
| `logo_url` | VARCHAR(500) | | Club logo |
| `membership_fee_monthly` | DECIMAL(10,2) | CHECK >= 0 | Monthly fee in BDT |
| `membership_fee_yearly` | DECIMAL(10,2) | CHECK >= 0 | Yearly fee in BDT |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | |

```sql
CREATE TABLE clubs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    department_id INT UNIQUE NOT NULL REFERENCES departments(id),
    description TEXT,
    logo_url VARCHAR(500),
    membership_fee_monthly DECIMAL(10,2) CHECK (membership_fee_monthly >= 0),
    membership_fee_yearly DECIMAL(10,2) CHECK (membership_fee_yearly >= 0),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Relationships:**
- Belongs to one `Department` (unique — one club per dept)
- One `Club` → Many `ClubMembership`
- One `Club` → Many `ClubCommitteeMember`
- One `Club` → Many `Event`
- One `Club` → Many `Announcement` (nullable)

---

## 4. ClubMembership

> **Updated in V1.2:** new `pending` status. A row is created as `pending` when payment starts and becomes `active` only after the SSLCommerz Order Validation API confirms the payment.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | UUID | FK → users(id), NOT NULL | |
| `club_id` | INT | FK → clubs(id), NOT NULL | |
| `type` | VARCHAR(10) | CHECK IN ('monthly','yearly'), NOT NULL | Membership plan |
| `start_date` | DATE | NOT NULL | Recomputed on activation |
| `end_date` | DATE | NOT NULL, CHECK > start_date | |
| `status` | VARCHAR(10) | NOT NULL, DEFAULT 'pending' CHECK IN ('pending','scheduled','active','expired','cancelled') | `pending` = checkout not paid; `scheduled` = paid renewal waiting for the previous membership to end (ADR 0001) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | |
| UNIQUE (partial) | `(user_id, club_id) WHERE status = 'active'` | | One active membership per user per club |
| UNIQUE (partial) | `(user_id, club_id) WHERE status IN ('pending','scheduled')` | | One open checkout or queued renewal per user per club (ADR 0001) |

```sql
CREATE TABLE club_memberships (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    club_id INT NOT NULL REFERENCES clubs(id),
    type VARCHAR(10) NOT NULL CHECK (type IN ('monthly','yearly')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','scheduled','active','expired','cancelled')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT membership_dates_valid CHECK (end_date > start_date)
);
-- CREATE UNIQUE INDEX one_active_membership_per_user_club
--   ON club_memberships (user_id, club_id) WHERE status = 'active';
-- CREATE UNIQUE INDEX one_open_membership_per_user_club
--   ON club_memberships (user_id, club_id) WHERE status IN ('pending','scheduled');
```

**Relationships:**
- Belongs to one `User`
- Belongs to one `Club`
- One `ClubMembership` → Many `PaymentTransaction` (retries and renewals)

---

## 5. PaymentTransaction

> Payment gateway: **SSLCommerz** (currency: BDT). **IPN messages are not signed.** A payment is trusted only after the Order Validation API (called with `val_id`) returns `VALID` or `VALIDATED` and `tran_id`, amount and currency match this row.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | UUID | FK → users(id), NOT NULL | Payer |
| `club_membership_id` | INT | FK → club_memberships(id), NOT NULL | Linked membership |
| `amount` | DECIMAL(10,2) | NOT NULL, CHECK > 0 | Amount charged |
| `currency` | VARCHAR(3) | NOT NULL, DEFAULT 'BDT' | |
| `transaction_id` | VARCHAR(100) | UNIQUE, NOT NULL | Our `tran_id` sent to SSLCommerz |
| `payment_status` | VARCHAR(20) | NOT NULL, DEFAULT 'pending' CHECK IN ('pending','completed','failed','refunded') | |
| `payment_method` | VARCHAR(50) | | Card, bKash, Nagad, etc. (from validation response) |
| `val_id` | VARCHAR(100) | | ⭐ SSLCommerz validation id from the IPN |
| `bank_tran_id` | VARCHAR(100) | | ⭐ Bank transaction id from the validation response |
| `validated_at` | TIMESTAMP | | ⭐ Set when the Validation API confirmed the payment |
| `payment_gateway_response` | JSONB | | Full validation response |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | ⭐ |

```sql
CREATE TABLE payment_transactions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    club_membership_id INT NOT NULL REFERENCES club_memberships(id),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'BDT',
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending','completed','failed','refunded')),
    payment_method VARCHAR(50),
    val_id VARCHAR(100),
    bank_tran_id VARCHAR(100),
    validated_at TIMESTAMP,
    payment_gateway_response JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Relationships:**
- Belongs to one `User`
- Belongs to one `ClubMembership`

**Idempotency rule:** the IPN handler updates `WHERE transaction_id = $1 AND payment_status = 'pending'` inside the same transaction that activates the membership and writes the audit entry. A second IPN for the same `tran_id` updates zero rows and is acknowledged without side effects.

---

## 6. ClubCommitteeMember

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | UUID | FK → users(id), NOT NULL | Committee member |
| `club_id` | INT | FK → clubs(id), NOT NULL | |
| `position` | VARCHAR(50) | NOT NULL | e.g. President, Secretary. "Club Executive" is a position, not a role. |
| `term_start_year` | INT | NOT NULL | e.g. 2024 |
| `term_end_year` | INT | NOT NULL, CHECK >= term_start_year | e.g. 2025 |
| `is_current` | BOOLEAN | NOT NULL, DEFAULT TRUE | Active in this role? |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | |
| UNIQUE (partial) | `(user_id, club_id) WHERE is_current = true` | | One current position per user per club |

```sql
CREATE TABLE club_committee_members (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    club_id INT NOT NULL REFERENCES clubs(id),
    position VARCHAR(50) NOT NULL,
    term_start_year INT NOT NULL,
    term_end_year INT NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT committee_years_valid CHECK (term_end_year >= term_start_year)
);
-- CREATE UNIQUE INDEX one_current_position_per_user_club
--   ON club_committee_members (user_id, club_id) WHERE is_current = true;
```

**Relationships:**
- Belongs to one `User`
- Belongs to one `Club`

> **Role logic (service layer, not a trigger):** after any insert or update of this table, `RoleService.recompute(userId, tx)` runs in the same transaction (Section 20).

---

## 7. DepartmentAdminTerm

> Tracks term-based assignment of faculty users as Department Admins. **Updated in V1.2:** the V1.1 constraint `UNIQUE (user_id, department_id, is_current)` is replaced by partial unique indexes, because two ended terms for the same user would both have `is_current = false` and collide.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | UUID | FK → users(id), NOT NULL | Faculty user (`user_type = 'faculty'`, `department_id` equal to this row's `department_id`) |
| `department_id` | INT | FK → departments(id), NOT NULL | Administered dept |
| `start_date` | DATE | NOT NULL | Term start |
| `end_date` | DATE | NOT NULL, CHECK >= start_date | Term end |
| `is_current` | BOOLEAN | NOT NULL, DEFAULT TRUE | Active term? |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | |
| UNIQUE (partial) | `(department_id) WHERE is_current = true` | | One current admin per department |
| UNIQUE (partial) | `(user_id) WHERE is_current = true` | | One current admin term per user |

```sql
CREATE TABLE department_admin_terms (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    department_id INT NOT NULL REFERENCES departments(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT admin_term_dates_valid CHECK (end_date >= start_date)
);
-- CREATE UNIQUE INDEX dept_admin_one_current_per_dept
--   ON department_admin_terms (department_id) WHERE is_current = true;
-- CREATE UNIQUE INDEX dept_admin_one_current_per_user
--   ON department_admin_terms (user_id) WHERE is_current = true;
```

**Relationships:**
- Belongs to one `User`
- Belongs to one `Department`

> **Role logic:** `DepartmentAdminService.startTerm / endTerm` call `RoleService.recompute` inside the same transaction. Renewal = end the old term and insert the new one in one transaction; the role never flickers. A daily BullMQ job expires terms whose `end_date < today` through the same service (Section 21).

---

## 8. Event

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `title` | VARCHAR(200) | NOT NULL | |
| `description` | TEXT | | |
| `organizer_club_id` | INT | FK → clubs(id), NOT NULL | Organizing club |
| `visibility` | VARCHAR(20) | NOT NULL, DEFAULT 'public' CHECK IN ('public','members_only') | |
| `is_paid` | BOOLEAN | DEFAULT FALSE | Ticketed event? (stored for V2; not processed in V1) |
| `fee_amount` | DECIMAL(10,2) | CHECK >= 0 | Required when `is_paid = true` |
| `start_date` | TIMESTAMP | NOT NULL | |
| `end_date` | TIMESTAMP | NOT NULL, CHECK > start_date | |
| `venue` | VARCHAR(200) | | |
| `max_attendees` | INT | CHECK > 0 | Capacity cap |
| `poster_image_url` | VARCHAR(500) | | |
| `status` | VARCHAR(20) | DEFAULT 'draft' CHECK IN ('draft','published','cancelled','completed') | |
| `created_by` | UUID | FK → users(id), NOT NULL | Creator (moderator/admin) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | |
| CHECK | `is_paid = false OR fee_amount IS NOT NULL` | | |

```sql
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    organizer_club_id INT NOT NULL REFERENCES clubs(id),
    visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','members_only')),
    is_paid BOOLEAN DEFAULT FALSE,
    fee_amount DECIMAL(10,2) CHECK (fee_amount >= 0),
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    venue VARCHAR(200),
    max_attendees INT CHECK (max_attendees > 0),
    poster_image_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled','completed')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT events_dates_valid CHECK (end_date > start_date),
    CONSTRAINT events_fee_when_paid CHECK (is_paid = FALSE OR fee_amount IS NOT NULL)
);
```

**Relationships:**
- Belongs to one `Club` (as organizer)
- Created by one `User`
- One `Event` → Many `EventDepartment` (cross-dept visibility)
- One `Event` → Many `EventRegistration`

---

## 9. EventDepartment

> Junction table — controls which departments can see/participate in a cross-club event. The organizer's own department is always included (enforced by `EventService.create`).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `event_id` | INT | FK → events(id) ON DELETE CASCADE, NOT NULL | |
| `department_id` | INT | FK → departments(id), NOT NULL | |
| PRIMARY KEY | (event_id, department_id) | | Composite PK |

```sql
CREATE TABLE event_departments (
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    department_id INT NOT NULL REFERENCES departments(id),
    PRIMARY KEY (event_id, department_id)
);
```

**Relationships:**
- Belongs to one `Event`
- Belongs to one `Department`

---

## 10. EventRegistration

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | UUID | FK → users(id), NOT NULL | Registrant |
| `event_id` | INT | FK → events(id), NOT NULL | |
| `status` | VARCHAR(20) | DEFAULT 'registered' CHECK IN ('registered','attended','cancelled','no_show') | |
| `checked_in_at` | TIMESTAMP | | Manual check-in time |
| `registered_at` | TIMESTAMP | DEFAULT NOW() | |
| `cancelled_at` | TIMESTAMP | | |
| `payment_status` | VARCHAR(20) | CHECK IN ('pending','completed','failed','refunded') | Reserved for V2 paid events |
| `payment_transaction_id` | VARCHAR(100) | | Reserved for V2 paid events |
| UNIQUE | (user_id, event_id) | | One registration per user per event |

```sql
CREATE TABLE event_registrations (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    event_id INT NOT NULL REFERENCES events(id),
    status VARCHAR(20) DEFAULT 'registered' CHECK (status IN ('registered','attended','cancelled','no_show')),
    checked_in_at TIMESTAMP,
    registered_at TIMESTAMP DEFAULT NOW(),
    cancelled_at TIMESTAMP,
    payment_status VARCHAR(20) CHECK (payment_status IN ('pending','completed','failed','refunded')),
    payment_transaction_id VARCHAR(100),
    UNIQUE (user_id, event_id)
);
```

**Relationships:**
- Belongs to one `User`
- Belongs to one `Event`

> **Re-registration after cancel:** because of `UNIQUE (user_id, event_id)`, a user who cancelled and registers again **reuses the same row** (`status` set back to `registered`, `cancelled_at` cleared). `max_attendees` is enforced by counting rows with `status IN ('registered','attended')` inside a transaction.

---

## 11. Announcement

> Must belong to either a `Club` OR a `Department` (or both). Cannot be orphaned (enforced by CHECK).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `club_id` | INT | FK → clubs(id), nullable | Club-scoped announcement |
| `department_id` | INT | FK → departments(id), nullable | Dept-scoped announcement |
| `title` | VARCHAR(200) | NOT NULL | |
| `content` | TEXT | NOT NULL | |
| `author_id` | UUID | FK → users(id), NOT NULL | |
| `is_pinned` | BOOLEAN | DEFAULT FALSE | Pinned to top? |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | |
| CHECK | `club_id IS NOT NULL OR department_id IS NOT NULL` | | At least one scope required |

```sql
CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    club_id INT REFERENCES clubs(id),
    department_id INT REFERENCES departments(id),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id),
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CHECK (club_id IS NOT NULL OR department_id IS NOT NULL)
);
```

**Relationships:**
- Optionally belongs to one `Club`
- Optionally belongs to one `Department`
- Authored by one `User`

---

## 12. BloodDonation

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | UUID | FK → users(id), NOT NULL | Donor |
| `blood_group` | VARCHAR(3) | CHECK IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'), NOT NULL | Copied from `User.blood_group` by the service |
| `donation_date` | DATE | NOT NULL | Not in the future (validated in the service) |
| `units` | INT | DEFAULT 1, CHECK BETWEEN 1 AND 4 | Units donated |
| `hospital_name` | VARCHAR(200) | | Where donated |
| `notes` | TEXT | | |
| `verified` | BOOLEAN | DEFAULT FALSE | Admin-verified? |
| `verified_by` | UUID | FK → users(id), nullable | Super/Dept Admin who verified |
| `verified_at` | TIMESTAMP | | Verification timestamp |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| CHECK | `(verified = false AND verified_by IS NULL AND verified_at IS NULL) OR (verified = true AND verified_by IS NOT NULL AND verified_at IS NOT NULL)` | | Verification fields move together |

```sql
CREATE TABLE blood_donations (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    blood_group VARCHAR(3) NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    donation_date DATE NOT NULL,
    units INT DEFAULT 1 CHECK (units BETWEEN 1 AND 4),
    hospital_name VARCHAR(200),
    notes TEXT,
    verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT donation_verification_consistent CHECK (
        (verified = FALSE AND verified_by IS NULL AND verified_at IS NULL)
        OR (verified = TRUE AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
    )
);
```

**Relationships:**
- `user_id` → one `User` (donor)
- `verified_by` → one `User` (admin/super_admin, nullable)

> **Logic (service layer, not a trigger):** `BloodService.verify` sets the three verification fields and then sets `User.last_donation_date` to the latest `donation_date` among that user's **verified** donations, all inside one transaction (Section 21).

---

## 13. BloodRequest

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `requester_id` | UUID | FK → users(id), NOT NULL | Who is requesting |
| `patient_name` | VARCHAR(100) | NOT NULL | Patient needing blood |
| `blood_group` | VARCHAR(3) | CHECK IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'), NOT NULL | |
| `units_needed` | INT | NOT NULL, CHECK > 0 | |
| `reason` | TEXT | | Medical reason |
| `contact_phone` | VARCHAR(20) | NOT NULL | |
| `hospital_name` | VARCHAR(200) | NOT NULL | |
| `required_by_date` | DATE | NOT NULL | Urgency deadline |
| `status` | VARCHAR(20) | DEFAULT 'pending' CHECK IN ('pending','fulfilled','cancelled','expired') | |
| `fulfilled_by` | UUID | FK → users(id), nullable | Donor who fulfilled |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `resolved_at` | TIMESTAMP | | When fulfilled/cancelled/expired |

```sql
CREATE TABLE blood_requests (
    id SERIAL PRIMARY KEY,
    requester_id UUID NOT NULL REFERENCES users(id),
    patient_name VARCHAR(100) NOT NULL,
    blood_group VARCHAR(3) NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    units_needed INT NOT NULL CHECK (units_needed > 0),
    reason TEXT,
    contact_phone VARCHAR(20) NOT NULL,
    hospital_name VARCHAR(200) NOT NULL,
    required_by_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','cancelled','expired')),
    fulfilled_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);
```

**Relationships:**
- `requester_id` → one `User` (creator of the request)
- `fulfilled_by` → one `User` (donor, nullable)

---

## 14. ChatLog

> Decided table in V1.2 (was optional). Used for chatbot analytics. **Retention: 90 days**, enforced by a daily BullMQ job. Do not store retrieved context or personal data other than the user id, question and answer.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | UUID | FK → users(id), NOT NULL | Asker |
| `question` | TEXT | NOT NULL | |
| `answer` | TEXT | NOT NULL | |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |

```sql
CREATE TABLE chat_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Relationships:**
- Belongs to one `User`

---

## 15. Session (Better Auth)

> Generated by Better Auth. Stores the server-side login session referenced by the `httpOnly` session cookie. Replaces the custom 15-minute JWT and Redis refresh token of V1.1.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `user_id` | UUID | FK → users(id) ON DELETE CASCADE, NOT NULL | |
| `token` | VARCHAR(255) | UNIQUE, NOT NULL | Session token |
| `expires_at` | TIMESTAMP | NOT NULL | |
| `ip_address` | VARCHAR(45) | | |
| `user_agent` | TEXT | | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Relationships:** belongs to one `User`.

---

## 16. Account (Better Auth)

> Generated by Better Auth. For email/password login there is one row per user with `provider_id = 'credential'`; the password hash (scrypt by default) lives in `password`. The platform has no social login in V1.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `user_id` | UUID | FK → users(id) ON DELETE CASCADE, NOT NULL | |
| `account_id` | VARCHAR(255) | NOT NULL | Provider account id (equals the user id for credentials) |
| `provider_id` | VARCHAR(50) | NOT NULL | `credential` |
| `access_token` | TEXT | | Unused in V1 |
| `refresh_token` | TEXT | | Unused in V1 |
| `id_token` | TEXT | | Unused in V1 |
| `access_token_expires_at` | TIMESTAMP | | Unused in V1 |
| `refresh_token_expires_at` | TIMESTAMP | | Unused in V1 |
| `scope` | TEXT | | Unused in V1 |
| `password` | TEXT | | Password hash. Never returned by any API. |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id VARCHAR(255) NOT NULL,
    provider_id VARCHAR(50) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at TIMESTAMP,
    refresh_token_expires_at TIMESTAMP,
    scope TEXT,
    password TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Relationships:** belongs to one `User`.

---

## 17. Verification (Better Auth)

> Generated by Better Auth. Holds email-verification and password-reset tokens (with expiry). Replaces `User.verification_token`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | |
| `identifier` | VARCHAR(255) | NOT NULL | What is being verified (email or reset key) |
| `value` | TEXT | NOT NULL | Token value (Better Auth decides storage form) |
| `expires_at` | TIMESTAMP | NOT NULL | Verification link: 24 hours. Password reset: 1 hour. |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

```sql
CREATE TABLE verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Relationships:** none (matched by `identifier`).

---

## 18. AuditLog

> **Updated in V1.2:** `user_id` is nullable so system actions (cron jobs, SSLCommerz IPN) can be logged. Rows are append-only: the application never updates or deletes them. Every privileged mutation writes its audit row **inside the same transaction** through `AuditService`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | UUID | FK → users(id), nullable | Who performed the action (`NULL` = system) |
| `action` | VARCHAR(100) | NOT NULL | e.g. 'ROLE_CHANGED', 'EVENT_CANCELLED' |
| `entity_type` | VARCHAR(50) | | e.g. 'User', 'Event', 'Club' |
| `entity_id` | VARCHAR(50) | | Primary key of the affected row, as text (integer or UUID) |
| `old_value` | JSONB | | State before change |
| `new_value` | JSONB | | State after change |
| `ip_address` | INET | | Requester IP |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |

```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(50),
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Relationships:**
- Optionally belongs to one `User` (the actor)

> `entity_id` changed from `INT` to `VARCHAR(50)` because audited entities now include UUID-keyed rows (`User`). Never store passwords, tokens or password hashes in `old_value` / `new_value`.

---

## 19. Table Relationships

| # | From Table | To Table | Type | Description |
|---|------------|----------|------|-------------|
| 1 | Department | User | One-to-Many | One department has many users (students & faculty) |
| 2 | Department | Club | One-to-One | One department has one club (future: one-to-many) |
| 3 | Department | DepartmentAdminTerm | One-to-Many | A department can have many admin term records (one current) |
| 4 | User | DepartmentAdminTerm | One-to-Many | A faculty user can hold admin terms over the years (one current) |
| 5 | User | ClubMembership | One-to-Many | A user can have many club memberships over time |
| 6 | Club | ClubMembership | One-to-Many | A club can have many members |
| 7 | ClubMembership | PaymentTransaction | One-to-Many | One membership → multiple payment attempts and renewals |
| 8 | User | ClubCommitteeMember | One-to-Many | A user can hold committee positions over time |
| 9 | Club | ClubCommitteeMember | One-to-Many | A club has many committee members per term |
| 10 | Club | Event | One-to-Many | A club can organize many events |
| 11 | Event | EventDepartment | One-to-Many | An event can involve many departments |
| 12 | Department | EventDepartment | One-to-Many | A department can participate in many events |
| 13 | Event | EventRegistration | One-to-Many | An event can have many registrations |
| 14 | User | EventRegistration | One-to-Many | A user can register for many events |
| 15 | User | BloodDonation (as donor) | One-to-Many | A user can have many donation records |
| 16 | User | BloodDonation (as verifier) | One-to-Many | A user (admin) can verify many donations via `verified_by` |
| 17 | User | BloodRequest (as requester) | One-to-Many | A user can create many blood requests |
| 18 | User | BloodRequest (as fulfiller) | One-to-Many | A user can fulfill many blood requests via `fulfilled_by` |
| 19 | Club | Announcement | One-to-Many (nullable) | A club can post many announcements |
| 20 | Department | Announcement | One-to-Many (nullable) | A department can post many announcements |
| 21 | User | Announcement | One-to-Many | A user (author) can write many announcements |
| 22 | User | AuditLog | One-to-Many (nullable) | A user generates many audit log entries; system rows have none |
| 23 | User | PaymentTransaction | One-to-Many | A user can have many payments |
| 24 | User | ChatLog | One-to-Many | A user can have many chatbot exchanges |
| 25 | User | Session | One-to-Many | A user can have several active sessions (cascade delete) |
| 26 | User | Account | One-to-Many | A user has one credential account in V1 (cascade delete) |

---

## 20. Role Management Logic

### Role Hierarchy

```
super_admin  →  Full system access (user_type = super_admin, seeded)
dept_admin   →  Department-scoped admin (faculty on an active DepartmentAdminTerm)
moderator    →  Club committee member (active ClubCommitteeMember row)
faculty      →  Base role for user_type = faculty
student      →  Base role for user_type = student
```

### The single rule: `role` is derived, never edited

`User.role` is the **effective role**. It is computed by one function and written only by it:

```
RoleService.recompute(userId, tx):
  user = SELECT user_type FROM users WHERE id = userId
  if user.user_type = 'super_admin'                         → 'super_admin'
  else if EXISTS (SELECT 1 FROM department_admin_terms
                  WHERE user_id = userId AND is_current)    → 'dept_admin'
  else if EXISTS (SELECT 1 FROM club_committee_members
                  WHERE user_id = userId AND is_current)    → 'moderator'
  else                                                      → user.user_type   ('student' | 'faculty')
  if the result differs from users.role:
      UPDATE users SET role = result
      AuditService.log('ROLE_CHANGED', old, new, tx)
```

Because the result is recomputed from **all** active terms every time, ending one term can never downgrade a user who still holds another.

### Transition table

| Event | Service | Action |
|-------|---------|--------|
| Committee member inserted with `is_current = true` | `CommitteeService.assign` | Insert row, `recompute` (student or faculty → `moderator`; `dept_admin` stays `dept_admin`) |
| Committee term ended (manual or cron) | `CommitteeService.endTerm` | Set `is_current = false`, `recompute` (→ `student`/`faculty` per `user_type`, unless another term remains) |
| Dept admin term inserted with `is_current = true` | `DepartmentAdminService.startTerm` | Require `user_type = 'faculty'` and `department_id` equal to the term's department; insert, `recompute` → `dept_admin` |
| Dept admin term ended (manual or cron) | `DepartmentAdminService.endTerm` | Set `is_current = false`, `recompute` (→ `moderator` if the user still has a committee row, else `faculty`) |
| Term renewal | `DepartmentAdminService.renew` | End old term and insert new term in **one** transaction; role stays `dept_admin` |
| Super admin repair | `RoleService.recompute` via `POST /admin/users/:id/recompute-role` | Re-run the function for one user (idempotent, audited) |

> There is **no direct role override** in V1.2. The V1.1 `PATCH /admin/users/:id/role` is removed because the next recompute would silently undo it. To change a role, change the term that causes it.

### Scheduled jobs that touch roles (BullMQ repeatable, daily)

Both jobs call the same services as the manual endpoints, so the audit rows and `recompute` always run.

```
expireDepartmentAdminTerms():
  FOR EACH row IN department_admin_terms WHERE is_current AND end_date < CURRENT_DATE:
      DepartmentAdminService.endTerm(row.id, actor = system)

expireCommitteeTerms():
  FOR EACH row IN club_committee_members WHERE is_current AND term_end_year < EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Dhaka'):
      CommitteeService.endTerm(row.id, actor = system)
```

---

## 21. Service-Layer Logic Replacing Triggers

The three V1.1 triggers are **removed**. Their behaviour now lives in services and runs inside one `prisma.$transaction` together with the audit entry.

| V1.1 trigger | V1.2 replacement |
|--------------|------------------|
| `trg_update_last_donation` (after insert/update on `BloodDonation`) | `BloodService.verify(donationId, actor)`: transaction → set `verified`, `verified_by`, `verified_at` → `UPDATE users SET last_donation_date = (SELECT MAX(donation_date) FROM blood_donations WHERE user_id = $1 AND verified)` → `AuditService.log('BLOOD_DONATION_VERIFIED')`. Inserting an unverified donation does not touch `last_donation_date`. |
| `trg_sync_moderator_role` (after insert/update on `ClubCommitteeMember`) | `CommitteeService.assign / endTerm / edit` call `RoleService.recompute` (Section 20). |
| `trg_sync_dept_admin_role` (after insert/update on `DepartmentAdminTerm`) | `DepartmentAdminService.startTerm / endTerm / renew` call `RoleService.recompute` (Section 20). |

**Why:** Prisma Client cannot see database triggers, so tests, seeds and `prisma.user.update` would behave differently from production; trigger-written audit entries had no actor; and the revert-to-previous-role logic broke for users with two roles. Database-level guarantees are kept only for **invariants** (CHECK constraints and partial unique indexes, Section 22), which are safe because they never write data.

---

## 22. Hand-Written Migration SQL

Prisma cannot declare CHECK constraints or partial unique indexes. Create them with `prisma migrate dev --create-only --name db_invariants`, paste the SQL below into the generated migration file, review it, then apply. Never edit an applied migration; add a new one.

```sql
-- Partial unique indexes -----------------------------------------------------
CREATE UNIQUE INDEX users_student_id_per_dept
  ON users (department_id, student_id) WHERE student_id IS NOT NULL;

CREATE UNIQUE INDEX one_active_membership_per_user_club
  ON club_memberships (user_id, club_id) WHERE status = 'active';

-- Added by migration 20261111171335_membership_scheduled_status (ADR 0001), which also
-- re-creates membership_status_valid with 'scheduled'.
CREATE UNIQUE INDEX one_open_membership_per_user_club
  ON club_memberships (user_id, club_id) WHERE status IN ('pending', 'scheduled');

CREATE UNIQUE INDEX one_current_position_per_user_club
  ON club_committee_members (user_id, club_id) WHERE is_current = true;

CREATE UNIQUE INDEX dept_admin_one_current_per_dept
  ON department_admin_terms (department_id) WHERE is_current = true;

CREATE UNIQUE INDEX dept_admin_one_current_per_user
  ON department_admin_terms (user_id) WHERE is_current = true;

-- CHECK constraints (users) --------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_dept_required CHECK (user_type = 'super_admin' OR department_id IS NOT NULL),
  ADD CONSTRAINT users_blood_required CHECK (user_type = 'super_admin' OR blood_group IS NOT NULL),
  ADD CONSTRAINT users_academic_fields CHECK (
    (user_type = 'student'
       AND academic_session IS NOT NULL AND current_year IS NOT NULL
       AND current_semester IS NOT NULL AND student_id IS NOT NULL)
    OR
    (user_type <> 'student'
       AND academic_session IS NULL AND current_year IS NULL
       AND current_semester IS NULL AND student_id IS NULL)),
  ADD CONSTRAINT users_role_vs_type CHECK (
    (role <> 'super_admin' OR user_type = 'super_admin')
    AND (role <> 'dept_admin' OR user_type = 'faculty'));

-- CHECK constraints (other tables) -------------------------------------------
ALTER TABLE club_memberships
  ADD CONSTRAINT membership_dates_valid CHECK (end_date > start_date);
ALTER TABLE club_committee_members
  ADD CONSTRAINT committee_years_valid CHECK (term_end_year >= term_start_year);
ALTER TABLE department_admin_terms
  ADD CONSTRAINT admin_term_dates_valid CHECK (end_date >= start_date);
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_amount_positive CHECK (amount > 0);
ALTER TABLE events
  ADD CONSTRAINT events_dates_valid CHECK (end_date > start_date),
  ADD CONSTRAINT events_fee_when_paid CHECK (is_paid = FALSE OR fee_amount IS NOT NULL);
ALTER TABLE blood_donations
  ADD CONSTRAINT donation_verification_consistent CHECK (
    (verified = FALSE AND verified_by IS NULL AND verified_at IS NULL)
    OR (verified = TRUE AND verified_by IS NOT NULL AND verified_at IS NOT NULL));

-- Full-text search indexes (chatbot retrieval and event search) ---------------
CREATE INDEX events_fts ON events
  USING GIN (to_tsvector('simple', title || ' ' || coalesce(description, '')));
CREATE INDEX announcements_fts ON announcements
  USING GIN (to_tsvector('simple', title || ' ' || content));
CREATE INDEX clubs_fts ON clubs
  USING GIN (to_tsvector('simple', name || ' ' || coalesce(description, '')));
```

> Columns whose CHECKs are already declared inline in the Section 1–18 DDL are repeated here only for constraints Prisma will not generate. If you let Prisma create the tables, run this whole block once; if a constraint name already exists, remove the duplicate.

Every object above must also be listed in `docs/DECISIONS.md` under "DB objects" so a future `prisma migrate dev` diff is not mistaken for drift.

---

## 23. Index Plan

Prisma creates the primary keys, `UNIQUE` constraints and foreign-key columns' declared `@@index`es. Add these with `@@index` in `schema.prisma` unless marked hand-written.

| Table | Index | Serves |
|-------|-------|--------|
| `users` | `(department_id)`, `(role)` | Admin user lists, department dashboards |
| `club_memberships` | `(user_id, status)`, `(club_id, status)`, `(end_date)` | My memberships, member counts, expiry job |
| `payment_transactions` | `(club_membership_id)`, `(user_id, created_at)`, `(payment_status, created_at)` | Reconciliation job, revenue sums |
| `club_committee_members` | `(club_id, is_current)`, `(user_id, is_current)` | Club detail, role recompute |
| `department_admin_terms` | `(user_id, is_current)`, `(department_id, is_current)` | Role recompute, term list |
| `events` | `(organizer_club_id, status)`, `(status, start_date)` | Browse events, moderator dashboard |
| `event_departments` | `(department_id)` | Cross-department visibility filter |
| `event_registrations` | `(event_id, status)`, `(user_id)` | Capacity count, my registrations |
| `announcements` | `(club_id, created_at)`, `(department_id, created_at)`, `(is_pinned)` | Announcement feeds |
| `blood_donations` | `(user_id, verified)`, `(verified, donation_date)` | Donor list, unverified queue |
| `blood_requests` | `(status, blood_group)`, `(required_by_date)` | Request board, expiry job |
| `chat_logs` | `(user_id, created_at)`, `(created_at)` | Rate analytics, retention job |
| `audit_logs` | `(user_id, created_at)`, `(entity_type, entity_id)`, `(action, created_at)`, `(created_at)` | Audit viewer filters |
| `sessions` | `(user_id)` | Revoke all sessions for a user |

Full-text GIN indexes on `events`, `announcements` and `clubs` are hand-written (Section 22).

---

## 24. ER Diagram (Mermaid)

```mermaid
erDiagram
    Department ||--o{ User : contains
    Department ||--|| Club : has
    Department ||--o{ DepartmentAdminTerm : assigns
    Department ||--o{ EventDepartment : participates
    Department ||--o{ Announcement : posts

    User ||--o{ Session : has
    User ||--o{ Account : has
    User ||--o{ DepartmentAdminTerm : holds
    User ||--o{ ClubMembership : purchases
    User ||--o{ ClubCommitteeMember : holds
    User ||--o{ EventRegistration : registers
    User ||--o{ BloodDonation : donates
    User ||--o{ BloodDonation : verifies
    User ||--o{ BloodRequest : requests
    User ||--o{ BloodRequest : fulfills
    User ||--o{ Announcement : authors
    User |o--o{ AuditLog : generates
    User ||--o{ PaymentTransaction : pays
    User ||--o{ ChatLog : asks

    Club ||--o{ ClubMembership : receives
    Club ||--o{ ClubCommitteeMember : assigns
    Club ||--o{ Event : organizes
    Club ||--o{ Announcement : posts

    ClubMembership ||--o{ PaymentTransaction : pays

    Event ||--o{ EventDepartment : includes
    Event ||--o{ EventRegistration : has

    Department {
        int id PK
        string name UK
        text description
        timestamp created_at
    }

    User {
        uuid id PK
        string email UK
        string name
        boolean email_verified
        string user_type
        string role
        int department_id FK
        string blood_group
        boolean is_active
        string academic_session
        int current_year
        int current_semester
        string student_id
        string avatar_url
        date last_donation_date
        string phone
        timestamp created_at
        timestamp updated_at
    }

    Session {
        uuid id PK
        uuid user_id FK
        string token UK
        timestamp expires_at
        string ip_address
        text user_agent
        timestamp created_at
        timestamp updated_at
    }

    Account {
        uuid id PK
        uuid user_id FK
        string account_id
        string provider_id
        text password
        timestamp created_at
        timestamp updated_at
    }

    Verification {
        uuid id PK
        string identifier
        text value
        timestamp expires_at
        timestamp created_at
        timestamp updated_at
    }

    Club {
        int id PK
        string name
        int department_id FK_UK
        text description
        string logo_url
        decimal membership_fee_monthly
        decimal membership_fee_yearly
        timestamp created_at
        timestamp updated_at
    }

    ClubMembership {
        int id PK
        uuid user_id FK
        int club_id FK
        string type
        date start_date
        date end_date
        string status
        timestamp created_at
        timestamp updated_at
    }

    PaymentTransaction {
        int id PK
        uuid user_id FK
        int club_membership_id FK
        decimal amount
        string currency
        string transaction_id UK
        string payment_status
        string payment_method
        string val_id
        string bank_tran_id
        timestamp validated_at
        jsonb payment_gateway_response
        timestamp created_at
        timestamp updated_at
    }

    ClubCommitteeMember {
        int id PK
        uuid user_id FK
        int club_id FK
        string position
        int term_start_year
        int term_end_year
        boolean is_current
        timestamp created_at
        timestamp updated_at
    }

    DepartmentAdminTerm {
        int id PK
        uuid user_id FK
        int department_id FK
        date start_date
        date end_date
        boolean is_current
        timestamp created_at
        timestamp updated_at
    }

    Event {
        int id PK
        string title
        text description
        int organizer_club_id FK
        string visibility
        boolean is_paid
        decimal fee_amount
        timestamp start_date
        timestamp end_date
        string venue
        int max_attendees
        string poster_image_url
        string status
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    EventDepartment {
        int event_id FK
        int department_id FK
    }

    EventRegistration {
        int id PK
        uuid user_id FK
        int event_id FK
        string status
        timestamp checked_in_at
        timestamp registered_at
        timestamp cancelled_at
        string payment_status
        string payment_transaction_id
    }

    Announcement {
        int id PK
        int club_id FK
        int department_id FK
        string title
        text content
        uuid author_id FK
        boolean is_pinned
        timestamp created_at
        timestamp updated_at
    }

    BloodDonation {
        int id PK
        uuid user_id FK
        string blood_group
        date donation_date
        int units
        string hospital_name
        text notes
        boolean verified
        uuid verified_by FK
        timestamp verified_at
        timestamp created_at
    }

    BloodRequest {
        int id PK
        uuid requester_id FK
        string patient_name
        string blood_group
        int units_needed
        text reason
        string contact_phone
        string hospital_name
        date required_by_date
        string status
        uuid fulfilled_by FK
        timestamp created_at
        timestamp resolved_at
    }

    ChatLog {
        int id PK
        uuid user_id FK
        text question
        text answer
        timestamp created_at
    }

    AuditLog {
        int id PK
        uuid user_id FK
        string action
        string entity_type
        string entity_id
        jsonb old_value
        jsonb new_value
        inet ip_address
        timestamp created_at
    }
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-15 | Initial schema – 13 tables |
| 1.1 | 2025-01-15 | Added `DepartmentAdminTerm` (14th table); added `email_verified`, `verification_token`, `academic_session`, `current_year`, `current_semester`, `student_id` to `User`; added `verified_by`, `verified_at` to `BloodDonation`; added full trigger SQL and cron job logic; expanded relationship table to 22 entries |
| 1.2 | 2026-11-07 | Better Auth sessions (added `Session`, `Account`, `Verification`; removed `password_hash`, `verification_token`); UUID user ids; `user_type`; derived `role`; triggers replaced by service logic; partial unique indexes; `ChatLog` added; `pending` membership status; SSLCommerz validation fields; nullable `AuditLog.user_id`; CHECK constraints, index plan, snake_case physical names; 18 tables |
