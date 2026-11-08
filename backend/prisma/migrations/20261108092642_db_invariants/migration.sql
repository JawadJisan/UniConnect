-- Hand-written database invariants that Prisma cannot declare.
-- Source: docs/DATABASE_SCHEMA_V1.md §22, plus the CHECKs §22 omits (docs/DECISIONS.md §4 #2).
-- Every object here is listed in docs/DECISIONS.md §3. Value sets must match
-- packages/shared/src/constants/index.ts. Never edit this file once applied; add a new migration.

-- Partial unique indexes -------------------------------------------------------------------
CREATE UNIQUE INDEX users_student_id_per_dept
  ON users (department_id, student_id) WHERE student_id IS NOT NULL;

CREATE UNIQUE INDEX one_active_membership_per_user_club
  ON club_memberships (user_id, club_id) WHERE status = 'active';

CREATE UNIQUE INDEX one_current_position_per_user_club
  ON club_committee_members (user_id, club_id) WHERE is_current = true;

CREATE UNIQUE INDEX dept_admin_one_current_per_dept
  ON department_admin_terms (department_id) WHERE is_current = true;

CREATE UNIQUE INDEX dept_admin_one_current_per_user
  ON department_admin_terms (user_id) WHERE is_current = true;

-- users ------------------------------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_user_type_valid CHECK (user_type IN ('student', 'faculty', 'super_admin')),
  ADD CONSTRAINT users_role_valid
    CHECK (role IN ('student', 'faculty', 'moderator', 'dept_admin', 'super_admin')),
  ADD CONSTRAINT users_blood_group_valid
    CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  ADD CONSTRAINT users_current_year_range CHECK (current_year BETWEEN 1 AND 4),
  ADD CONSTRAINT users_current_semester_range CHECK (current_semester BETWEEN 1 AND 2),
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

-- clubs ------------------------------------------------------------------------------------
ALTER TABLE clubs
  ADD CONSTRAINT clubs_fee_monthly_non_negative CHECK (membership_fee_monthly >= 0),
  ADD CONSTRAINT clubs_fee_yearly_non_negative CHECK (membership_fee_yearly >= 0);

-- club_memberships -------------------------------------------------------------------------
ALTER TABLE club_memberships
  ADD CONSTRAINT membership_type_valid CHECK (type IN ('monthly', 'yearly')),
  ADD CONSTRAINT membership_status_valid
    CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  ADD CONSTRAINT membership_dates_valid CHECK (end_date > start_date);

-- payment_transactions ---------------------------------------------------------------------
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT payment_status_valid
    CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded'));

-- club_committee_members -------------------------------------------------------------------
ALTER TABLE club_committee_members
  ADD CONSTRAINT committee_years_valid CHECK (term_end_year >= term_start_year);

-- department_admin_terms -------------------------------------------------------------------
ALTER TABLE department_admin_terms
  ADD CONSTRAINT admin_term_dates_valid CHECK (end_date >= start_date);

-- events -----------------------------------------------------------------------------------
ALTER TABLE events
  ADD CONSTRAINT events_visibility_valid CHECK (visibility IN ('public', 'members_only')),
  ADD CONSTRAINT events_status_valid
    CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  ADD CONSTRAINT events_fee_non_negative CHECK (fee_amount >= 0),
  ADD CONSTRAINT events_max_attendees_positive CHECK (max_attendees > 0),
  ADD CONSTRAINT events_dates_valid CHECK (end_date > start_date),
  ADD CONSTRAINT events_fee_when_paid CHECK (is_paid = FALSE OR fee_amount IS NOT NULL);

-- event_registrations ----------------------------------------------------------------------
ALTER TABLE event_registrations
  ADD CONSTRAINT registration_status_valid
    CHECK (status IN ('registered', 'attended', 'cancelled', 'no_show')),
  ADD CONSTRAINT registration_payment_status_valid
    CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded'));

-- announcements ----------------------------------------------------------------------------
ALTER TABLE announcements
  ADD CONSTRAINT announcements_scope_required CHECK (club_id IS NOT NULL OR department_id IS NOT NULL);

-- blood_donations --------------------------------------------------------------------------
ALTER TABLE blood_donations
  ADD CONSTRAINT donation_blood_group_valid
    CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  ADD CONSTRAINT donation_units_range CHECK (units BETWEEN 1 AND 4),
  ADD CONSTRAINT donation_verification_consistent CHECK (
    (verified = FALSE AND verified_by IS NULL AND verified_at IS NULL)
    OR (verified = TRUE AND verified_by IS NOT NULL AND verified_at IS NOT NULL));

-- blood_requests ---------------------------------------------------------------------------
ALTER TABLE blood_requests
  ADD CONSTRAINT blood_request_blood_group_valid
    CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  ADD CONSTRAINT blood_request_units_positive CHECK (units_needed > 0),
  ADD CONSTRAINT blood_request_status_valid
    CHECK (status IN ('pending', 'fulfilled', 'cancelled', 'expired'));

-- Full-text search indexes (chatbot retrieval and event search) ----------------------------
CREATE INDEX events_fts ON events
  USING GIN (to_tsvector('simple', title || ' ' || coalesce(description, '')));
CREATE INDEX announcements_fts ON announcements
  USING GIN (to_tsvector('simple', title || ' ' || content));
CREATE INDEX clubs_fts ON clubs
  USING GIN (to_tsvector('simple', name || ' ' || coalesce(description, '')));
