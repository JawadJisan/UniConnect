'use client';

import type { UserProfile } from '@uniconnect/shared';
import { ImageDropZone, imageFileProblem } from '@/components/image-drop-zone';
import { Avatar } from '@/components/ui/avatar';
import { useUploadAvatar } from '@/hooks/use-me';

/** Why a chosen file can't be used as an avatar (the shared image limits). */
export const avatarFileProblem = imageFileProblem;

/** The profile photo: the shared drop zone, cropped to a square, with initials when empty. */
export function AvatarUpload({ profile }: { profile: UserProfile }) {
  const upload = useUploadAvatar();
  return (
    <ImageDropZone
      current={profile.avatar_url}
      fallback={<Avatar name={profile.name} size={96} className="border-none bg-surface-3" />}
      upload={(file) => upload.mutateAsync(file)}
      busy={upload.isPending}
      noun="photo"
      changeLabel="Change your photo"
      note="Cropped to a square."
      successMessage="Profile photo updated."
    />
  );
}
