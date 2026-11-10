'use client';

import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@uniconnect/shared';
import { ImageUpIcon, Loader2Icon } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

// Decision #21 limits, shared by every image upload (avatars, club logos).
const MAX_MB = AVATAR_MAX_BYTES / (1024 * 1024);
const ACCEPT = AVATAR_MIME_TYPES.join(',');

/** Why a chosen file can't be used, checked with the shared limits before any upload. */
export function imageFileProblem(file: File): string | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a JPEG, PNG or WebP image.';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return `That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Choose one up to ${MAX_MB} MB.`;
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
  /** `cover` crops to the square (avatars), `contain` keeps the whole image (logos). */
  fit?: 'cover' | 'contain';
}

/**
 * Drop or pick an image, see it in place before anything is sent, then upload. The zone is a
 * real button (Enter or Space opens the picker), and the shared type and size limits are
 * checked before the network (DESIGN.md §7, "Image drop zone").
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
  fit = 'cover',
}: ImageDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Each preview URL is released when it is replaced or the component goes away.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function choose(next: File | undefined) {
    if (!next) return;
    const why = imageFileProblem(next);
    if (why) {
      setProblem(why);
      return;
    }
    setProblem(null);
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  function clear() {
    setFile(null);
    setPreview(null);
    setProblem(null);
    if (inputRef.current) inputRef.current.value = '';
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
        className={cn(
          'group/zone relative flex aspect-square w-full max-w-56 items-center justify-center self-center overflow-hidden rounded-xl border border-dashed transition-[border-color,background-color] duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none disabled:cursor-progress',
          dragging
            ? 'border-brand-text bg-brand-tint'
            : 'border-border-strong bg-surface-2 hover:border-input',
        )}
      >
        <span className="sr-only">
          {preview ? `Choose a different ${noun}` : shown ? changeLabel : `Add a ${noun}`}
        </span>
        {shown ? (
          <Image
            src={shown}
            alt=""
            fill
            unoptimized
            sizes="224px"
            className={fit === 'cover' ? 'object-cover' : 'object-contain p-4'}
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
          {dragging ? 'Drop to preview' : shown ? `Change ${noun}` : `Drop or choose a ${noun}`}
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
        JPEG, PNG or WebP, up to {MAX_MB} MB. {note}
      </p>

      {problem ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {problem}
        </p>
      ) : null}

      {file ? (
        <div className="flex items-center justify-center gap-2" aria-live="polite">
          <Button variant="ghost" size="sm" onClick={clear} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={send} disabled={busy}>
            {busy ? 'Uploading…' : `Upload ${noun}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
