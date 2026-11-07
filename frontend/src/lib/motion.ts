// Mirrors the motion tokens in globals.css.
export const ease = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

// Seconds, as the motion library expects.
export const duration = {
  fast: 0.12,
  base: 0.18,
  slow: 0.28,
} as const;
