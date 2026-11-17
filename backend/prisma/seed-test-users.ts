// Seeds verified test accounts for manual testing: 10 students and 4 faculty per department,
// with filled-in profiles and no verification email. Development only; safe to run again
// (existing emails and student IDs are skipped). Writes the credential list to docs/testing/.
// Run with `pnpm --filter @uniconnect/backend db:seed:test-users`. Needs `pnpm db:seed` first.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_ACTIONS,
  BLOOD_GROUPS,
  registerFacultySchema,
  registerStudentSchema,
  type UserType,
} from '@uniconnect/shared';
import { auth } from '../src/lib/auth.js';
import { prisma } from '../src/lib/prisma.js';
import { userRepository } from '../src/modules/auth/user.repository.js';
import { auditService } from '../src/services/audit.service.js';
import { roleService } from '../src/services/role.service.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('seed-test-users refuses to run with NODE_ENV=production.');
}

const PASSWORD = 'Jawad@123';
const EMAIL_DOMAIN = 'uniconnect.test';

// Faculty names from https://ist.edu.bd/faculty-members/ (members not on leave).
// Student names are invented.
const PEOPLE: Record<string, { faculty: string[]; students: string[] }> = {
  CSE: {
    faculty: ['Lutfi Habiba', 'Saleh Muhammad Maruf', 'Tasmi Sultana', 'Md. Shamim Hasan'],
    students: [
      'Arif Rahman',
      'Nusrat Jahan',
      'Tanvir Ahmed',
      'Farhana Akter',
      'Rakibul Islam',
      'Sadia Afrin',
      'Imran Hossain',
      'Tasnim Rahman',
      'Fahim Shahriar',
      'Riya Chowdhury',
    ],
  },
  ECE: {
    faculty: [
      'Mahfuza Ferdousi',
      'Runa Rukshana Khan',
      'Mohammad Liton Hossain',
      'Md. Rakib Hossain',
    ],
    students: [
      'Sabbir Hossain',
      'Jannatul Ferdous',
      'Rifat Karim',
      'Mim Akter',
      'Asif Iqbal',
      'Nadia Islam',
      'Towhid Alam',
      'Sumaiya Khan',
      'Zahid Hasan',
      'Anika Tabassum',
    ],
  },
  BBA: {
    faculty: ['Mahedi Hasan', 'S. M. Ziaul Hasan', 'Nafia Laila', 'Tania Akther'],
    students: [
      'Rahim Uddin',
      'Tanjila Rahman',
      'Sajid Mahmud',
      'Lamia Haque',
      'Nayeem Chowdhury',
      'Farzana Yasmin',
      'Rashed Kabir',
      'Moumita Das',
      'Shafiq Ahmed',
      'Israt Jahan',
    ],
  },
};

// Session start year → current year of study (as of the 2026 term).
const SESSIONS = [
  { start: 2025, year: 1 },
  { start: 2024, year: 2 },
  { start: 2023, year: 3 },
  { start: 2022, year: 4 },
];

