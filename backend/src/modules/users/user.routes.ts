import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { avatarUpload } from '../../middleware/upload.js';
import { userController } from './user.controller.js';

export const userRouter = Router();

// Every route here acts on the caller's own row, so authentication is the only gate. PATCH
// /me validates in the service, because the allowed fields depend on the caller's user_type.
userRouter.use(requireAuth);

userRouter.get('/me', userController.getMe);
userRouter.patch('/me', userController.updateMe);
userRouter.patch('/me/avatar', avatarUpload, userController.updateAvatar);
