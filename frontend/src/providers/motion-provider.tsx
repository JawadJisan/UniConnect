'use client';

import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { duration, ease } from '@/lib/motion';

// strict makes the full `motion.*` components throw, so use `m.*` to keep the bundle small.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: duration.base, ease: ease.out }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
