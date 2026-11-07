import { render, screen } from '@testing-library/react';
import { ROLES } from '@uniconnect/shared';
import Home from '@/app/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('home page', () => {
  beforeEach(() => {
    render(<Home />);
  });

  it('renders the hero heading and primary action', () => {
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'The Operating System for University Clubs.',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Get Started' }).getAttribute('href')).toBe(
      '/register',
    );
  });

  it('gives every header nav link a section to land on', () => {
    const nav = screen.getByRole('navigation', { name: 'Main' });

    for (const link of nav.querySelectorAll('a')) {
      const id = link.getAttribute('href')?.split('#')[1];

      expect(document.getElementById(id ?? '')).toBeTruthy();
    }
  });

  it('labels both demonstration sections as sample data', () => {
    expect(screen.getAllByText('Sample data')).toHaveLength(2);
    expect(screen.getAllByText('MEMBERS_ONLY').length).toBeGreaterThan(0);
  });
});

describe('project setup', () => {
  it('resolves the shared package', () => {
    expect(ROLES).toContain('moderator');
  });
});
