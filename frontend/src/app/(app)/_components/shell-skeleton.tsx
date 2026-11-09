import { Skeleton } from '@/components/ui/skeleton';

/** The shell's outline while the session and profile load, so nothing jumps when they arrive. */
export function ShellSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your account" className="flex min-h-dvh flex-1">
      <div className="hidden w-58 shrink-0 flex-col gap-6 border-r border-border bg-surface-1 px-3 py-4 lg:flex">
        <Skeleton className="h-5 w-28" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center justify-between border-b border-border px-(--gutter)">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="size-7 rounded-full" />
        </div>
        <div className="container-wide flex flex-col gap-6 py-8">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
