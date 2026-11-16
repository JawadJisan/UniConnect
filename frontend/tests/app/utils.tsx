import type { UserProfile } from '@uniconnect/shared';

/** A signed-in student's profile, as GET /api/v1/users/me returns it. */
export function studentProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1',
    email: 'ayesha@example.com',
    name: 'Ayesha Rahman',
    email_verified: true,
    avatar_url: null,
    user_type: 'student',
    role: 'student',
    is_active: true,
    department: { id: 1, name: 'CSE' },
    blood_group: 'B+',
    phone: null,
    academic_session: '2022-2023',
    current_year: 3,
    current_semester: 1,
    student_id: 'CSE-2022/014',
    last_donation_date: null,
    created_at: '2026-11-08T10:00:00.000Z',
    updated_at: '2026-11-08T10:00:00.000Z',
    ...overrides,
  };
}

export function facultyProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return studentProfile({
    email: 'karim@example.com',
    name: 'Dr. Karim Hossain',
    user_type: 'faculty',
    role: 'faculty',
    blood_group: 'O+',
    academic_session: null,
    current_year: null,
    current_semester: null,
    student_id: null,
    ...overrides,
  });
}

export function superAdminProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return studentProfile({
    email: 'admin@example.com',
    name: 'System Admin',
    user_type: 'super_admin',
    role: 'super_admin',
    department: null,
    blood_group: null,
    academic_session: null,
    current_year: null,
    current_semester: null,
    student_id: null,
    ...overrides,
  });
}

/** The axios response shape `api` resolves with. */
export const ok = <T,>(data: T) => ({ data: { success: true, data } });

/** A File of `size` bytes with the given type. */
export function fakeFile(name: string, type: string, size = 1024) {
  return new File([new Uint8Array(size)], name, { type });
}
