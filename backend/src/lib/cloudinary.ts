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
  // The browser already cropped it to a framed square (D49); `fill` keeps any other client
  // to the same shape, centred, and delivery picks the format and quality.
  transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'center' }],
  allowed_formats: ['jpg', 'png', 'webp'],
};

const CLUB_LOGO_OPTIONS: UploadApiOptions = {
  folder: 'uniconnect/club-logos',
  resource_type: 'image',
  // One logo per club, replaced in place like avatars.
  overwrite: true,
  invalidate: true,
  // A square, like the club logo box; the browser crop already has this shape (D49).
  transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'center' }],
  allowed_formats: ['jpg', 'png', 'webp'],
};

const EVENT_POSTER_OPTIONS: UploadApiOptions = {
  folder: 'uniconnect/event-posters',
  resource_type: 'image',
  // One poster per event, replaced in place like logos.
  overwrite: true,
  invalidate: true,
  // 16:9, the event card's shape; the browser crop already has this shape (D49).
  transformation: [{ width: 1600, height: 900, crop: 'fill', gravity: 'center' }],
  allowed_formats: ['jpg', 'png', 'webp'],
};

/** A failed upload, with Cloudinary's HTTP code when it sent one. */
class CloudinaryUploadError extends Error {
  constructor(
    message: string,
    readonly httpCode?: number,
  ) {
    super(message);
  }
}

function upload(buffer: Buffer, options: UploadApiOptions): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err || !result) {
        reject(new CloudinaryUploadError(err?.message ?? 'empty upload response', err?.http_code));
      } else resolve(result);
    });
    stream.end(buffer);
  });
}

/**
 * 401 and 403 mean Cloudinary refused our credentials (a wrong key, secret or cloud name), so
 * every upload will fail until the env is fixed. Say so plainly in the log (D49).
 */
function failureLog(label: string, err: Error): string {
  const code = err instanceof CloudinaryUploadError ? err.httpCode : undefined;
  if (code === 401 || code === 403) {
    return (
      `${label} upload failed: Cloudinary rejected the credentials (HTTP ${code}): ${err.message}. ` +
      'Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (Settings -> API Keys).'
    );
  }
  return `${label} upload failed: ${err.message}`;
}

async function uploadImage(
  buffer: Buffer,
  options: UploadApiOptions,
  label: string,
): Promise<string> {
  if (!configured) {
    throw new AppError(503, 'UPLOAD_UNAVAILABLE', 'File uploads are not available right now.');
  }
  try {
    const result = await upload(buffer, options);
    return cloudinary.url(result.public_id, {
      secure: true,
      version: result.version,
      fetch_format: 'auto',
      quality: 'auto',
    });
  } catch (err) {
    // Message only: never log the client config, which holds the API secret.
    logger.error(failureLog(label, err as Error));
    throw new AppError(502, 'UPLOAD_FAILED', 'The image could not be uploaded. Try again.');
  }
}

/** Uploads a user's avatar and returns its HTTPS URL. */
export function uploadAvatar(userId: string, buffer: Buffer): Promise<string> {
  return uploadImage(buffer, { ...AVATAR_OPTIONS, public_id: userId }, `avatar for user ${userId}`);
}

/** Uploads a club's logo and returns its HTTPS URL (DECISIONS D31). */
export function uploadClubLogo(clubId: number, buffer: Buffer): Promise<string> {
  return uploadImage(
    buffer,
    { ...CLUB_LOGO_OPTIONS, public_id: `club-${clubId}` },
    `logo for club ${clubId}`,
  );
}

/** Uploads an event's poster and returns its HTTPS URL (PRD FR-EVENT-002, DECISIONS D36). */
export function uploadEventPoster(eventId: number, buffer: Buffer): Promise<string> {
  return uploadImage(
    buffer,
    { ...EVENT_POSTER_OPTIONS, public_id: `event-${eventId}` },
    `poster for event ${eventId}`,
  );
}
