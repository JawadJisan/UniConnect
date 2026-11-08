import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// One client per process. The adapter opens connections lazily, on the first query.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  // Neon suspends idle computes. Waking one can exceed Prisma's 2s default for starting a
  // transaction, so allow longer before giving up.
  transactionOptions: { maxWait: 10_000, timeout: 10_000 },
});
