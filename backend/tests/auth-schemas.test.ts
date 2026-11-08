import { describe, expect, it } from '@jest/globals';
import { passwordSchema, registerFacultySchema, registerStudentSchema } from '@uniconnect/shared';

const validStudent = {
  name: 'Ayesha Rahman',
  email: '  Ayesha@Example.COM ',
  password: 'Str0ng!pass',
  department_id: 1,
  blood_group: 'B+',
  academic_session: '2022-2023',
  current_year: 3,
  current_semester: 1,
  student_id: 'CSE-2022/014',
};

const { academic_session, current_year, current_semester, student_id, ...validFaculty } =
  validStudent;
void [academic_session, current_year, current_semester, student_id];

describe('passwordSchema', () => {
  it.each(['Str0ng!pass', 'Aa1!aaaa'])('accepts %s', (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(true);
  });

  it.each([
    ['too short', 'Aa1!aaa'],
    ['no uppercase', 'str0ng!pass'],
    ['no lowercase', 'STR0NG!PASS'],
    ['no digit', 'Strong!pass'],
    ['no special character', 'Str0ngpass'],
    ['too long', `Aa1!${'a'.repeat(97)}`],
  ])('rejects a password with %s', (_label, pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });
});

describe('registerStudentSchema', () => {
  it('accepts a valid student and normalises the email', () => {
    const result = registerStudentSchema.parse(validStudent);
    expect(result.email).toBe('ayesha@example.com');
  });

  it.each(['role', 'user_type', 'is_active', 'email_verified'])(
    'rejects the extra key %s',
    (key) => {
      expect(
        registerStudentSchema.safeParse({ ...validStudent, [key]: 'super_admin' }).success,
      ).toBe(false);
    },
  );

  it.each([
    ['academic_session out of order', { academic_session: '2022-2024' }],
    ['academic_session format', { academic_session: '22-23' }],
    ['current_year 5', { current_year: 5 }],
    ['current_semester 3', { current_semester: 3 }],
    ['student_id with spaces', { student_id: 'CSE 14' }],
    ['department_id as a string', { department_id: '1' }],
    ['unknown blood group', { blood_group: 'C+' }],
    ['short phone', { phone: '12345' }],
  ])('rejects %s', (_label, patch) => {
    expect(registerStudentSchema.safeParse({ ...validStudent, ...patch }).success).toBe(false);
  });

  it('requires the academic fields', () => {
    expect(registerStudentSchema.safeParse(validFaculty).success).toBe(false);
  });
});

describe('registerFacultySchema', () => {
  it('accepts a faculty member without academic fields', () => {
    expect(
      registerFacultySchema.safeParse({ ...validFaculty, phone: '+8801712345678' }).success,
    ).toBe(true);
  });

  it('rejects student-only fields', () => {
    expect(registerFacultySchema.safeParse({ ...validFaculty, student_id: 'X1' }).success).toBe(
      false,
    );
  });
});
