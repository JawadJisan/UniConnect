import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CommandChip } from '@/components/ui/command-chip';
import { Input } from '@/components/ui/input';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { MicroLabel } from '@/components/ui/micro-label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Terminal, TerminalLine } from '@/components/ui/terminal';
import { InteractiveDemo } from './interactive-demo';

export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false },
};

const swatches = [
  { name: 'canvas', className: 'bg-background' },
  { name: 'surface-1', className: 'bg-surface-1' },
  { name: 'surface-2', className: 'bg-surface-2' },
  { name: 'surface-3', className: 'bg-surface-3' },
  { name: 'brand', className: 'bg-brand' },
  { name: 'brand-tint', className: 'bg-brand-tint' },
  { name: 'success', className: 'bg-success' },
  { name: 'warning', className: 'bg-warning' },
  { name: 'danger', className: 'bg-destructive' },
];

const typeScale = [
  { name: 'display-lg', className: 'text-display-lg' },
  { name: 'display-md', className: 'text-display-md' },
  { name: 'display-sm', className: 'text-display-sm' },
  { name: 'lg 17', className: 'text-lg' },
  { name: 'md 15', className: 'text-md' },
  { name: 'base 14', className: 'text-base' },
  { name: 'sm 13', className: 'text-sm' },
  { name: 'xs 12', className: 'text-xs' },
  { name: 'micro 11', className: 'text-micro' },
];

const members = [
  {
    name: 'Sample Member One',
    club: 'Robotics Club',
    plan: 'Yearly',
    fee: '1,200.00',
    status: 'Active',
  },
  {
    name: 'Sample Member Two',
    club: 'Debate Society',
    plan: 'Monthly',
    fee: '150.00',
    status: 'Pending',
  },
  {
    name: 'Sample Member Three',
    club: 'Photography Club',
    plan: 'Monthly',
    fee: '150.00',
    status: 'Expired',
  },
] as const;

const statusVariant = { Active: 'success', Pending: 'warning', Expired: 'destructive' } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-10">
      <h2 className="mb-5 text-display-sm">{title}</h2>
      {children}
    </section>
  );
}

// Dev-only reference for docs/DESIGN.md. Safe to delete without affecting the app.
export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <main className="container-page section-y">
      <h1 className="text-display-lg">Design system</h1>
      <p className="mt-3 max-w-prose text-md text-fg-secondary">
        Every token and component in one place. The rules are in{' '}
        <code className="font-mono text-sm">docs/DESIGN.md</code>, and the{' '}
        <Link className="link" href="/">
          home page
        </Link>{' '}
        shows the placeholder app.
      </p>

      <div className="mt-10">
        <Section title="Color">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {swatches.map((swatch) => (
              <li key={swatch.name}>
                <div className={`h-14 rounded-lg border border-border ${swatch.className}`} />
                <MicroLabel as="p" className="mt-2">
                  {swatch.name}
                </MicroLabel>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-1">
            <p className="text-foreground">Primary text, for headings and content.</p>
            <p className="text-fg-secondary">Secondary text, for supporting content.</p>
            <p className="text-fg-tertiary">Tertiary text, for metadata and placeholders.</p>
            <p className="text-brand-text">Brand text, for links and active states.</p>
          </div>
        </Section>

        <Section title="Type">
          <ul className="space-y-4">
            {typeScale.map((item) => (
              <li
                key={item.name}
                className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <MicroLabel className="sm:w-24 sm:shrink-0">{item.name}</MicroLabel>
                <span className={`min-w-0 ${item.className}`}>Campus clubs</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 font-mono text-sm text-fg-secondary">
            JetBrains Mono: 0123456789 BDT 1,200.00
          </p>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Join club</Button>
            <Button variant="secondary">View events</Button>
            <Button variant="outline">Export</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive">Remove</Button>
            <Button variant="link">Read more</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="xs">Extra small</Button>
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
          </div>
        </Section>

        <Section title="Badges and chips">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Featured</Badge>
            <Badge variant="secondary">Draft</Badge>
            <Badge variant="outline">Dept</Badge>
            <Badge variant="success">Active</Badge>
            <Badge variant="warning">Pending</Badge>
            <Badge variant="destructive">Expired</Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CommandChip>events</CommandChip>
            <CommandChip>clubs</CommandChip>
            <KbdGroup>
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </div>
          <div className="mt-5">
            <Terminal title="Event check-in" className="max-w-xl">
              <TerminalLine prompt>check-in --event spring-fair</TerminalLine>
              <TerminalLine>42 of 60 attendees checked in</TerminalLine>
            </Terminal>
          </div>
        </Section>

        <Section title="Cards and inputs">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Robotics Club</CardTitle>
                <CardDescription>Department of Computer Science</CardDescription>
                <CardAction>
                  <Badge variant="success">Open</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="text-fg-secondary">
                Weekly build sessions and an annual competition.
              </CardContent>
              <CardFooter className="gap-2">
                <Button size="sm">Join</Button>
                <Button size="sm" variant="ghost">
                  Details
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Donor profile</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5 text-sm text-fg-secondary">
                  Phone number
                  <Input placeholder="01XXXXXXXXX" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-fg-secondary">
                  Blood group
                  <Input aria-invalid defaultValue="Z+" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-fg-secondary">
                  Student ID
                  <Input disabled defaultValue="Locked" />
                </label>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Table">
          <div className="hairline overflow-hidden rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Club</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Fee (BDT)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.name}>
                    <TableCell className="text-foreground">{member.name}</TableCell>
                    <TableCell className="text-fg-secondary">{member.club}</TableCell>
                    <TableCell className="text-fg-secondary">{member.plan}</TableCell>
                    <TableCell className="text-right font-mono">{member.fee}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[member.status]}>{member.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        <Section title="Dialog, command and motion">
          <InteractiveDemo />
        </Section>
      </div>
    </main>
  );
}
