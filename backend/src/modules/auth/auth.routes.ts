import { registerFacultySchema, registerStudentSchema } from '@uniconnect/shared';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from '../../config/env.js';
import { redis } from '../../lib/redis.js';
import { validateBody } from '../../middleware/validate.js';
import { authController } from './auth.controller.js';

// Per IP (req.ip, which `trust proxy` resolves to the client behind the Next.js hop).
// RedisStore loads its script when constructed, so tests (which mock Redis) skip it entirely.
const registerLimiter: RequestHandler =
  env.NODE_ENV === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({
        windowMs: 60 * 60 * 1000,
        limit: 10,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many registration attempts. Try again later.',
          },
        },
        store: new RedisStore({
          prefix: 'rl:register:',
          sendCommand: (command: string, ...args: string[]) =>
            redis.call(command, ...args) as Promise<RedisReply>,
        }),
      });

export const authRouter = Router();

authRouter.post(
  '/register/student',
  registerLimiter,
  validateBody(registerStudentSchema),
  authController.registerStudent,
);
authRouter.post(
  '/register/faculty',
  registerLimiter,
  validateBody(registerFacultySchema),
  authController.registerFaculty,
);
