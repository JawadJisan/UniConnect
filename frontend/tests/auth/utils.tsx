import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactElement } from 'react';

/** Renders inside a fresh QueryClient with retries off, so error states show at once. */
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** Types into a control found by its label, the way a person would find it. */
export function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** An Axios error carrying an API response, as `api` would throw it. */
export function axiosError(status: number, data: unknown) {
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: {} },
  } as AxiosResponse);
}

/** A promise that never settles, to hold a form in its submitting state. */
export const pending = () => new Promise<never>(() => {});
