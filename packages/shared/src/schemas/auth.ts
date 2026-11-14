import { z } from 'zod';
import { bloodGroupSchema } from './enums.js';

export const PASSWORD_REQUIREMENTS_MESSAGE = 'Password does not meet requirements.';

/** Emails are stored lowercase, so uniqueness is case-insensitive. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(255));

/** 8 to 100 characters with an uppercase letter, a lowercase letter, a digit and another character. */
export const passwordSchema = z
  .string()
  .min(8, PASSWORD_REQUIREMENTS_MESSAGE)
  .max(100, PASSWORD_REQUIREMENTS_MESSAGE)
  .regex(/[A-Z]/, PASSWORD_REQUIREMENTS_MESSAGE)
  .regex(/[a-z]/, PASSWORD_REQUIREMENTS_MESSAGE)
  .regex(/[0-9]/, PASSWORD_REQUIREMENTS_MESSAGE)
  .regex(/[^A-Za-z0-9]/, PASSWORD_REQUIREMENTS_MESSAGE);

/**
 * A person's name: letters in any script (Bangla included, with its vowel signs), spaces and
 * `.'-`, with dots only after a word or an initial. Nothing that reads as a link or markup, because the name appears in emails sent to
 * any address typed at registration (DECISIONS §7 L6, D46).
 */
export const NAME_MESSAGE = "Use letters, spaces and . ' - only.";
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(100, 'Name must be at most 100 characters.')
  .regex(/^[\p{L}\p{M}]+(?:[ .'-]+[\p{L}\p{M}]+)*\.?$/u, NAME_MESSAGE)
  // Initials ("A.K.M. Fazlul Haque") are fine; a dot right before a word ("example.com") is a
  // domain that mail clients would turn into a link.
  .regex(/^(?!.*\.[\p{L}\p{M}]{2})/u, NAME_MESSAGE);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10 to 15 digits, optionally starting with +.');

/** "2022-2023": the second year follows the first. */
export const academicSessionSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, 'Academic session must look like 2022-2023.')
  .refine((value) => {
    const [start, end] = value.split('-').map(Number);
    return end === (start ?? 0) + 1;
  }, 'The second year must follow the first.');

export const studentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9/-]+$/, 'Student ID may contain letters, digits, "/" and "-".');

const baseRegistration = {
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  department_id: z.number().int().positive(),
  blood_group: bloodGroupSchema,
  phone: phoneSchema.optional(),
};

// .strict(): any other key (role, user_type, is_active, ...) is a 400.
export const registerStudentSchema = z
  .object({
    ...baseRegistration,
    academic_session: academicSessionSchema,
    current_year: z.number().int().min(1).max(4),
    current_semester: z.number().int().min(1).max(2),
    student_id: studentIdSchema,
  })
  .strict();

export const registerFacultySchema = z.object(baseRegistration).strict();

export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;
export type RegisterFacultyInput = z.infer<typeof registerFacultySchema>;

// Better Auth endpoints. The backend enforces these too: sign-in checks the stored hash, and
// the reset and change-password hooks apply passwordSchema to `newPassword`.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
