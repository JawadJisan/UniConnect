'use client';

import {
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCcwSquareIcon,
  RotateCwSquareIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cropToFile, type OutputSize } from '@/lib/crop-image';
import { cn } from '@/lib/utils';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export interface ImageCropDialogProps {
  open: boolean;
  /** Object URL of the original image. */
  src: string | null;
  /** Width / height of the crop: 1 for avatars and logos, 16 / 9 for posters. */
  aspect: number;
  cropShape: 'round' | 'rect';
  /** The exact pixel size of the uploaded file. */
  output: OutputSize;
  /** Keep transparency (club logos). */
  keepAlpha: boolean;
  fileName: string;
  /** "photo", "logo", "poster". */
  noun: string;
  onCancel: () => void;
  onApply: (file: File) => void;
}

/**
 * Frame an image before it is uploaded: drag to move, pinch, wheel or slider to zoom, and
 * rotate. The result is drawn at the exact size and shape it is shown in (DECISIONS D49).
 * The parent mounts it once per crop, so every crop starts centred, unzoomed and upright.
 */
export function ImageCropDialog({
  open,
  src,
  aspect,
  cropShape,
  output,
  keepAlpha,
  fileName,
  noun,
  onCancel,
  onApply,
}: ImageCropDialogProps) {
  const zoomId = useId();
  const rotationId = useId();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  }

  function turn(by: number) {
    // Kept in -180..180 so the fine-rotation slider still shows a sensible value.
    setRotation((r) => ((((r + by + 180) % 360) + 360) % 360) - 180);
  }

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  async function apply() {
    if (!src || !area) return;
    setWorking(true);
    setProblem(null);
    try {
      const file = await cropToFile(src, area, rotation, output, { keepAlpha, name: fileName });
      onApply(file);
    } catch (err) {
      setProblem((err as Error).message || 'The image could not be cropped. Try another one.');
    } finally {
      setWorking(false);
    }
  }

  const shapeWords = aspect === 1 ? 'square' : '16:9';

  return (
    <Dialog open={open} onOpenChange={(next) => (next || working ? undefined : onCancel())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crop your {noun}</DialogTitle>
          <DialogDescription>
            Drag to move, zoom and rotate until it looks right. It is saved as a {shapeWords} image,
            exactly as framed here.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            'relative h-72 w-full overflow-hidden rounded-lg border border-border bg-surface-2 sm:h-80',
          )}
        >
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              cropShape={cropShape}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              showGrid
              objectFit="contain"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={(_, pixels) => setArea(pixels)}
              cropperProps={{ 'aria-label': `Crop area for the ${noun}` }}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor={zoomId} className="w-16 shrink-0 text-xs text-fg-secondary">
              Zoom
            </label>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom out"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            >
              <MinusIcon />
            </Button>
            <input
              id={zoomId}
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              aria-valuetext={`${Math.round(zoom * 100)}%`}
              onChange={(e) => setZoom(clampZoom(Number(e.target.value)))}
              className="h-6 min-w-0 flex-1 cursor-pointer accent-(--brand)"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom in"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            >
              <PlusIcon />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor={rotationId} className="w-16 shrink-0 text-xs text-fg-secondary">
              Rotate
            </label>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Rotate left 90 degrees"
              onClick={() => turn(-90)}
            >
              <RotateCcwSquareIcon />
            </Button>
            <input
              id={rotationId}
              type="range"
              min={-180}
              max={180}
              step={1}
              value={rotation}
              aria-valuetext={`${Math.round(rotation)} degrees`}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="h-6 min-w-0 flex-1 cursor-pointer accent-(--brand)"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Rotate right 90 degrees"
              onClick={() => turn(90)}
            >
              <RotateCwSquareIcon />
            </Button>
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={reset} disabled={working}>
              <RotateCcwIcon data-icon="inline-start" />
              Reset
            </Button>
          </div>
        </div>

        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={working}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={working || !area}>
            {working ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            {working ? 'Cropping…' : 'Apply crop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
