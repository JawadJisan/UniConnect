import { z } from 'zod';

/** One row of GET /api/v1/departments. */
export const departmentSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
});

export type Department = z.infer<typeof departmentSchema>;
