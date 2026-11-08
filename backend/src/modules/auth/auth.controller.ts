import type { RegisterFacultyInput, RegisterStudentInput } from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { registrationService, type RegisteredUser } from './registration.service.js';

const MESSAGE = 'Registration successful. Please verify your email.';

function created(res: Response, user: RegisteredUser) {
  res.status(201).json({ success: true, message: MESSAGE, data: user });
}

export const authController = {
  async registerStudent(req: Request, res: Response) {
    created(
      res,
      await registrationService.registerStudent(req.body as RegisterStudentInput, req.ip ?? null),
    );
  },

  async registerFaculty(req: Request, res: Response) {
    created(
      res,
      await registrationService.registerFaculty(req.body as RegisterFacultyInput, req.ip ?? null),
    );
  },
};
