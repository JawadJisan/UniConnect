import {
  AUDIT_ACTIONS,
  type RegisterFacultyInput,
  type RegisterStudentInput,
  type UserType,
} from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { auth } from '../../lib/auth.js';
import { badRequest, conflict } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../../services/audit.service.js';
import { roleService } from '../../services/role.service.js';
import { userRepository } from './user.repository.js';

export const VERIFY_CALLBACK_URL = '/login?verified=true';

export interface RegisteredUser {
  id: string;
  email: string;
  role: string;
}

type Registration =
  | { userType: 'student'; input: RegisterStudentInput }
  | { userType: 'faculty'; input: RegisterFacultyInput };

function profileFields({ userType, input }: Registration): Prisma.UserUncheckedCreateInput {
  const base = {
    name: input.name,
    email: input.email,
    emailVerified: false,
    userType: userType satisfies UserType,
    role: roleService.initialRole(userType),
    isActive: true,
    departmentId: input.department_id,
    bloodGroup: input.blood_group,
    phone: input.phone ?? null,
  };
  if (userType === 'faculty') return base;
  return {
    ...base,
    academicSession: input.academic_session,
    currentYear: input.current_year,
    currentSemester: input.current_semester,
    studentId: input.student_id,
  };
}

async function register(registration: Registration, ip: string | null): Promise<RegisteredUser> {
  const { input } = registration;

  if (!(await userRepository.departmentExists(prisma, input.department_id))) {
    throw badRequest('DEPARTMENT_NOT_FOUND', 'Department not found.');
  }
  if (await userRepository.emailTaken(prisma, input.email)) {
    throw conflict('EMAIL_TAKEN', 'Email already registered.');
  }
  if (
    registration.userType === 'student' &&
    (await userRepository.studentIdTaken(
      prisma,
      registration.input.department_id,
      registration.input.student_id,
    ))
  ) {
    throw conflict('STUDENT_ID_TAKEN', 'Student ID already registered.');
  }

  // Hash with Better Auth's own hasher, so its sign-in can verify the password.
  const passwordHash = await (await auth.$context).password.hash(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await userRepository.createUser(tx, profileFields(registration));
    await userRepository.createCredentialAccount(tx, created.id, passwordHash);
    await auditService.record(tx, {
      userId: created.id,
      action: AUDIT_ACTIONS.USER_REGISTERED,
      entityType: 'user',
      entityId: created.id,
      newValue: {
        userType: registration.userType,
        role: created.role,
        departmentId: input.department_id,
      },
      ipAddress: ip,
    });
    return created;
  });

  // After commit. If queueing fails the account still exists and the user can ask for
  // another link from the login page, so don't fail the registration.
  try {
    await auth.api.sendVerificationEmail({
      body: { email: user.email, callbackURL: VERIFY_CALLBACK_URL },
    });
  } catch (err) {
    logger.error(`verification email for user ${user.id} not queued: ${(err as Error).message}`);
  }

  return { id: user.id, email: user.email, role: user.role };
}

export const registrationService = {
  registerStudent: (input: RegisterStudentInput, ip: string | null) =>
    register({ userType: 'student', input }, ip),
  registerFaculty: (input: RegisterFacultyInput, ip: string | null) =>
    register({ userType: 'faculty', input }, ip),
};
