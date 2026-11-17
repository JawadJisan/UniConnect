import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ImageDropZone, sourceFileProblem } from '@/components/image-drop-zone';
import { toast } from '@/components/ui/sonner';
import { cropToFile } from '@/lib/crop-image';
import { FAKE_CROP_PIXELS } from '../mocks/react-easy-crop';
import { fakeFile } from './utils';

// The crop step every image upload goes through (DECISIONS D49). react-easy-crop is the
// double in tests/mocks; the canvas work in src/lib/crop-image.ts is covered on its own.

jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
jest.mock('@/lib/crop-image', () => ({ cropToFile: jest.fn() }));

const MB = 1024 * 1024;
const cropped = new File([new Uint8Array(2048)], 'poster.webp', { type: 'image/webp' });
let urls = 0;
const createObjectURL = jest.fn(() => `blob:url-${++urls}`);
const revokeObjectURL = jest.fn();

beforeAll(() => Object.assign(URL, { createObjectURL, revokeObjectURL }));
beforeEach(() => {
  urls = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  jest.mocked(cropToFile).mockReset().mockResolvedValue(cropped);
  jest.mocked(toast.success).mockReset();
});

function renderZone(props: Partial<Parameters<typeof ImageDropZone>[0]> = {}) {
  const upload = jest.fn().mockResolvedValue(undefined);
  render(
    <ImageDropZone
      current={null}
      fallback={<span>No poster</span>}
      upload={upload}
      busy={false}
      noun="poster"
      changeLabel="Change the event poster"
      note="Cropped to 16:9."
      successMessage="Poster updated."
      aspect={16 / 9}
      output={{ width: 1600, height: 900 }}
      {...props}
    />,
  );
  return upload;
}

function pick(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

const dialog = () => screen.queryByRole('dialog', { name: 'Crop your poster' });

describe('source file checks', () => {
  it('lets a large photo into the cropper, up to 20 MB', () => {
    expect(sourceFileProblem(fakeFile('a.jpg', 'image/jpeg', 12 * MB))).toBeNull();
    expect(sourceFileProblem(fakeFile('a.jpg', 'image/jpeg', 21 * MB))).toBe(
      'That image is 21.0 MB. Choose one up to 20 MB.',
    );
    expect(sourceFileProblem(fakeFile('a.gif', 'image/gif'))).toBe(
      'Choose a JPEG, PNG or WebP image.',
    );
  });
});

describe('image crop step', () => {
  it('refuses a wrong type without opening the cropper', () => {
    renderZone();
    pick(fakeFile('a.gif', 'image/gif'));
    expect(screen.getByRole('alert').textContent).toBe('Choose a JPEG, PNG or WebP image.');
    expect(dialog()).toBeNull();
  });

  it('opens the cropper at the zone shape, then previews and uploads the cropped file', async () => {
    const upload = renderZone();
    const original = fakeFile('poster.jpg', 'image/jpeg', 8 * MB);
    pick(original);

    expect(await screen.findByRole('dialog', { name: 'Crop your poster' })).toBeTruthy();
    expect(createObjectURL).toHaveBeenCalledWith(original);
    const area = screen.getByRole('img', { name: 'Crop area for the poster' });
    expect(Number(area.getAttribute('data-aspect'))).toBeCloseTo(16 / 9);
    expect(area.getAttribute('data-shape')).toBe('rect');
    expect(screen.queryByRole('button', { name: 'Upload poster' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));

    await waitFor(() => expect(dialog()).toBeNull());
    expect(cropToFile).toHaveBeenCalledWith(
      'blob:url-1',
      FAKE_CROP_PIXELS,
      0,
      { width: 1600, height: 900 },
      { keepAlpha: false, name: 'poster.jpg' },
    );
    expect(createObjectURL).toHaveBeenLastCalledWith(cropped);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:url-2');

    fireEvent.click(screen.getByRole('button', { name: 'Upload poster' }));
    await waitFor(() => expect(upload).toHaveBeenCalledWith(cropped));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Poster updated.'));
  });

  it('rotates by 90 degrees and passes the rotation to the crop', async () => {
    renderZone();
    pick(fakeFile('poster.jpg', 'image/jpeg'));
    await screen.findByRole('dialog', { name: 'Crop your poster' });

    fireEvent.click(screen.getByRole('button', { name: 'Rotate right 90 degrees' }));
    expect(
      screen.getByRole('img', { name: 'Crop area for the poster' }).getAttribute('data-rotation'),
    ).toBe('90');
    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));

    await waitFor(() => expect(cropToFile).toHaveBeenCalled());
    expect(jest.mocked(cropToFile).mock.calls[0]![2]).toBe(90);
  });

  it('zooms with the buttons and the labelled slider', async () => {
    renderZone();
    pick(fakeFile('poster.jpg', 'image/jpeg'));
    await screen.findByRole('dialog', { name: 'Crop your poster' });
    const area = () => screen.getByRole('img', { name: 'Crop area for the poster' });

    expect(screen.getByRole('button', { name: 'Zoom out' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(area().getAttribute('data-zoom')).toBe('1.25');
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '3' } });
    expect(area().getAttribute('data-zoom')).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(area().getAttribute('data-zoom')).toBe('1');
  });

  it('cancelling the first crop drops the pick', async () => {
    const upload = renderZone();
    pick(fakeFile('poster.jpg', 'image/jpeg'));
    const open = await screen.findByRole('dialog', { name: 'Crop your poster' });

    fireEvent.click(within(open).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(dialog()).toBeNull());
    expect(screen.queryByRole('button', { name: 'Upload poster' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Add a poster/ })).toBeTruthy();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:url-1');
    expect(upload).not.toHaveBeenCalled();
  });

  it('adjusting reopens the cropper, and cancelling it keeps the last crop', async () => {
    renderZone();
    pick(fakeFile('poster.jpg', 'image/jpeg'));
    await screen.findByRole('dialog', { name: 'Crop your poster' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));
    await screen.findByRole('button', { name: 'Upload poster' });

    fireEvent.click(screen.getByRole('button', { name: 'Adjust crop' }));
    const again = await screen.findByRole('dialog', { name: 'Crop your poster' });
    fireEvent.click(within(again).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(dialog()).toBeNull());
    expect(screen.getByRole('button', { name: 'Upload poster' })).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:url-2');
  });

  it('says so when the image cannot be cropped, and keeps the dialog open', async () => {
    jest.mocked(cropToFile).mockRejectedValue(new Error('The image could not be read.'));
    renderZone();
    pick(fakeFile('poster.jpg', 'image/jpeg'));
    await screen.findByRole('dialog', { name: 'Crop your poster' });

    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));

    expect((await screen.findByRole('alert')).textContent).toBe('The image could not be read.');
    expect(dialog()).toBeTruthy();
  });

  it('uses a round guide and keeps transparency when asked', async () => {
    renderZone({ noun: 'photo', aspect: 1, cropShape: 'round', keepAlpha: true });
    pick(fakeFile('me.png', 'image/png'));
    const area = await screen.findByRole('img', { name: 'Crop area for the photo' });
    expect(area.getAttribute('data-aspect')).toBe('1');
    expect(area.getAttribute('data-shape')).toBe('round');
    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));
    await waitFor(() => expect(cropToFile).toHaveBeenCalled());
    expect(jest.mocked(cropToFile).mock.calls[0]![4]).toEqual({ keepAlpha: true, name: 'me.png' });
  });
});
