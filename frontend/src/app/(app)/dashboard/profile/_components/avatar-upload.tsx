'use client';

import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, type UserProfile } from '@uniconnect/shared';
import { ImageUpIcon, Loader2Icon } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useUploadAvatar } from '@/hooks/use-me';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAX_MB = AVATAR_MAX_BYTES / (1024 * 1024);
const ACCEPT = AVATAR_MIME_TYPES.join(',');

/** Why a chosen file can't be used, checked with the shared limits before any upload. */
export function avatarFileProblem(file: File): string | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a JPEG, PNG or WebP image.';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return `That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Choose one up to ${MAX_MB} MB.`;
  }
  return null;
}

/** Plain words for the upload endpoint's errors. */
function uploadProblem(err: ApiError): string {
  switch (err.code) {
    case 'INVALID_FILE_TYPE':
      return "That file isn't a JPEG, PNG or WebP image. Choose another.";
    case 'FILE_TOO_LARGE':
      return `The image must be ${MAX_MB} MB or smaller.`;
    case 'UPLOAD_UNAVAILABLE':
      return 'Photo uploads are switched off right now. Try again later.';
    case 'UPLOAD_FAILED':
      return "The upload didn't go through. Try again.";
    default:
      return err.status === 0 ? err.message : "The upload didn't go through. Try again.";
  }
}

/**
 * The signature move of the profile page: drop or pick an image, see it in place before
 * anything is sent, then upload. The zone is a real button (Enter or Space opens the picker),
 * and the shared type and size limits are checked before the network.
 */
export function AvatarUpload({ profile }: { profile: UserProfile }) {
  const upload = useUploadAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = upload.isPending;

  // Each preview URL is released when it is replaced or the component goes away.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function choose(next: File | undefined) {
    if (!next) return;
    const why = avatarFileProblem(next);
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
      await upload.mutateAsync(file);
      clear();
      toast.success('Profile photo updated.');
    } catch (thrown) {
      setProblem(uploadProblem(thrown as ApiError));
    }
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) choose(event.dataTransfer.files[0]);
  }

  const shown = preview ?? profile.avatar_url;

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
          {preview ? 'Choose a different photo' : shown ? 'Change your photo' : 'Add a photo'}
        </span>
        {shown ? (
          <Image src={shown} alt="" fill unoptimized sizes="224px" className="object-cover" />
        ) : (
          <Avatar name={profile.name} size={96} className="border-none bg-surface-3" />
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
          {dragging ? 'Drop to preview' : shown ? 'Change photo' : 'Drop or choose a photo'}
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
        JPEG, PNG or WebP, up to {MAX_MB} MB. Cropped to a square.
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
            {busy ? 'Uploading…' : 'Upload photo'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
