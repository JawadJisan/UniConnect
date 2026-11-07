'use client';

import { CalendarIcon, DropletIcon, MegaphoneIcon, UsersIcon } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd, KbdGroup } from '@/components/ui/kbd';

const destinations = [
  { label: 'Browse clubs', Icon: UsersIcon, keys: ['G', 'C'] },
  { label: 'Upcoming events', Icon: CalendarIcon, keys: ['G', 'E'] },
  { label: 'Announcements', Icon: MegaphoneIcon, keys: ['G', 'A'] },
  { label: 'Blood requests', Icon: DropletIcon, keys: ['G', 'B'] },
];

function PaletteItems() {
  return (
    <CommandList>
      <CommandEmpty>Nothing found.</CommandEmpty>
      <CommandGroup heading="Go to">
        {destinations.map(({ label, Icon, keys }) => (
          <CommandItem key={label}>
            <Icon />
            {label}
            <CommandShortcut>
              {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </CommandShortcut>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  );
}

export function InteractiveDemo() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Dialog>
          <DialogTrigger render={<Button variant="secondary" />}>Open dialog</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create announcement</DialogTitle>
              <DialogDescription>Members of the selected club will see this.</DialogDescription>
            </DialogHeader>
            <label className="flex flex-col gap-1.5 text-sm text-fg-secondary">
              Title
              <Input placeholder="General meeting" />
            </label>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
              <DialogClose render={<Button />}>Publish</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button variant="secondary" onClick={() => setPaletteOpen(true)}>
          Open palette
          <KbdGroup>
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>

        <CommandChipButton aria-pressed={showPanel} onClick={() => setShowPanel((show) => !show)}>
          toggle-panel
        </CommandChipButton>
      </div>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <Command>
          <CommandInput placeholder="Search" />
          <PaletteItems />
        </Command>
      </CommandDialog>

      <AnimatePresence initial={false}>
        {showPanel ? (
          <m.div
            key="panel"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="hairline max-w-md rounded-lg bg-surface-1 p-4 text-sm text-fg-secondary"
          >
            This panel enters and exits with the shared motion tokens.
          </m.div>
        ) : null}
      </AnimatePresence>

      <div className="hairline max-w-md overflow-hidden rounded-xl">
        <Command>
          <CommandInput placeholder="Search" />
          <PaletteItems />
        </Command>
      </div>
    </div>
  );
}
