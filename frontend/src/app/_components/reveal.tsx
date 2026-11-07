'use client';

import { m, type Variants } from 'motion/react';
import type { ReactNode } from 'react';
import { duration, ease } from '@/lib/motion';

const group: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } },
};

type RevealProps = { className?: string; children: ReactNode };

// data-reveal lets the noscript rule on the home page show this content without JavaScript.
export function RevealGroup({ className, children }: RevealProps) {
  return (
    <m.div
      className={className}
      variants={group}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.1 }}
    >
      {children}
    </m.div>
  );
}

export function RevealItem({ className, children }: RevealProps) {
  return (
    <m.div data-reveal className={className} variants={item}>
      {children}
    </m.div>
  );
}
