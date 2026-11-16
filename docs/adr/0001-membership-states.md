# 0001: Membership states: `scheduled` and one open checkout per club

**Status:** Accepted
**Date:** 2026-11-11
**Decision ref:** `docs/DECISIONS.md` §5 D11 (issue 13), §6 D32

## Context

PRD FR-MEM-002 lets a student renew early. The renewal starts the day after the current membership ends. `club_memberships` allowed only `pending | active | expired | cancelled`, and `one_active_membership_per_user_club` allows one `active` row per user and club. That left a paid early renewal with nowhere to go:

- It can't become `active` while the old row is still active, because the index rejects it.
- It can't stay `pending`, because then `pending` means both "unpaid" and "paid, not started". The 30-minute stale-checkout job (PRD §15) would cancel a paid row.
- Nothing stopped two concurrent checkouts for the same club. Both could be paid, and the second activation would hit the unique index after the money was taken.

## Decision

- **New status:** `club_memberships.status` gains `scheduled`, a paid renewal waiting for the previous membership to end. The CHECK `membership_status_valid` and `MEMBERSHIP_STATUSES` in shared list `pending, scheduled, active, expired, cancelled`.
- **New index:** `one_open_membership_per_user_club ON club_memberships (user_id, club_id) WHERE status IN ('pending','scheduled')` allows one open checkout or queued renewal per user and club.
- **Activation:** the IPN activates a paid row from today, or makes it `scheduled` from `previous end_date + 1` when the pair still has an active row that ends today or later. The daily `expire-memberships` job expires ended rows, then turns due `scheduled` rows `active`.
- **Migration:** `20261111171335_membership_scheduled_status`, hand-written SQL (listed in `DECISIONS.md` §3).

## Consequences

- **Meaning of `pending`:** it now means "checkout not paid" only, so the stale-checkout job is safe.
- **Concurrent checkouts:** a duplicate checkout is a P2002, mapped to 409 `CHECKOUT_IN_PROGRESS`. Integration tests fire parallel checkouts and assert that one wins.
- **Renewal limit:** a student can't open a second renewal while one is scheduled (409 `RENEWAL_ALREADY_SCHEDULED`).
- **Frontend:** it must show `scheduled` ("starts on …").
- **Docs:** the PRD and the schema doc list the new status.

## Alternatives considered

- **Keep the paid renewal `pending` and exempt paid rows from the stale job.** Rejected: one status with two meanings, and every query has to join payments to tell them apart.
- **Allow renewal only after expiry.** Rejected: FR-MEM-002 explicitly asks for early renewal starting at `old end_date + 1`.
- **Make the activation wait and retry until the old row expires.** Rejected: the paid row would still sit in `pending`, which has the same problem as the first option.
