import { render, screen } from '@testing-library/react';
import { ROLES } from '@uniconnect/shared';
import Home from '@/app/page';

describe('project setup', () => {
  it('renders the home page', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: 'UniConnect' })).toBeTruthy();
  });

  it('resolves the shared package', () => {
    expect(ROLES).toContain('moderator');
  });
});
