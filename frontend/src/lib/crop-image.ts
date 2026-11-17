// Turns a react-easy-crop selection into the exact file we upload: cropped, rotated and
// resized in the browser to the shape it is shown in (DECISIONS D49).

export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OutputSize {
  width: number;
  height: number;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('The image could not be read.')));
    img.src = url;
  });
}

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/** The bounding box of a `width × height` image rotated by `deg` degrees. */
export function rotatedSize(width: number, height: number, deg: number): OutputSize {
  const r = toRadians(deg);
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  return {
    width: Math.round(cos * width + sin * height),
    height: Math.round(sin * width + cos * height),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/**
 * Encodes the canvas as WebP. Browsers that can't encode WebP (Safari) hand back PNG instead;
 * then we use PNG when transparency matters and JPEG otherwise, so the file stays small.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, keepAlpha: boolean): Promise<Blob> {
  const webp = await canvasToBlob(canvas, 'image/webp', 0.9);
  if (webp && webp.type === 'image/webp') return webp;
  if (keepAlpha) {
    const png = webp?.type === 'image/png' ? webp : await canvasToBlob(canvas, 'image/png');
    if (png) return png;
  } else {
    // JPEG has no alpha: paint transparent pixels white rather than black.
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const ctx = flat.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(canvas, 0, 0);
      const jpeg = await canvasToBlob(flat, 'image/jpeg', 0.9);
      if (jpeg) return jpeg;
    }
  }
  throw new Error('The cropped image could not be encoded.');
}

/**
 * Crops `src` to `area` (pixels of the image after `rotation`, as react-easy-crop reports
 * them) and draws it at exactly `output`, then returns it as a File for the upload hooks.
 */
export async function cropToFile(
  src: string,
  area: PixelArea,
  rotation: number,
  output: OutputSize,
  opts: { keepAlpha: boolean; name: string },
): Promise<File> {
  const image = await loadImage(src);

  // 1. The whole image, rotated about its centre, on a canvas sized to its bounding box.
  const bounds = rotatedSize(image.naturalWidth, image.naturalHeight, rotation);
  const rotated = document.createElement('canvas');
  rotated.width = bounds.width;
  rotated.height = bounds.height;
  const rctx = rotated.getContext('2d');
  if (!rctx) throw new Error('This browser cannot crop images.');
  rctx.translate(bounds.width / 2, bounds.height / 2);
  rctx.rotate(toRadians(rotation));
  rctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

  // 2. The selected area, scaled to the output size.
  const out = document.createElement('canvas');
  out.width = output.width;
  out.height = output.height;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('This browser cannot crop images.');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(
    rotated,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    output.width,
    output.height,
  );

  const blob = await encodeCanvas(out, opts.keepAlpha);
  const base = opts.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${base}.${EXTENSIONS[blob.type] ?? 'img'}`, { type: blob.type });
}
