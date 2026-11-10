// Test data for the Playwright suite (frontend/e2e). Run it only through with-test-db.mjs,
// which points the database URLs at the Neon `test` branch and sets NODE_ENV=test:
//
//   node scripts/with-test-db.mjs tsx scripts/e2e-db.ts seed
//   node scripts/with-test-db.mjs tsx scripts/e2e-db.ts verify <email>
//
// `seed` empties the user tables and creates one verified account per user type. `verify`
// marks an address verified, standing in for the emailed link (the link itself is covered by
// the backend integration tests).
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import type { Prisma } from '../src/generated/prisma/client.js';
import { auth } from '../src/lib/auth.js';
import { prisma } from '../src/lib/prisma.js';
import { userRepository } from '../src/modules/auth/user.repository.js';
import { auditService } from '../src/services/audit.service.js';

if (process.env.NODE_ENV !== 'test') {
  console.error('[e2e-db] refusing to run outside with-test-db.mjs (NODE_ENV must be test)');
  process.exit(1);
}

/** Every E2E account uses this password. It only ever exists on the test branch. */
export const E2E_PASSWORD = 'Str0ng!pass';

const DEPARTMENTS = [
  { name: 'CSE', description: 'Computer Science and Engineering' },
  { name: 'ECE', description: 'Electronics and Communication Engineering' },
  { name: 'BBA', description: 'Bachelor of Business Administration' },
];

async function seed() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE users, accounts, sessions, verifications, audit_logs RESTART IDENTITY CASCADE',
  );
  for (const dept of DEPARTMENTS) {
    const { id } = await prisma.department.upsert({
      where: { name: dept.name },
      update: {},
      create: dept,
    });
    // One club per department, reset on every seed so club edits in E2E are repeatable.
    const club = { name: `${dept.name} Club`, description: dept.description };
    const reset = { ...club, logoUrl: null, membershipFeeMonthly: null, membershipFeeYearly: null };
    await prisma.club.upsert({
      where: { departmentId: id },
      update: reset,
      create: { departmentId: id, ...club },
    });
  }
  const cse = await prisma.department.findUniqueOrThrow({ where: { name: 'CSE' } });
  const hash = await (await auth.$context).password.hash(E2E_PASSWORD);

  const users: Prisma.UserUncheckedCreateInput[] = [
    {
      name: 'Ayesha Rahman',
      email: 'student@e2e.test',
      userType: 'student',
      role: 'student',
      departmentId: cse.id,
      bloodGroup: 'B+',
      academicSession: '2022-2023',
      currentYear: 3,
      currentSemester: 1,
      studentId: 'CSE-E2E/001',
    },
    {
      name: 'Tanvir Ahmed',
      email: 'student2@e2e.test',
      userType: 'student',
      role: 'student',
      departmentId: cse.id,
      bloodGroup: 'A+',
      academicSession: '2023-2024',
      currentYear: 2,
      currentSemester: 2,
      studentId: 'CSE-E2E/002',
    },
    {
      // Suspended and edited by admin.spec.ts; no other spec signs in as this account.
      name: 'Nadia Islam',
      email: 'student3@e2e.test',
      userType: 'student',
      role: 'student',
      departmentId: cse.id,
      bloodGroup: 'O-',
      academicSession: '2024-2025',
      currentYear: 1,
      currentSemester: 1,
      studentId: 'CSE-E2E/003',
    },
    {
      name: 'Dr. Karim Hossain',
      email: 'faculty@e2e.test',
      userType: 'faculty',
      role: 'faculty',
      departmentId: cse.id,
      bloodGroup: 'O+',
    },
    { name: 'System Admin', email: 'admin@e2e.test', userType: 'super_admin', role: 'super_admin' },
  ];

  for (const data of users) {
    await prisma.$transaction(async (tx) => {
      const user = await userRepository.createUser(tx, {
        ...data,
        emailVerified: true,
        isActive: true,
      });
      await userRepository.createCredentialAccount(tx, user.id, hash);
      await auditService.record(tx, {
        userId: null,
        action: AUDIT_ACTIONS.USER_REGISTERED,
        entityType: 'user',
        entityId: user.id,
        newValue: { userType: data.userType, role: data.role, via: 'e2e-seed' },
      });
    });
  }
  console.log(`[e2e-db] seeded ${users.length} users on the test branch`);
}

async function verify(email: string | undefined) {
  if (!email) throw new Error('usage: e2e-db.ts verify <email>');
  const { count } = await prisma.user.updateMany({
    where: { email: email.toLowerCase() },
    data: { emailVerified: true },
  });
  if (count !== 1) throw new Error(`[e2e-db] no user ${email}`);
}

const [command, arg] = process.argv.slice(2);
try {
  if (command === 'seed') await seed();
  else if (command === 'verify') await verify(arg);
  else throw new Error('usage: e2e-db.ts <seed|verify <email>>');
} finally {
  await prisma.$disconnect();
}
