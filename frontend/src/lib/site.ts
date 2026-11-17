// The product name and tab-title shape, shared by the root metadata template and
// useDocumentTitle so the two can't drift (DECISIONS D50).
export const SITE_NAME = 'UniConnect';
export const TITLE_SEPARATOR = ' — ';

/** "Events — UniConnect". */
export const pageTitle = (name: string) => `${name}${TITLE_SEPARATOR}${SITE_NAME}`;

export const SITE_DESCRIPTION =
  'University club management: memberships, events, announcements and blood donation.';
