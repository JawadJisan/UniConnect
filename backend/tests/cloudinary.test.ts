import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// src/lib/cloudinary.ts with the `cloudinary` SDK mocked: the stored shape of each image
// (D49) and what a refused upload logs. No test reaches the real service.

type Callback = (err?: { message: string; http_code?: number }, result?: unknown) => void;

const uploadStream = jest.fn<(options: Record<string, unknown>, cb: Callback) => unknown>();
const logError = jest.fn<(message: string) => void>();
let answer: { err?: { message: string; http_code?: number }; result?: unknown };

jest.unstable_mockModule('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    url: (id: string, o: { version: number }) =>
      `https://res.cloudinary.com/demo/v${o.version}/${id}`,
    uploader: {
      upload_stream: (options: Record<string, unknown>, cb: Callback) => {
        uploadStream(options, cb);
        return { end: () => cb(answer.err, answer.result) };
      },
    },
  },
}));
jest.unstable_mockModule('../src/config/env.js', () => ({
  env: {
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: '123456789012345',
    CLOUDINARY_API_SECRET: 'secret',
  },
}));
jest.unstable_mockModule('../src/lib/logger.js', () => ({ logger: { error: logError } }));

const { uploadAvatar, uploadClubLogo, uploadEventPoster } =
  await import('../src/lib/cloudinary.js');

const ok = (publicId: string) => ({ result: { public_id: publicId, version: 7 } });
const optionsOfLastUpload = () => uploadStream.mock.calls.at(-1)![0];

beforeEach(() => {
  uploadStream.mockClear();
  logError.mockClear();
});

describe('stored image shapes (D49)', () => {
  it('stores an avatar as a centred 512 square under the user id', async () => {
    answer = ok('uniconnect/avatars/u1');
    await expect(uploadAvatar('u1', Buffer.from('x'))).resolves.toBe(
      'https://res.cloudinary.com/demo/v7/uniconnect/avatars/u1',
    );
    expect(optionsOfLastUpload()).toMatchObject({
      folder: 'uniconnect/avatars',
      public_id: 'u1',
      overwrite: true,
      transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'center' }],
    });
  });

  it('stores a club logo as a 512 square', async () => {
    answer = ok('uniconnect/club-logos/club-3');
    await uploadClubLogo(3, Buffer.from('x'));
    expect(optionsOfLastUpload()).toMatchObject({
      public_id: 'club-3',
      transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'center' }],
    });
  });

  it('stores a poster at 1600x900, the 16:9 event card shape', async () => {
    answer = ok('uniconnect/event-posters/event-9');
    await uploadEventPoster(9, Buffer.from('x'));
    expect(optionsOfLastUpload()).toMatchObject({
      public_id: 'event-9',
      transformation: [{ width: 1600, height: 900, crop: 'fill', gravity: 'center' }],
    });
  });
});

describe('a refused upload', () => {
  it('answers 502 UPLOAD_FAILED and names the credentials when Cloudinary says 401', async () => {
    answer = { err: { message: 'Invalid api_key 7df21a7f', http_code: 401 } };
    await expect(uploadAvatar('u1', Buffer.from('x'))).rejects.toMatchObject({
      status: 502,
      code: 'UPLOAD_FAILED',
    });
    const line = logError.mock.calls[0]![0];
    expect(line).toContain('Cloudinary rejected the credentials (HTTP 401)');
    expect(line).toContain('CLOUDINARY_API_KEY');
    expect(line).not.toContain('secret');
  });

  it('logs any other failure as it came', async () => {
    answer = { err: { message: 'Request Timeout', http_code: 499 } };
    await expect(uploadEventPoster(1, Buffer.from('x'))).rejects.toMatchObject({
      code: 'UPLOAD_FAILED',
    });
    expect(logError).toHaveBeenCalledWith('poster for event 1 upload failed: Request Timeout');
  });
});
