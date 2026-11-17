import { ImageResponse } from 'next/og';

// The home-screen icon: the same mark as icon.svg, full-bleed (iOS rounds the corners).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07060e',
      }}
    >
      <svg width="132" height="132" viewBox="0 0 32 32">
        <path
          d="M10 6.5v9a6 6 0 0 0 12 0v-9"
          fill="none"
          stroke="#a9a8ff"
          strokeWidth="3.25"
          strokeLinecap="round"
        />
        <rect x="9" y="24.5" width="14" height="2.75" rx="1.375" fill="#5b57e8" />
      </svg>
    </div>,
    size,
  );
}
