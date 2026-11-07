import { ArrowRightIcon, CheckIcon } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { CommandChip } from '@/components/ui/command-chip';
import { Terminal, TerminalLine } from '@/components/ui/terminal';
import { cn } from '@/lib/utils';

const bootLines = [
  { name: 'departments', detail: 'CSE, ECE, BBA' },
  { name: 'clubs', detail: 'membership, roles' },
  { name: 'events', detail: 'cross-department' },
  { name: 'blood', detail: 'urgent requests' },
  { name: 'assistant', detail: 'what you can see' },
];

// CSS, not motion: the hero has to paint before any JavaScript loads.
const enter =
  'animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-(--duration-slow) ease-out';

export function Hero() {
  return (
    // Pulled up under the sticky header so its blur has something to act on at rest.
    <section className="relative -mt-14 overflow-hidden border-b border-border">
      <div aria-hidden="true" className="hero-glow pointer-events-none absolute inset-0" />

      <div className="relative container-page pt-28 pb-14 sm:pt-34 lg:pt-38 lg:pb-20">
        <div className={enter}>
          <CommandChip symbol=">">./uniconnect --init</CommandChip>
        </div>

        <h1 className={cn(enter, 'mt-5 max-w-4xl text-display-lg [animation-delay:60ms]')}>
          The Operating System for University Clubs.
        </h1>

        <div className="mt-8 grid gap-10 lg:mt-12 lg:grid-cols-12 lg:items-start lg:gap-8">
          <div className={cn(enter, 'lg:col-span-5 [animation-delay:120ms]')}>
            <p className="max-w-[46ch] text-lg text-fg-secondary">
              Unify department events, manage committee roles, and coordinate emergency blood
              requests through a single, intelligent platform.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/register" prefetch={false} className={buttonVariants({ size: 'lg' })}>
                Get Started
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
              <Link href="#clubs" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
                Explore Clubs
              </Link>
            </div>
          </div>

          <Terminal
            title="Campus init"
            className={cn(
              enter,
              'bg-surface-1/80 lg:col-span-6 lg:col-start-7 [animation-delay:160ms]',
            )}
          >
            <TerminalLine prompt>./uniconnect --init</TerminalLine>
            {bootLines.map((line, index) => (
              <TerminalLine
                key={line.name}
                style={{ animationDelay: `${260 + index * 90}ms` }}
                className={cn(enter, 'flex items-start gap-2 whitespace-normal')}
              >
                <CheckIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" />
                <span className="w-24 shrink-0 text-foreground">{line.name}</span>
                <span>{line.detail}</span>
              </TerminalLine>
            ))}
          </Terminal>
        </div>
      </div>
    </section>
  );
}
