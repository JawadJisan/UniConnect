// Cloudinary client. The only module that talks to Cloudinary, so tests mock this file and
// never reach the real service (.claude/rules/testing.md).
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';
import { env } from '../config/env.js';
import { AppError } from './http-error.js';
import { logger } from './logger.js';

const configured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

if (configured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const AVATAR_OPTIONS: UploadApiOptions = {
  folder: 'uniconnect/avatars',
  resource_type: 'image',
  // One image per user: a new upload replaces the old one, so no orphans pile up, and the
  // CDN copy is invalidated. The URL changes anyway because it carries the version.
  overwrite: true,
  invalidate: true,
  // Stored at a bounded size; delivery picks the format and quality.
  transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }],
  allowed_formats: ['jpg', 'png', 'webp'],
};

function upload(buffer: Buffer, options: UploadApiOptions): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err || !result) reject(new Error(err?.message ?? 'empty upload response'));
      else resolve(result);
    });
    stream.end(buffer);
  });
}

/** Uploads a user's avatar and returns its HTTPS URL. */
export async function uploadAvatar(userId: string, buffer: Buffer): Promise<string> {
  if (!configured) {
    throw new AppError(503, 'UPLOAD_UNAVAILABLE', 'File uploads are not available right now.');
  }
  try {
    const result = await upload(buffer, { ...AVATAR_OPTIONS, public_id: userId });
    return cloudinary.url(result.public_id, {
      secure: true,
      version: result.version,
      fetch_format: 'auto',
      quality: 'auto',
    });
  } catch (err) {
    // Message only: never log the client config, which holds the API secret.
    logger.error(`avatar upload for user ${userId} failed: ${(err as Error).message}`);
    throw new AppError(502, 'UPLOAD_FAILED', 'The image could not be uploaded. Try again.');
  }
}
