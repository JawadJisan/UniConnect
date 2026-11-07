import { BLOOD_GROUPS } from '@uniconnect/shared';
import { CheckIcon, MinusIcon, SearchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { MicroLabel } from '@/components/ui/micro-label';
import { TerminalLine } from '@/components/ui/terminal';
import { cn } from '@/lib/utils';
import { RevealGroup, RevealItem } from './reveal';

function ModuleCard({
  id,
  label,
  title,
  className,
  children,
  description,
}: {
  id: string;
  label: string;
  title: string;
  className?: string;
  children: ReactNode;
  description: string;
}) {
  return (
    <RevealItem className={className}>
      <Card
        id={id}
        className="h-full scroll-mt-20 gap-4 px-5 transition-colors hover:border-border-strong"
      >
        <MicroLabel>{label}</MicroLabel>
        <div className="flex-1">{children}</div>
        <div>
          <h3 className="text-md font-medium tracking-tight">{title}</h3>
          <p className="mt-1 max-w-[62ch] text-sm text-fg-secondary">{description}</p>
        </div>
      </Card>
    </RevealItem>
  );
}

const committee = [
  { position: 'President', term: 'Current', role: 'moderator' },
  { position: 'General Secretary', term: 'Current', role: 'moderator' },
  { position: 'Treasurer', term: 'Ended', role: 'student' },
];

function CommitteeVisual() {
  return (
    <table className="w-full font-mono text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="micro-label pb-2 text-left">Position</th>
          <th className="micro-label pb-2 pl-3 text-left">Term</th>
          <th className="micro-label pb-2 pl-3 text-right">Role</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {committee.map((member) => (
          <tr key={member.position}>
            <td className="py-2 text-foreground">{member.position}</td>
            <td
              className={cn(
                'py-2 pl-3',
                member.term === 'Current' ? 'text-success' : 'text-fg-tertiary',
              )}
            >
              {member.term}
            </td>
            <td className="py-2 pl-3 text-right text-fg-secondary">{member.role}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const departments = [
  { name: 'CSE', included: true },
  { name: 'ECE', included: true },
  { name: 'BBA', included: false },
];

function DepartmentVisual() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground">Inter-Department Code Sprint</p>
      <ul className="flex flex-col gap-2 font-mono text-sm">
        {departments.map((department) => (
          <li key={department.name} className="flex items-center justify-between gap-3">
            <span className="text-fg-secondary">{department.name}</span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-xs',
                department.included ? 'text-foreground' : 'text-fg-tertiary',
              )}
            >
              {department.included ? (
                <CheckIcon aria-hidden="true" className="size-3.5 text-success" />
              ) : (
                <MinusIcon aria-hidden="true" className="size-3.5" />
              )}
              {department.included ? 'Can register' : 'Not included'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BloodVisual() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p>
          <span className="block font-mono text-display-sm text-foreground">O-</span>
          <span className="mt-1 block font-mono text-xs text-fg-secondary">
            Sample request, needed by <span className="whitespace-nowrap">Sat 14 Nov</span>
          </span>
        </p>
        <Badge variant="warning">pending</Badge>
      </div>
      <p className="font-mono text-xs break-words text-fg-tertiary">
        Requests cover {BLOOD_GROUPS.join(' ')}
      </p>
    </div>
  );
}

function AssistantVisual() {
  return (
    <div className="flex max-w-xl flex-col gap-1.5 font-mono text-sm">
      <TerminalLine prompt className="whitespace-normal">
        which events can I join this week?
      </TerminalLine>
      <TerminalLine className="flex items-center gap-2 whitespace-normal text-fg-secondary">
        <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
        Campus Blood Donation Camp
      </TerminalLine>
      <TerminalLine className="flex items-center gap-2 whitespace-normal text-fg-secondary">
        <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
        Inter-Department Code Sprint
      </TerminalLine>
      <TerminalLine className="flex items-center gap-2 whitespace-normal">
        <SearchIcon aria-hidden="true" className="size-3.5 shrink-0" />
        Searched public events and your club
      </TerminalLine>
    </div>
  );
}

export function ModuleGrid() {
  return (
    <section aria-labelledby="modules-heading" className="section-y border-b border-border">
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h2 id="modules-heading" className="max-w-2xl text-display-md">
            One login for everything your club runs on.
          </h2>
          <Badge variant="outline">Sample data</Badge>
        </div>
        <p className="mt-4 max-w-[58ch] text-md text-fg-secondary">
          Clubs, events, blood requests and an assistant share one account, so what you can see and
          do follows your department and your role.
        </p>

        <RevealGroup className="mt-10 grid gap-3 lg:grid-cols-6">
          <ModuleCard
            id="clubs"
            label="SYS.MODULE.CLUB_CORE"
            title="Clubs and committees"
            description="Join your department's club and pay for membership online. When a committee term ends, permissions update on their own."
            className="lg:col-span-4"
          >
            <CommitteeVisual />
          </ModuleCard>

          <ModuleCard
            id="events-module"
            label="SYS.MODULE.EVENT_SYNC"
            title="Cross-department events"
            description="Each event lists the departments it's open to, so you know whether you can register."
            className="lg:col-span-2"
          >
            <DepartmentVisual />
          </ModuleCard>

          <ModuleCard
            id="blood"
            label="SYS.MODULE.BLOOD_NET"
            title="Blood network"
            description="See urgent requests and check if your group matches."
            className="lg:col-span-2"
          >
            <BloodVisual />
          </ModuleCard>

          <ModuleCard
            id="ai"
            label="SYS.MODULE.RAG_AI"
            title="AI chatbot"
            description="Ask about events, announcements and clubs in plain English. It never reveals a members-only event you couldn't open yourself."
            className="lg:col-span-4"
          >
            <AssistantVisual />
          </ModuleCard>
        </RevealGroup>
      </div>
    </section>
  );
}
