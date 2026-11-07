import Link from 'next/link';
import { MicroLabel } from '@/components/ui/micro-label';
import { Wordmark } from './wordmark';

const columns: { title: string; links: { label: string; href?: string }[] }[] = [
  {
    title: 'Departments',
    // Plain text until department pages exist.
    links: [{ label: 'CSE' }, { label: 'ECE' }, { label: 'BBA' }],
  },
  {
    title: 'Platform',
    links: [
      { label: 'Events', href: '/#events' },
      { label: 'Announcements', href: '/announcements' },
      { label: 'Blood', href: '/#blood' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-3 lg:grid-cols-5">
        <div className="sm:col-span-3 lg:col-span-2">
          <Wordmark />
          <p className="mt-3 max-w-[34ch] text-sm text-fg-secondary">
            Club management for university departments.
          </p>
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <MicroLabel as="h2">{column.title}</MicroLabel>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-fg-secondary">
              {column.links.map((link) => (
                <li key={link.label}>
                  {link.href ? (
                    <Link
                      href={link.href}
                      prefetch={link.href.startsWith('/#') ? undefined : false}
                      className="rounded-sm transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    link.label
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border">
        <p className="container-page py-4 font-mono text-xs text-fg-tertiary">
          &copy; 2026 UniConnect
        </p>
      </div>
    </footer>
  );
}
