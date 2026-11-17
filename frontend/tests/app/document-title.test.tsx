import { render } from '@testing-library/react';
import { useDocumentTitle } from '@/hooks/use-document-title';

// Tab titles for detail pages (D50). The route's metadata title stands until the record loads.

function Titled({ name }: { name: string | null | undefined }) {
  useDocumentTitle(name);
  return null;
}

beforeEach(() => {
  document.title = 'Event — UniConnect';
});

describe('useDocumentTitle', () => {
  it('leaves the route title alone while the record is loading', () => {
    render(<Titled name={undefined} />);
    expect(document.title).toBe('Event — UniConnect');
  });

  it('names the tab after the record once it loads, and follows a rename', () => {
    const { rerender } = render(<Titled name={undefined} />);
    rerender(<Titled name="Hack Night" />);
    expect(document.title).toBe('Hack Night — UniConnect');
    rerender(<Titled name="Hack Night II" />);
    expect(document.title).toBe('Hack Night II — UniConnect');
  });

  it('puts the route title back on unmount', () => {
    const { unmount } = render(<Titled name="Hack Night" />);
    unmount();
    expect(document.title).toBe('Event — UniConnect');
  });

  it("doesn't overwrite a title the next route has already set", () => {
    const { unmount } = render(<Titled name="Hack Night" />);
    document.title = 'Clubs — UniConnect';
    unmount();
    expect(document.title).toBe('Clubs — UniConnect');
  });
});
