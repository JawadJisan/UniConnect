import { AVATAR_FIELD, AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@uniconnect/shared';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { badRequest } from '../lib/http-error.js';

export const INVALID_TYPE_MESSAGE = 'Only JPEG, PNG or WebP images are allowed.';

const avatarMulter = multer({
  // Kept in memory and streamed to Cloudinary; 5 MB at most, so nothing touches the disk.
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 },
  fileFilter: (_req, file, cb) => {
    // The client sets the mimetype; the service also checks the file's magic bytes.
    if ((AVATAR_MIME_TYPES as readonly string[]).includes(file.mimetype)) cb(null, true);
    else cb(badRequest('INVALID_FILE_TYPE', INVALID_TYPE_MESSAGE));
  },
}).single(AVATAR_FIELD);

/** Parses a multipart body with one `avatar` file into req.file, or fails with a 400. */
export const avatarUpload: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    return next(badRequest('FILE_REQUIRED', 'Send the image as multipart/form-data.'));
  }
  avatarMulter(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(badRequest('FILE_TOO_LARGE', 'The image must be 5 MB or smaller.'));
      }
      return next(badRequest('VALIDATION_ERROR', `Send one image in the "${AVATAR_FIELD}" field.`));
    }
    if (err) return next(err);
    if (!req.file) {
      return next(badRequest('FILE_REQUIRED', `Send one image in the "${AVATAR_FIELD}" field.`));
    }
    next();
  });
};
