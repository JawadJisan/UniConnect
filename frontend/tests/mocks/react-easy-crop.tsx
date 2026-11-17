import { useEffect } from 'react';

// Stands in for react-easy-crop: jsdom has no layout or canvas. It reports one crop as soon
// as it mounts, like the real cropper does once the image loads, and exposes its settings.
export const FAKE_CROP_PIXELS = { x: 10, y: 20, width: 300, height: 300 };

interface Props {
  aspect: number;
  cropShape: 'round' | 'rect';
  rotation: number;
  zoom: number;
  onCropComplete?: (area: typeof FAKE_CROP_PIXELS, pixels: typeof FAKE_CROP_PIXELS) => void;
  cropperProps?: { 'aria-label'?: string };
}

export default function Cropper({
  aspect,
  cropShape,
  rotation,
  zoom,
  onCropComplete,
  cropperProps,
}: Props) {
  useEffect(() => {
    onCropComplete?.(FAKE_CROP_PIXELS, FAKE_CROP_PIXELS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);
  return (
    <div
      role="img"
      aria-label={cropperProps?.['aria-label']}
      data-aspect={aspect}
      data-shape={cropShape}
      data-rotation={rotation}
      data-zoom={zoom}
    />
  );
}
