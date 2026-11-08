import { Router } from 'express';
import { departmentController } from './department.controller.js';

export const departmentRouter = Router();

departmentRouter.get('/', departmentController.list);
