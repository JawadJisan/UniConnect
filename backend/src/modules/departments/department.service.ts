import type { Department } from '@uniconnect/shared';
import { prisma } from '../../lib/prisma.js';
import { departmentRepository } from './department.repository.js';

export const departmentService = {
  /** Public: the registration forms need the ids, and names are not sensitive. */
  list(): Promise<Department[]> {
    return departmentRepository.list(prisma);
  },
};
