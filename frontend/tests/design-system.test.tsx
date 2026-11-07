import { render, screen } from '@testing-library/react';
import { m } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { CommandChip, CommandChipButton } from '@/components/ui/command-chip';
import { MicroLabel } from '@/components/ui/micro-label';
import { Terminal, TerminalLine } from '@/components/ui/terminal';
import { cn } from '@/lib/utils';
import { MotionProvider } from '@/providers/motion-provider';

describe('cn', () => {
  it('keeps custom type sizes next to text colors', () => {
    expect(cn('text-micro', 'text-foreground')).toBe('text-micro text-foreground');
    expect(cn('text-display-lg', 'text-foreground')).toBe('text-display-lg text-foreground');
  });

  it('resolves conflicts within custom groups', () => {
    expect(cn('text-sm', 'text-micro')).toBe('text-micro');
    expect(cn('shadow-float', 'shadow-overlay')).toBe('shadow-overlay');
    expect(cn('border-border', 'border-border-strong')).toBe('border-border-strong');
  });
});

describe('buttonVariants', () => {
  it('lets a variant border replace the transparent base border', () => {
    const classes = buttonVariants({ variant: 'outline' }).split(' ');

    expect(classes).toContain('border-border-strong');
    expect(classes).not.toContain('border-transparent');
  });
});

describe('MotionProvider', () => {
  it('renders m components', () => {
    render(
      <MotionProvider>
        <m.div>animated</m.div>
      </MotionProvider>,
    );

    expect(screen.getByText('animated')).toBeTruthy();
  });
});

describe('primitives', () => {
  it('Badge keeps its type size when className adds a color', () => {
    render(<Badge className="text-foreground">Active</Badge>);

    expect(screen.getByText('Active').className).toContain('text-micro');
  });

  it('MicroLabel renders the requested element', () => {
    render(<MicroLabel as="h3">Metadata</MicroLabel>);

    expect(screen.getByRole('heading', { level: 3, name: 'Metadata' }).className).toContain(
      'micro-label',
    );
  });

  it('CommandChip adds the slash once', () => {
    const { container } = render(<CommandChip>events</CommandChip>);

    expect(container.textContent).toBe('/events');
  });

  it('CommandChipButton is a real button that hides the slash from screen readers', () => {
    render(<CommandChipButton>events</CommandChipButton>);

    expect(screen.getByRole('button', { name: 'events' }).getAttribute('type')).toBe('button');
  });

  it('Terminal shows its title and marks only prompt lines', () => {
    const { container } = render(
      <Terminal title="Check-in">
        <TerminalLine prompt>run</TerminalLine>
        <TerminalLine>done</TerminalLine>
      </Terminal>,
    );

    expect(screen.getByText('Check-in')).toBeTruthy();
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });
});
