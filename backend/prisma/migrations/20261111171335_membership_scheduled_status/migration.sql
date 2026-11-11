-- DECISIONS D11: membership states. Hand-written; Prisma does not generate CHECKs or partial
-- indexes and ignores them when diffing (DECISIONS §3).

-- A paid early renewal waits as `scheduled` until the previous membership ends, so `pending`
-- means only "checkout not yet paid". The value set matches MEMBERSHIP_STATUSES in shared.
ALTER TABLE club_memberships DROP CONSTRAINT membership_status_valid;
ALTER TABLE club_memberships
  ADD CONSTRAINT membership_status_valid
    CHECK (status IN ('pending', 'scheduled', 'active', 'expired', 'cancelled'));

-- At most one open checkout or queued renewal per user per club. Blocks two concurrent
-- checkouts, which could otherwise both be paid and collide on one_active_membership_per_user_club.
CREATE UNIQUE INDEX one_open_membership_per_user_club
  ON club_memberships (user_id, club_id)
  WHERE status IN ('pending', 'scheduled');
