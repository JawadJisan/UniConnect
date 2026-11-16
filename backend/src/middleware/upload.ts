import {
  AVATAR_FIELD,
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  LOGO_FIELD,
  POSTER_FIELD,
} from '@uniconnect/shared';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { badRequest } from '../lib/http-error.js';

export const INVALID_TYPE_MESSAGE = 'Only JPEG, PNG or WebP images are allowed.';

/**
 * Parses a multipart body with one image in `field` into req.file, or fails with a 400.
 * Decision #21 limits (JPEG, PNG, WebP, 5 MB) apply to every image upload.
 */
export function imageUpload(field: string): RequestHandler {
  const single = multer({
    // Kept in memory and streamed to Cloudinary; 5 MB at most, so nothing touches the disk.
    storage: multer.memoryStorage(),
    limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 },
    fileFilter: (_req, file, cb) => {
      // The client sets the mimetype; the service also checks the file's magic bytes.
      if ((AVATAR_MIME_TYPES as readonly string[]).includes(file.mimetype)) cb(null, true);
      else cb(badRequest('INVALID_FILE_TYPE', INVALID_TYPE_MESSAGE));
    },
  }).single(field);

  return (req, res, next) => {
    if (!req.is('multipart/form-data')) {
      return next(badRequest('FILE_REQUIRED', 'Send the image as multipart/form-data.'));
    }
    single(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(badRequest('FILE_TOO_LARGE', 'The image must be 5 MB or smaller.'));
        }
        return next(badRequest('VALIDATION_ERROR', `Send one image in the "${field}" field.`));
      }
      if (err) return next(err);
      if (!req.file) {
        return next(badRequest('FILE_REQUIRED', `Send one image in the "${field}" field.`));
      }
      next();
    });
  };
}

/** PATCH /users/me/avatar: one image in the `avatar` field. */
export const avatarUpload = imageUpload(AVATAR_FIELD);

/** PATCH /clubs/:id/logo: one image in the `logo` field. */
export const logoUpload = imageUpload(LOGO_FIELD);

/** PATCH /events/:id/poster: one image in the `poster` field. */
export const posterUpload = imageUpload(POSTER_FIELD);
