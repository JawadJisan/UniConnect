import { encodeCanvas, rotatedSize } from '@/lib/crop-image';

// The pure parts of the client-side crop (DECISIONS D49). jsdom has no canvas, so the
// encoder is driven through stubbed toBlob and getContext.

describe('rotatedSize', () => {
  it('keeps the size upright and swaps it at 90 and 270 degrees', () => {
    expect(rotatedSize(400, 300, 0)).toEqual({ width: 400, height: 300 });
    expect(rotatedSize(400, 300, 90)).toEqual({ width: 300, height: 400 });
    expect(rotatedSize(400, 300, -90)).toEqual({ width: 300, height: 400 });
    expect(rotatedSize(400, 300, 180)).toEqual({ width: 400, height: 300 });
  });

  it('grows to the bounding box at 45 degrees', () => {
    // (400 + 300) * cos 45° ≈ 494.97
    expect(rotatedSize(400, 300, 45)).toEqual({ width: 495, height: 495 });
  });
});

describe('encodeCanvas', () => {
  const ctx = { fillStyle: '', fillRect: jest.fn(), drawImage: jest.fn() };
  let produces: (requested: string) => string;

  beforeEach(() => {
    ctx.fillRect.mockClear();
    ctx.drawImage.mockClear();
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      cb: BlobCallback,
      type?: string,
    ) {
      cb(new Blob(['x'], { type: produces(type ?? 'image/png') }));
    });
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => jest.restoreAllMocks());

  const canvas = () => Object.assign(document.createElement('canvas'), { width: 8, height: 8 });

  it('uses WebP when the browser can encode it', async () => {
    produces = (t) => t;
    expect((await encodeCanvas(canvas(), false)).type).toBe('image/webp');
    expect((await encodeCanvas(canvas(), true)).type).toBe('image/webp');
  });

  // Safari answers a WebP request with a PNG.
  it('falls back to JPEG on a white background when transparency does not matter', async () => {
    produces = (t) => (t === 'image/webp' ? 'image/png' : t);
    const blob = await encodeCanvas(canvas(), false);
    expect(blob.type).toBe('image/jpeg');
    expect(ctx.fillStyle).toBe('#ffffff');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 8, 8);
  });

  it('falls back to PNG when transparency must be kept', async () => {
    produces = (t) => (t === 'image/webp' ? 'image/png' : t);
    expect((await encodeCanvas(canvas(), true)).type).toBe('image/png');
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
