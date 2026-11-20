import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// src/lib/gemini.ts with the `@google/genai` SDK mocked: the time budget, the fallback model
// and how a failure is classified. No test reaches Google.

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Call {
  model: string;
  config: { abortSignal: AbortSignal; maxOutputTokens: number; temperature: number };
}
type Reply = (call: Call) => Promise<{ text?: string }>;

const calls: Call[] = [];
let replies: Record<string, Reply> = {};

jest.unstable_mockModule('@google/genai', () => ({
  ApiError,
  GoogleGenAI: class {
    models = {
      generateContent: (call: Call) => {
        calls.push(call);
        return replies[call.model]!(call);
      },
    };
  },
}));

const env: Record<string, unknown> = {};
jest.unstable_mockModule('../src/config/env.js', () => ({ env }));

const { generateText, GeminiError, aiConfigured } = await import('../src/lib/gemini.js');

const input = { system: 's', prompt: 'p', maxOutputTokens: 400, temperature: 0.2 };
const ok =
  (text: string): Reply =>
  async () => ({ text });
const status =
  (code: number, msg = 'nope'): Reply =>
  async () => {
    throw new ApiError(code, msg);
  };
/** Never answers; rejects only when the caller aborts, as the SDK does. */
const hang: Reply = ({ config }) =>
  new Promise((_, reject) => {
    config.abortSignal.addEventListener('abort', () => reject(new Error('aborted')));
  });

/** Runs generateText to completion under fake timers, returning its result or error. */
async function run(): Promise<string | InstanceType<typeof GeminiError>> {
  const settled = generateText(input).then(
    (text) => text,
    (err: InstanceType<typeof GeminiError>) => err,
  );
  await jest.advanceTimersByTimeAsync(30_000);
  return settled;
}

beforeEach(() => {
  jest.useFakeTimers();
  calls.length = 0;
  replies = {};
  Object.assign(env, {
    GEMINI_API_KEY: 'k',
    GEMINI_MODEL: 'main',
    GEMINI_FALLBACK_MODEL: undefined,
    GEMINI_TIMEOUT_MS: 10_000,
  });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('generateText', () => {
  it('returns the trimmed text from the configured model with the caller settings', async () => {
    replies.main = ok('  Hello  ');
    expect(await run()).toBe('Hello');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe('main');
    expect(calls[0]!.config).toMatchObject({ maxOutputTokens: 400, temperature: 0.2 });
  });

  it('is not_configured without a key or a model, and calls nothing', async () => {
    env.GEMINI_MODEL = undefined;
    expect(aiConfigured()).toBe(false);
    const err = await run();
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as InstanceType<typeof GeminiError>).kind).toBe('not_configured');
    expect(calls).toHaveLength(0);
  });

  it('reports an overloaded model as busy with the upstream status, not as a timeout', async () => {
    replies.main = status(503, 'This model is currently experiencing high demand.');
    const err = (await run()) as InstanceType<typeof GeminiError>;
    expect(err.kind).toBe('busy');
    expect(err.message).toContain('primary model 503');
    expect(err.message).toContain('high demand');
  });

  it('times out after the whole budget when there is no fallback', async () => {
    replies.main = hang;
    const err = (await run()) as InstanceType<typeof GeminiError>;
    expect(err.kind).toBe('timeout');
    expect(calls).toHaveLength(1);
  });

  it('falls back once when the primary is busy', async () => {
    env.GEMINI_FALLBACK_MODEL = 'lite';
    replies.main = status(503);
    replies.lite = ok('From lite');
    expect(await run()).toBe('From lite');
    expect(calls.map((c) => c.model)).toEqual(['main', 'lite']);
  });

  it('gives a slow primary 60% of the budget, then the fallback the rest', async () => {
    env.GEMINI_FALLBACK_MODEL = 'lite';
    replies.main = hang;
    let fallbackStartedAt = 0;
    const start = Date.now();
    replies.lite = async () => {
      fallbackStartedAt = Date.now() - start;
      return { text: 'late but fine' };
    };
    expect(await run()).toBe('late but fine');
    expect(fallbackStartedAt).toBe(6_000);
  });

  it('does not try the fallback after a rejected request (bad key, unknown model)', async () => {
    env.GEMINI_FALLBACK_MODEL = 'lite';
    replies.main = status(404, 'models/main is not found');
    replies.lite = ok('unused');
    const err = (await run()) as InstanceType<typeof GeminiError>;
    expect(err.kind).toBe('rejected');
    expect(calls).toHaveLength(1);
  });

  it('reports both attempts when the fallback fails too', async () => {
    env.GEMINI_FALLBACK_MODEL = 'lite';
    replies.main = status(503);
    replies.lite = status(429);
    const err = (await run()) as InstanceType<typeof GeminiError>;
    expect(err.kind).toBe('busy');
    expect(err.message).toMatch(/primary model 503.*fallback model 429/);
  });

  it('ignores a fallback that names the primary model', async () => {
    env.GEMINI_FALLBACK_MODEL = 'main';
    replies.main = status(503);
    await run();
    expect(calls).toHaveLength(1);
  });
});
