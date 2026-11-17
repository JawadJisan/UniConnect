'use client';

import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@uniconnect/shared';
import { CropIcon, ImageUpIcon, Loader2Icon } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ImageCropDialog } from '@/components/image-crop-dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import type { ApiError } from '@/lib/api';
import type { OutputSize } from '@/lib/crop-image';
import { cn } from '@/lib/utils';

// Decision #21 limits, shared by every image upload (avatars, club logos, posters). The
// server limit applies to the cropped file we send, which is always far smaller.
const MAX_MB = AVATAR_MAX_BYTES / (1024 * 1024);
const ACCEPT = AVATAR_MIME_TYPES.join(',');
// The original is only read in the browser to be cropped, so a larger photo is fine (D49).
export const SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const SOURCE_MAX_MB = SOURCE_MAX_BYTES / (1024 * 1024);

const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

function typeProblem(file: File): string | null {
  return (AVATAR_MIME_TYPES as readonly string[]).includes(file.type)
    ? null
    : 'Choose a JPEG, PNG or WebP image.';
}

/** Why a file can't be uploaded as is, checked with the shared limits before any upload. */
export function imageFileProblem(file: File): string | null {
  const wrongType = typeProblem(file);
  if (wrongType) return wrongType;
  if (file.size > AVATAR_MAX_BYTES) {
    return `That image is ${megabytes(file.size)} MB. Choose one up to ${MAX_MB} MB.`;
  }
  return null;
}

/** Why a chosen file can't be opened in the cropper. */
export function sourceFileProblem(file: File): string | null {
  const wrongType = typeProblem(file);
  if (wrongType) return wrongType;
  if (file.size > SOURCE_MAX_BYTES) {
    return `That image is ${megabytes(file.size)} MB. Choose one up to ${SOURCE_MAX_MB} MB.`;
  }
  return null;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Plain words for the upload endpoints' errors. */
function uploadProblem(err: ApiError, noun: string): string {
  switch (err.code) {
    case 'INVALID_FILE_TYPE':
      return "That file isn't a JPEG, PNG or WebP image. Choose another.";
    case 'FILE_TOO_LARGE':
      return `The image must be ${MAX_MB} MB or smaller.`;
    case 'UPLOAD_UNAVAILABLE':
      return `${capitalize(noun)} uploads are switched off right now. Try again later.`;
    case 'UPLOAD_FAILED':
      return "The upload didn't go through. Try again.";
    case 'FORBIDDEN':
      return err.message;
    default:
      return err.status === 0 ? err.message : "The upload didn't go through. Try again.";
  }
}

/** An object URL that is released when it is replaced or the component goes away. */
function useObjectUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return [url, (blob: Blob | null) => setUrl(blob ? URL.createObjectURL(blob) : null)] as const;
}

interface ImageDropZoneProps {
  /** The stored image URL, or null. */
  current: string | null;
  /** Shown in the zone when there is no image (initials, a logo placeholder). */
  fallback: ReactNode;
  /** Sends the file; resolves once the server stored it. */
  upload: (file: File) => Promise<unknown>;
  busy: boolean;
  /** "photo", "logo": used in the button and status words. */
  noun: string;
  /** The zone's name when an image is already stored, e.g. "Change your photo". */
  changeLabel: string;
  /** Caption under the zone, after the type and size limits. */
  note: string;
  successMessage: string;
  /** Width / height of the stored image and of the zone: 1 (default) or 16 / 9. */
  aspect?: number;
  /** The cropper's guide: a circle for avatars, a rectangle otherwise. */
  cropShape?: 'round' | 'rect';
  /** The exact pixel size of the uploaded file. */
  output?: OutputSize;
  /** Keep transparency (club logos). */
  keepAlpha?: boolean;
}

const SQUARE_512: OutputSize = { width: 512, height: 512 };

/**
 * Drop or pick an image, frame it in the crop dialog, see it in place, then upload. The zone
 * is a real button (Enter or Space opens the picker), the shared type limits are checked
 * before the cropper opens, and what is sent is the cropped image at its display shape
 * (DESIGN.md §7, "Image drop zone"; DECISIONS D49).
 */
