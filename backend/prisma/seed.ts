// Seeds the V1 departments, one club per department (D18) and the super admin. Safe to run
// more than once.
// Run with `pnpm db:seed` (prisma db seed). Credentials come from backend/.env.
import { AUDIT_ACTIONS, emailSchema, nameSchema, passwordSchema } from '@uniconnect/shared';
import { z } from 'zod';
import { auth } from '../src/lib/auth.js';
import { prisma } from '../src/lib/prisma.js';
import { userRepository } from '../src/modules/auth/user.repository.js';
import { auditService } from '../src/services/audit.service.js';

const DEPARTMENTS = [
  { name: 'CSE', description: 'Computer Science and Engineering' },
  { name: 'ECE', description: 'Electronics and Communication Engineering' },
  { name: 'BBA', description: 'Bachelor of Business Administration' },
];

const seedEnv = z
  .object({
    SEED_SUPER_ADMIN_EMAIL: emailSchema,
    SEED_SUPER_ADMIN_PASSWORD: passwordSchema,
    SEED_SUPER_ADMIN_NAME: nameSchema.default('Super Admin'),
  })
  .parse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')));

async function main() {
  for (const dept of DEPARTMENTS) {
    const { id } = await prisma.department.upsert({
      where: { name: dept.name },
      update: {},
      create: dept,
    });
    // One club per department (DECISIONS D18, issue 16). `update: {}` keeps any edits a
    // dept admin made; fees stay null until the operator sets them.
    await prisma.club.upsert({
      where: { departmentId: id },
      update: {},
      create: { departmentId: id, name: `${dept.name} Club`, description: dept.description },
    });
  }
  console.log(`departments and clubs: ${DEPARTMENTS.map((d) => d.name).join(', ')}`);

  const email = seedEnv.SEED_SUPER_ADMIN_EMAIL;
  if (await userRepository.emailTaken(prisma, email)) {
    console.log(`super admin ${email} already exists, left unchanged`);
    return;
  }

  const passwordHash = await (await auth.$context).password.hash(seedEnv.SEED_SUPER_ADMIN_PASSWORD);
  await prisma.$transaction(async (tx) => {
    const user = await userRepository.createUser(tx, {
      name: seedEnv.SEED_SUPER_ADMIN_NAME,
      email,
      // Seeded by the operator, so there is no verification email to wait for.
      emailVerified: true,
      userType: 'super_admin',
      role: 'super_admin',
      isActive: true,
    });
    await userRepository.createCredentialAccount(tx, user.id, passwordHash);
    await auditService.record(tx, {
      userId: null,
      action: AUDIT_ACTIONS.USER_REGISTERED,
      entityType: 'user',
      entityId: user.id,
      newValue: { userType: 'super_admin', role: 'super_admin', via: 'seed' },
    });
  });
  console.log(`super admin ${email} created`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
