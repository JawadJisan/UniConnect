import Image from 'next/image';
import { initials } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface ClubLogoProps {
  name: string;
  src: string | null;
  /** Rendered size in px. */
  size?: number;
  className?: string;
}

/**
 * A club's logo, fitted whole inside a rounded square, or the club's initials on surface-3.
 * Decorative: it always sits next to the club's name, so it carries an empty alt.
 */
export function ClubLogo({ name, src, size = 40, className }: ClubLogoProps) {
  return (
    <span
      data-slot="club-logo"
      style={{ width: size, height: size }}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-3 font-medium text-fg-secondary select-none',
        size >= 40 ? 'text-sm' : 'text-micro',
        className,
      )}
    >
      {src ? (
        // Cloudinary already delivers a sized, compressed image (see Avatar).
        <Image src={src} alt="" fill unoptimized sizes={`${size}px`} className="object-contain" />
      ) : (
        <span aria-hidden="true">{initials(name.replace(/\bclub\b/i, '').trim() || name)}</span>
      )}
    </span>
  );
}
