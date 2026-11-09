import type { Db } from '../../repositories/audit.repository.js';

export const departmentRepository = {
  list(db: Db) {
    return db.department.findMany({
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
  },
};