export function ImageDropZone({
  current,
  fallback,
  upload,
  busy,
  noun,
  changeLabel,
  note,
  successMessage,
  aspect = 1,
  cropShape = 'rect',
  output = SQUARE_512,
  keepAlpha = false,
}: ImageDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  // The picked original, kept so the crop can be adjusted again.
  const [source, setSource] = useState<File | null>(null);
  const [sourceUrl, setSourceBlob] = useObjectUrl();
  // The cropped file that will be uploaded, and its preview.
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreviewBlob] = useObjectUrl();
  const [cropping, setCropping] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function resetInput() {
    if (inputRef.current) inputRef.current.value = '';
  }

  function choose(next: File | undefined) {
    if (!next) return;
    const why = sourceFileProblem(next);
    if (why) {
      setProblem(why);
      resetInput();
      return;
    }
    setProblem(null);
    setSource(next);
    setSourceBlob(next);
    setCropping(true);
  }

  function clear() {
    setSource(null);
    setSourceBlob(null);
    setFile(null);
    setPreviewBlob(null);
    setProblem(null);
    setCropping(false);
    resetInput();
  }

  function cancelCrop() {
    setCropping(false);
    // Cancelling the first crop drops the pick; cancelling an adjustment keeps the last crop.
    if (!file) clear();
  }

  function applyCrop(cropped: File) {
    setCropping(false);
    const why = imageFileProblem(cropped);
    if (why) {
      setProblem(why);
      return;
    }
    setFile(cropped);
    setPreviewBlob(cropped);
  }

  async function send() {
    if (!file) return;
    setProblem(null);
    try {
      await upload(file);
      clear();
      toast.success(successMessage);
    } catch (thrown) {
      setProblem(uploadProblem(thrown as ApiError, noun));
    }
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) choose(event.dataTransfer.files[0]);
  }

  const shown = preview ?? current;
  const square = aspect === 1;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-describedby={hintId}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={square ? undefined : { aspectRatio: String(aspect) }}
        className={cn(
          'group/zone relative flex w-full items-center justify-center self-center overflow-hidden border border-dashed transition-[border-color,background-color] duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none disabled:cursor-progress',
          square ? 'aspect-square max-w-56' : 'max-w-xl',
          cropShape === 'round' ? 'rounded-full' : 'rounded-xl',
          dragging
            ? 'border-brand-text bg-brand-tint'
            : 'border-border-strong bg-surface-2 hover:border-input',
        )}
      >
        <span className="sr-only">
          {preview ? `Choose a different ${noun}` : shown ? changeLabel : `Add a ${noun}`}
        </span>
        {shown ? (
          // The stored image already has this shape; cover only trims older uploads.
          <Image
            src={shown}
            alt=""
            fill
            unoptimized
            sizes={square ? '224px' : '576px'}
            className="object-cover"
          />
        ) : (
          fallback
        )}
        {/* What the zone does, over the image on hover and focus; always visible when empty. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-background/80 py-2 text-xs text-foreground transition-opacity duration-(--duration-fast)',
            shown && !dragging
              ? 'opacity-0 group-hover/zone:opacity-100 group-focus-visible/zone:opacity-100'
              : 'opacity-100',
          )}
        >
          <ImageUpIcon className="size-3.5" />
          {dragging ? 'Drop to crop' : shown ? `Change ${noun}` : `Drop or choose a ${noun}`}
        </span>
        {busy ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-xs text-foreground">
            <Loader2Icon aria-hidden="true" className="size-5 animate-spin text-brand-text" />
            Uploading…
          </span>
        ) : null}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => choose(e.target.files?.[0])}
      />

      <p id={hintId} className="text-center text-xs text-fg-tertiary">
        JPEG, PNG or WebP, up to {SOURCE_MAX_MB} MB. {note}
      </p>

      {problem ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {problem}
        </p>
      ) : null}

      {file ? (
        <div className="flex flex-wrap items-center justify-center gap-2" aria-live="polite">
          <Button variant="ghost" size="sm" onClick={clear} disabled={busy}>
            Cancel
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCropping(true)} disabled={busy}>
            <CropIcon data-icon="inline-start" />
            Adjust crop
          </Button>
          <Button size="sm" onClick={send} disabled={busy}>
            {busy ? 'Uploading…' : `Upload ${noun}`}
          </Button>
        </div>
      ) : null}

      {cropping && sourceUrl ? (
        <ImageCropDialog
          open
          src={sourceUrl}
          aspect={aspect}
          cropShape={cropShape}
          output={output}
          keepAlpha={keepAlpha}
          fileName={source?.name ?? noun}
          noun={noun}
          onCancel={cancelCrop}
          onApply={applyCrop}
        />
      ) : null}
    </div>
  );
}
