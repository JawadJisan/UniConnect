'use client';

import type { Role } from '@uniconnect/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MicroLabel } from '@/components/ui/micro-label';
import { cn } from '@/lib/utils';
import { activeHref, visibleNav } from './nav';

/** The role's navigation groups. Used by the desktop sidebar and the mobile drawer. */
export function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeHref(pathname);

  return (
    <nav aria-label="Workspace" className="flex flex-col gap-5">
      {visibleNav(role).map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <MicroLabel as="h2" className="px-2 pb-1">
            {group.label}
          </MicroLabel>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ label, href, Icon }) => {
              const current = href === active;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={current ? 'page' : undefined}
                    onClick={onNavigate}
                    className={cn(
                      'flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-(--duration-fast)',
                      current
                        ? 'bg-surface-3 font-medium text-foreground'
                        : 'text-fg-secondary hover:bg-surface-2 hover:text-foreground',
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn('size-4', current ? 'text-brand-text' : 'text-fg-tertiary')}
                    />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
