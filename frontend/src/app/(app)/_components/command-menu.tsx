'use client';

import { HomeIcon, LogOutIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { visibleNav, type NavViewer } from './nav';

interface CommandMenuProps {
  viewer: NavViewer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
}

/** ⌘K palette for the workspace: the viewer's pages, the public site and sign out. */
export function CommandMenu({ viewer, open, onOpenChange, onSignOut }: CommandMenuProps) {
  const router = useRouter();

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Go to"
      description="Jump to a page or sign out."
    >
      <Command>
        <CommandInput placeholder="Search pages" aria-label="Search pages" />
        <CommandList>
          <CommandEmpty>Nothing matches that.</CommandEmpty>
          {visibleNav(viewer).map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map(({ label, href, Icon }) => (
                <CommandItem key={href} onSelect={() => go(href)}>
                  <Icon />
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="Account">
            <CommandItem onSelect={() => go('/')}>
              <HomeIcon />
              UniConnect home
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                onSignOut();
              }}
            >
              <LogOutIcon />
              Sign out
            </CommandItem>
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
  );
}
