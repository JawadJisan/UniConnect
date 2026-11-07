import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { sampleEvents } from './sample-events';

export function EventsTeaser() {
  return (
    <section
      id="events"
      aria-labelledby="events-heading"
      className="section-y scroll-mt-14 border-b border-border"
    >
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h2 id="events-heading" className="max-w-2xl text-display-md">
            What&apos;s on across departments.
          </h2>
          <Badge variant="outline">Sample data</Badge>
        </div>
        <p className="mt-4 max-w-[58ch] text-md text-fg-secondary">
          Every event shows when it runs, who hosts it and who can get in. These examples show the
          layout. Real events appear here once clubs start publishing.
        </p>

        <div className="hairline mt-8 overflow-hidden rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="hidden md:table-cell">When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="hidden lg:table-cell">Host</TableHead>
                <TableHead className="hidden md:table-cell">Open to</TableHead>
                <TableHead className="text-right">Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleEvents.map((event) => (
                <TableRow key={event.title}>
                  <TableCell className="hidden font-mono text-xs text-fg-secondary md:table-cell">
                    <span className="text-foreground">{event.date}</span> {event.time}
                  </TableCell>
                  <TableCell className="py-3 whitespace-normal text-foreground">
                    {event.title}
                    <span className="mt-1 block font-mono text-xs text-fg-tertiary md:hidden">
                      {event.date} {event.time}
                      <br />
                      {event.club}, open to {event.departments}
                    </span>
                    <span className="mt-0.5 hidden text-xs text-fg-tertiary md:block lg:hidden">
                      {event.club}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-fg-secondary lg:table-cell">
                    {event.club}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-fg-secondary md:table-cell">
                    {event.departments}
                  </TableCell>
                  <TableCell className="text-right align-top md:align-middle">
                    <Badge variant={event.visibility === 'PUBLIC' ? 'secondary' : 'default'}>
                      {event.visibility}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
