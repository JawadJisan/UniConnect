'use client';

import {
  BotIcon,
  CalendarIcon,
  DropletIcon,
  LogInIcon,
  MenuIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { CommandChipButton } from '@/components/ui/command-chip';
import { Kbd } from '@/components/ui/kbd';
import { sampleEvents } from './sample-events';
import { Wordmark } from './wordmark';

const sections = [
  {
    label: 'Clubs',
    href: '/#clubs',
    Icon: UsersIcon,
    keywords: ['CSE', 'ECE', 'BBA', 'department', 'membership', 'committee'],
  },
  { label: 'Events', href: '/#events', Icon: CalendarIcon, keywords: ['register', 'public'] },
  {
    label: 'Blood Network',
    href: '/#blood',
    Icon: DropletIcon,
    keywords: ['donor', 'donation', 'request'],
  },
  { label: 'AI Chatbot', href: '/#ai', Icon: BotIcon, keywords: ['assistant', 'ask', 'gemini'] },
];

const account = [
  { label: 'Log in', href: '/login', Icon: LogInIcon },
  { label: 'Sign up', href: '/register', Icon: UserPlusIcon },
];

const subscribeToNothing = () => () => {};

function useIsApplePlatform() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => true,
  );
}

export function SiteHeader() {
  const router = useRouter();
  const isApple = useIsApplePlatform();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setQuery('');
        setOpen((current) => !current);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function go(href: string) {
    setQuery('');
    setOpen(false);
    router.push(href);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/75 backdrop-blur-md">
      <div className="container-page flex h-14 items-center gap-6">
        <Wordmark />

        <nav aria-label="Main" className="hidden items-center gap-5 lg:flex">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-sm text-sm text-fg-secondary transition-colors hover:text-foreground"
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <CommandChipButton
            data-needs-js
            symbol={null}
            onClick={() => setOpen(true)}
            className="mr-2 hidden gap-1.5 text-fg-tertiary lg:inline-flex"
          >
            Press <Kbd className="h-4.5">{isApple ? '⌘K' : 'Ctrl K'}</Kbd> to search
          </CommandChipButton>
          <Link
            href="/login"
            prefetch={false}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Log in
          </Link>
          <Link
            href="/register"
            prefetch={false}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            Sign up
          </Link>
          <Button
            data-needs-js
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="lg:hidden"
          >
            <MenuIcon />
          </Button>
        </div>
      </div>

      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setQuery('');
          setOpen(next);
        }}
        title="Search UniConnect"
        description="Find a section, a sample event or your account."
      >
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search sections and events"
            aria-label="Search UniConnect"
          />
          <CommandList>
            <CommandEmpty>Nothing matches that.</CommandEmpty>
            <CommandGroup heading="Go to">
              {sections.map(({ label, href, Icon, keywords }) => (
                <CommandItem key={href} keywords={keywords} onSelect={() => go(href)}>
                  <Icon />
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
            {query ? (
              <CommandGroup heading="Sample events">
                {sampleEvents.map((event) => (
                  <CommandItem
                    key={event.title}
                    keywords={[event.club, event.departments]}
                    onSelect={() => go('/#events')}
                  >
                    <CalendarIcon />
                    {event.title}
                    <CommandShortcut className="font-mono text-xs text-fg-tertiary">
                      {event.date}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Account">
              {account.map(({ label, href, Icon }) => (
                <CommandItem key={href} onSelect={() => go(href)}>
                  <Icon />
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="mt-1 hidden items-center gap-4 border-t border-border px-2 pt-2 pb-1 text-xs text-fg-tertiary [@media(pointer:fine)]:flex">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              Move
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Enter</Kbd>
              Open
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              Close
            </span>
          </div>
        </Command>
      </CommandDialog>
    </header>
  );
}
