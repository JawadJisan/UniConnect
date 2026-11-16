import Image from 'next/image';
import { nameWords } from '@/lib/names';
import { cn } from '@/lib/utils';

/** Up to two initials from a display name, skipping titles: "Dr. Karim Hossain" → "KH". */
export function initials(name: string): string {
  const parts = nameWords(name);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
}

interface AvatarProps {
  name: string;
  /** The image URL (Cloudinary or a local preview). Without one, initials are shown. */
  src?: string | null;
  /** Rendered size in px. */
  size?: number;
  className?: string;
}

/**
 * A user's picture, or their initials on surface-3. The image is decorative next to the name
 * it always accompanies, so it carries an empty alt.
 */
function Avatar({ name, src, size = 32, className }: AvatarProps) {
  return (
    <span
      data-slot="avatar"
      style={{ width: size, height: size }}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-3 font-medium text-fg-secondary select-none',
        size >= 64 ? 'text-lg' : size >= 40 ? 'text-sm' : 'text-micro',
        className,
      )}
    >
      {src ? (
        // Cloudinary already delivers a sized, compressed image, and previews are blob: URLs,
        // so Next's optimizer would add nothing.
        <Image src={src} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}

export { Avatar };
