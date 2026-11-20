import { ApiError, GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

// The one module that talks to Google Gemini (PRD FR-AI; DECISIONS D44). Tests mock it. The
// model comes from GEMINI_MODEL and is never hard-coded. Errors carry a message only: never
// the request, the prompt or the key.
//
// One call has one time budget (GEMINI_TIMEOUT_MS). When GEMINI_FALLBACK_MODEL is set and the
// primary model is overloaded (429/5xx) or slow, the fallback gets the rest of the budget. A
// rejected request (bad key, unknown model, bad argument) is not retried: it would fail again.

/** Below this, a fallback attempt can't finish, so it isn't started. */
const MIN_ATTEMPT_MS = 2_000;
/** With a fallback set, the primary may use this share of the budget before giving way. */
const PRIMARY_SHARE = 0.6;
/** Upstream statuses worth trying another model for: rate limit and server-side failures. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Both the key and the model are set. Without them the AI routes answer 503. */
export function aiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL);
}

/**
 * `busy`: the model is overloaded or rate-limited (429/5xx). `timeout`: no answer within the
 * budget. `rejected`: the request itself was refused (key, model ID, arguments).
 * `not_configured`: the key or model is missing.
 */
export type GeminiFailure = 'busy' | 'timeout' | 'rejected' | 'not_configured';

export class GeminiError extends Error {
  constructor(
    readonly kind: GeminiFailure,
    message: string,
  ) {
    super(`gemini: ${message}`);
    this.name = 'GeminiError';
  }
}

let client: GoogleGenAI | undefined;

function gemini(): GoogleGenAI {
  // No SDK retries (its default): the budget below is the only retry policy.
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export interface GenerateInput {
  /** Rules for the model. Context and user text never go here. */
  system: string;
  /** The data the model works from, delimited by the caller. */
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
}

interface Attempt {
  label: 'primary' | 'fallback';
  model: string;
}

function attempts(): Attempt[] {
  const list: Attempt[] = [{ label: 'primary', model: env.GEMINI_MODEL! }];
  const fallback = env.GEMINI_FALLBACK_MODEL;
  if (fallback && fallback !== env.GEMINI_MODEL) list.push({ label: 'fallback', model: fallback });
  return list;
}

/** One failed attempt as a GeminiError, from the SDK error and whether our timer fired. */
function classify(err: unknown, timedOut: boolean, label: string): GeminiError {
  if (timedOut) return new GeminiError('timeout', `${label} model timed out`);
  if (err instanceof ApiError) {
    const kind = RETRYABLE_STATUS.has(err.status) ? 'busy' : 'rejected';
    // Google's message is about the request (e.g. "high demand", "model not found"), never the
    // prompt or the key. Cut it short all the same.
    return new GeminiError(kind, `${label} model ${err.status}: ${err.message.slice(0, 200)}`);
  }
  // A network failure (DNS, reset) is worth another try, like a 5xx.
  return new GeminiError('busy', `${label} model failed: ${(err as Error).message.slice(0, 200)}`);
}

/** One completion. Throws `GeminiError` on failure, timeout or a missing config. */
export async function generateText(input: GenerateInput): Promise<string> {
  if (!aiConfigured()) throw new GeminiError('not_configured', 'not configured');
  const deadline = Date.now() + env.GEMINI_TIMEOUT_MS;
  const plan = attempts();
  const failures: GeminiError[] = [];

  for (const [i, attempt] of plan.entries()) {
    const remaining = deadline - Date.now();
    if (i > 0 && remaining < MIN_ATTEMPT_MS) break;
    const isLast = i === plan.length - 1;
    const limit = isLast ? remaining : Math.round(env.GEMINI_TIMEOUT_MS * PRIMARY_SHARE);

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), limit);
    try {
      const res = await gemini().models.generateContent({
        model: attempt.model,
        contents: input.prompt,
        config: {
          systemInstruction: input.system,
          maxOutputTokens: input.maxOutputTokens,
          temperature: input.temperature,
          abortSignal: abort.signal,
        },
      });
      return (res.text ?? '').trim();
    } catch (err) {
      const failure = classify(err, abort.signal.aborted, attempt.label);
      failures.push(failure);
      if (failure.kind === 'rejected') break;
    } finally {
      clearTimeout(timer);
    }
  }

  // Report the most telling failure: a rejection is a config problem the operator must fix;
  // otherwise the last attempt's reason, with the earlier ones in the message for the log.
  const rejected = failures.find((f) => f.kind === 'rejected');
  const last = rejected ?? failures[failures.length - 1]!;
  const message = failures.map((f) => f.message.replace(/^gemini: /, '')).join('; ');
  throw new GeminiError(last.kind, message);
}
