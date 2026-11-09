'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import type { Role, UserProfile } from '@uniconnect/shared';
import { MenuIcon, XIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CommandChipButton } from '@/components/ui/command-chip';
import { Kbd } from '@/components/ui/kbd';
import { useCommandK, useIsApplePlatform } from '@/hooks/use-command-k';
import { Wordmark } from '../../_components/wordmark';
import { CommandMenu } from './command-menu';
import { useSignOut } from './require-session';
import { activeHref, NAV, ROLE_LABEL } from './nav';
import { SidebarNav } from './sidebar-nav';

/** "STUDENT · CSE": the role and department, the two facts every page is scoped by. */
function AccountTag({ profile }: { profile: UserProfile }) {
  const role = ROLE_LABEL[profile.role];
  return (
    <span className="micro-label truncate">
      {profile.department ? `${role} · ${profile.department.name}` : role}
    </span>
  );
}

function SidebarFooter({ profile }: { profile: UserProfile }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border px-2 pt-3">
      <Avatar name={profile.name} src={profile.avatar_url} size={28} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-foreground">{profile.name}</span>
        <AccountTag profile={profile} />
      </div>
    </div>
  );
}

/** "You / Profile": where the visitor is, for the top bar. */
function useLocation() {
  const pathname = usePathname();
  const href = activeHref(pathname);
  for (const group of NAV) {
    const item = group.items.find((i) => i.href === href);
    if (item) return { group: group.label, page: item.label };
  }
  return null;
}

export function AppShell({ profile, children }: { profile: UserProfile; children: ReactNode }) {
  const signOut = useSignOut();
  const isApple = useIsApplePlatform();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const role: Role = profile.role;

  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  useCommandK(togglePalette);

  return (
    <div className="flex min-h-dvh flex-1">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface-2 px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-58 shrink-0 flex-col gap-6 border-r border-border bg-surface-1 px-3 pt-3.5 pb-3 lg:flex">
        <div className="flex h-5 items-center px-2">
          <Wordmark />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav role={role} />
        </div>
        <SidebarFooter profile={profile} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background px-(--gutter)">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1.5 lg:hidden"
          >
            <MenuIcon />
          </Button>
          {location ? (
            <p className="flex min-w-0 items-center gap-1.5 text-sm">
              <span className="hidden text-fg-tertiary sm:inline">{location.group}</span>
              <span aria-hidden="true" className="hidden text-fg-tertiary sm:inline">
                /
              </span>
              <span className="truncate font-medium text-foreground">{location.page}</span>
            </p>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <CommandChipButton
              symbol={null}
              onClick={() => setPaletteOpen(true)}
              className="mr-1 hidden gap-1.5 text-fg-tertiary md:inline-flex"
            >
              <Kbd className="h-4.5">{isApple ? '⌘K' : 'Ctrl K'}</Kbd> Go to
            </CommandChipButton>
            <span className="flex items-center gap-2" title={profile.email}>
              <Avatar name={profile.name} src={profile.avatar_url} size={28} />
              <span className="hidden max-w-40 truncate text-sm text-fg-secondary sm:inline">
                {profile.name}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
      </div>

      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/70 duration-(--duration-base) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-6 border-r border-border-strong bg-surface-1 px-3 pt-3 pb-3 shadow-overlay duration-(--duration-slow) ease-out outline-none data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left">
            <div className="flex h-7 items-center justify-between px-2">
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <Wordmark />
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon-sm" aria-label="Close navigation" />}
              >
                <XIcon />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav role={role} onNavigate={() => setDrawerOpen(false)} />
            </div>
            <SidebarFooter profile={profile} />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <CommandMenu
        role={role}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSignOut={signOut}
      />
    </div>
  );
}
