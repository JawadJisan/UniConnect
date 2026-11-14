'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '@/lib/utils';

/**
 * Base UI Tabs drawn with tokens (DESIGN.md §7 "Tabs"): a hairline list, each tab a text
 * button, the active one in foreground over a 2px `brand-text` underline. Arrow keys move
 * between tabs; the panel is labelled by its tab.
 */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-6', className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'flex max-w-full items-end gap-1 overflow-x-auto border-b border-border',
        className,
      )}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        '-mb-px inline-flex h-9 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-fg-secondary transition-colors outline-none',
        'hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring',
        'data-[active]:border-brand-text data-[active]:text-foreground',
        '[&_svg]:size-4 [&_svg]:text-fg-tertiary data-[active]:[&_svg]:text-brand-text',
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn('flex flex-col gap-6 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsPanel, TabsTab };