interface SeedRow {
  dept: string;
  userType: Extract<UserType, 'student' | 'faculty'>;
  name: string;
  email: string;
  bloodGroup: string;
  phone: string;
  studentId: string | null;
  academicSession: string | null;
  currentYear: number | null;
  currentSemester: number | null;
  status: 'created' | 'skipped';
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

async function main() {
  const passwordHash = await (await auth.$context).password.hash(PASSWORD);
  const rows: SeedRow[] = [];
  let bloodIndex = 0;

  for (const [deptIndex, [dept, people]] of Object.entries(PEOPLE).entries()) {
    const department = await prisma.department.findUnique({ where: { name: dept } });
    if (!department) throw new Error(`Department ${dept} not found. Run \`pnpm db:seed\` first.`);

    const accounts = [
      ...people.faculty.map((name, i) => ({ userType: 'faculty' as const, name, n: i + 1 })),
      ...people.students.map((name, i) => ({ userType: 'student' as const, name, n: i + 1 })),
    ];

    for (const { userType, name, n } of accounts) {
      const prefix = dept.toLowerCase();
      const email = `${prefix}.${userType}${pad(n)}@${EMAIL_DOMAIN}`;
      const bloodGroup = BLOOD_GROUPS[bloodIndex++ % BLOOD_GROUPS.length]!;
      // 017 + dept digit + type digit + 6-digit counter: unique and 11 digits long.
      const phone = `017${deptIndex + 1}${userType === 'faculty' ? 1 : 2}${pad(n, 6)}`;
      const base = {
        name,
        email,
        password: PASSWORD,
        department_id: department.id,
        blood_group: bloodGroup,
        phone,
      };

      let profile;
      if (userType === 'student') {
        const session = SESSIONS[(n - 1) % SESSIONS.length]!;
        const input = registerStudentSchema.parse({
          ...base,
          academic_session: `${session.start}-${session.start + 1}`,
          current_year: session.year,
          current_semester: (n % 2) + 1,
          student_id: `${dept}-${session.start}-${pad(n, 3)}`,
        });
        profile = {
          academicSession: input.academic_session,
          currentYear: input.current_year,
          currentSemester: input.current_semester,
          studentId: input.student_id,
        };
      } else {
        registerFacultySchema.parse(base);
        profile = {
          academicSession: null,
          currentYear: null,
          currentSemester: null,
          studentId: null,
        };
      }

      const row: SeedRow = {
        dept,
        userType,
        name,
        email,
        bloodGroup,
        phone,
        ...profile,
        status: 'skipped',
      };
      rows.push(row);

      if (await userRepository.emailTaken(prisma, email)) continue;
      if (
        profile.studentId &&
        (await userRepository.studentIdTaken(prisma, department.id, profile.studentId))
      ) {
        console.warn(`student ID ${profile.studentId} already used in ${dept}; ${email} skipped`);
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const user = await userRepository.createUser(tx, {
          name,
          email,
          // Test accounts: no verification email to wait for.
          emailVerified: true,
          userType,
          role: roleService.initialRole(userType),
          isActive: true,
          departmentId: department.id,
          bloodGroup,
          phone,
          ...profile,
        });
        await userRepository.createCredentialAccount(tx, user.id, passwordHash);
        await auditService.record(tx, {
          userId: null,
          action: AUDIT_ACTIONS.USER_REGISTERED,
          entityType: 'user',
          entityId: user.id,
          newValue: { userType, role: user.role, departmentId: department.id, via: 'test-seed' },
        });
      });
      row.status = 'created';
    }
  }

  const created = rows.filter((r) => r.status === 'created').length;
  console.log(`test users: ${created} created, ${rows.length - created} skipped`);
  writeLists(rows);
}

function writeLists(rows: SeedRow[]) {
  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/testing');
  mkdirSync(outDir, { recursive: true });

  const header = [
    'Dept',
    'Type',
    'Name',
    'Email',
    'Password',
    'Student ID',
    'Session',
    'Year',
    'Semester',
    'Blood',
    'Phone',
  ];
  const cells = (r: SeedRow) => [
    r.dept,
    r.userType,
    r.name,
    r.email,
    PASSWORD,
    r.studentId ?? '',
    r.academicSession ?? '',
    r.currentYear?.toString() ?? '',
    r.currentSemester?.toString() ?? '',
    r.bloodGroup,
    r.phone,
  ];

  const csv = [header, ...rows.map(cells)]
    .map((line) => line.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');
  writeFileSync(resolve(outDir, 'test-users.csv'), `${csv}\n`);

  const md = [
    '# Test users',
    '',
    `Generated by \`pnpm --filter @uniconnect/backend db:seed:test-users\` (Neon \`development\` only).`,
    `All emails are verified and use the fake domain \`${EMAIL_DOMAIN}\`, so no mail reaches anyone.`,
    `Password for every account: \`${PASSWORD}\`. Faculty names are from ist.edu.bd; student names are invented.`,
    '',
    ...Object.keys(PEOPLE).flatMap((dept) => [
      `## ${dept}`,
      '',
      `| ${header.filter((h) => h !== 'Dept' && h !== 'Password').join(' | ')} |`,
      `|${' --- |'.repeat(header.length - 2)}`,
      ...rows
        .filter((r) => r.dept === dept)
        .map(
          (r) =>
            `| ${cells(r)
              .filter((_, i) => i !== 0 && i !== 4)
              .join(' | ')} |`,
        ),
      '',
    ]),
  ].join('\n');
  writeFileSync(resolve(outDir, 'TEST_USERS.md'), md);
  console.log(`lists written to ${outDir}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
