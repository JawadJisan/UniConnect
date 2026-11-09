import axios, { isAxiosError } from 'axios';

/**
 * Same-origin client for the Express API. The Next.js rewrite forwards /api/* to Express, so
 * the session cookie stays first-party. Never point this at the API origin directly.
 */
export const api = axios.create({ baseURL: '/api', withCredentials: true });

export interface FieldIssue {
  path: string;
  message: string;
}

/** One error shape for the Express envelope and Better Auth's `{ code, message }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const NETWORK_MESSAGE = "Couldn't reach UniConnect. Check your connection and try again.";

function fieldIssues(details: unknown): FieldIssue[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((d) =>
    d && typeof d === 'object' && typeof d.path === 'string' && typeof d.message === 'string'
      ? [{ path: d.path, message: d.message }]
      : [],
  );
}

/** Normalises anything thrown by `api`, `authClient` or fetch into an ApiError. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (isAxiosError(err)) {
    if (!err.response) return new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
    interface Shape {
      code?: string;
      message?: string;
      details?: unknown;
    }
    // Express wraps errors in { success: false, error }, Better Auth sends { code, message }.
    const body = err.response.data as (Shape & { error?: Shape }) | undefined;
    const envelope: Shape | undefined = body?.error ?? body;
    return new ApiError(
      err.response.status,
      envelope?.code ?? 'UNKNOWN',
      envelope?.message ?? 'Something went wrong. Try again.',
      fieldIssues(envelope?.details),
    );
  }

  // Better Auth client errors: { status, code?, message?, statusText }.
  if (err && typeof err === 'object' && 'status' in err) {
    const e = err as { status: number; code?: string; message?: string; statusText?: string };
    return new ApiError(
      e.status,
      e.code ?? 'UNKNOWN',
      e.message || e.statusText || 'Something went wrong. Try again.',
    );
  }

  return new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
}
