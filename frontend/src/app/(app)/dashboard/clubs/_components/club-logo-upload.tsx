'use client';

import type { ClubDetail } from '@uniconnect/shared';
import { ImageDropZone } from '@/components/image-drop-zone';
import { useUploadClubLogo } from '@/hooks/use-clubs';
import { Panel } from '../../../_components/panel';
import { ClubLogo } from './club-logo';

/** The club logo (DECISIONS D31): uploaded to Cloudinary, never set from a typed URL. */
export function ClubLogoUpload({ club }: { club: ClubDetail }) {
  const upload = useUploadClubLogo(club.id);
  return (
    <Panel
      id="club-logo-title"
      title="Logo"
      tag="SYS.CLUB.LOGO"
      description="Shown on the club page and in the club directory."
    >
      <ImageDropZone
        current={club.logo_url}
        fallback={<ClubLogo name={club.name} src={null} size={96} className="border-none" />}
        upload={(file) => upload.mutateAsync(file)}
        busy={upload.isPending}
        noun="logo"
        changeLabel="Change the club logo"
        note="Fitted inside 512 px, never cropped."
        successMessage="Club logo updated."
        fit="contain"
      />
    </Panel>
  );
}
