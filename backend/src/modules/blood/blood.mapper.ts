import type {
  BloodGroup,
  BloodRequest,
  BloodRequestStatus,
  Donation,
  Donor,
  UnverifiedDonation,
} from '@uniconnect/shared';
import { fromDbDate } from '../../lib/dates.js';
import { AppError } from '../../lib/http-error.js';
import type { DonationRow, DonorRow, UnverifiedRow } from './donation.repository.js';
import type { RequestRow } from './request.repository.js';

/** A lock wait ran past `lock_timeout`: nothing was written, so retrying is safe (as D36). */
export const BLOOD_BUSY = () =>
  new AppError(
    503,
    'BLOOD_BUSY',
    'Someone else is updating this right now. Try again in a moment.',
  );

/** Who is acting, as the blood services need it. */
export interface BloodCaller {
  id: string;
  role: string;
  departmentId: number | null;
  ip: string | null;
}

/** FR-BLOOD-008: the requester, a dept_admin of the requester's department, or a super_admin. */
export function canCancelWith(
  caller: BloodCaller,
  req: { requesterId: string; requesterDepartmentId: number | null },
): boolean {
  if (caller.role === 'super_admin') return true;
  if (caller.id === req.requesterId) return true;
  return (
    caller.role === 'dept_admin' &&
    caller.departmentId !== null &&
    caller.departmentId === req.requesterDepartmentId
  );
}

export function toDonation(row: DonationRow): Donation {
  return {
    id: row.id,
    blood_group: row.bloodGroup as BloodGroup,
    donation_date: fromDbDate(row.donationDate),
    units: row.units,
    hospital_name: row.hospitalName,
    notes: row.notes,
    verified: row.verified,
    verified_at: row.verifiedAt?.toISOString() ?? null,
    verifier: row.verifier ? { id: row.verifier.id, name: row.verifier.name } : null,
    created_at: row.createdAt.toISOString(),
  };
}

export function toUnverifiedDonation(row: UnverifiedRow): UnverifiedDonation {
  return {
    ...toDonation(row),
    donor: {
      id: row.donor.id,
      name: row.donor.name,
      student_id: row.donor.studentId,
      department: row.donor.department
        ? { id: row.donor.department.id, name: row.donor.department.name }
        : null,
    },
  };
}

/** D14 (resolved 2026-11-14): phone yes, email never. */
export function toDonor(row: DonorRow, verified: boolean): Donor {
  return {
    id: row.id,
    name: row.name,
    blood_group: row.bloodGroup as BloodGroup,
    department: row.department ? { id: row.department.id, name: row.department.name } : null,
    last_donation_date: row.lastDonationDate ? fromDbDate(row.lastDonationDate) : null,
    phone: row.phone,
    verified,
  };
}

export function toBloodRequest(row: RequestRow, caller: BloodCaller): BloodRequest {
  const pending = row.status === 'pending';
  return {
    id: row.id,
    patient_name: row.patientName,
    blood_group: row.bloodGroup as BloodGroup,
    units_needed: row.unitsNeeded,
    reason: row.reason,
    contact_phone: row.contactPhone,
    hospital_name: row.hospitalName,
    required_by_date: fromDbDate(row.requiredByDate),
    status: row.status as BloodRequestStatus,
    requester: {
      id: row.requester.id,
      name: row.requester.name,
      department: row.requester.department
        ? { id: row.requester.department.id, name: row.requester.department.name }
        : null,
    },
    fulfiller: row.fulfiller ? { id: row.fulfiller.id, name: row.fulfiller.name } : null,
    created_at: row.createdAt.toISOString(),
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    can_fulfill: pending && caller.id !== row.requesterId,
    can_cancel:
      pending &&
      canCancelWith(caller, {
        requesterId: row.requesterId,
        requesterDepartmentId: row.requester.departmentId,
      }),
  };
}
