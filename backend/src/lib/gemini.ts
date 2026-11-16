import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

// The one module that talks to Google Gemini (PRD FR-AI; DECISIONS D44). Tests mock it. The
// model comes from GEMINI_MODEL and is never hard-coded. Errors carry a message only: never
// the request, the prompt or the key.

const TIMEOUT_MS = 10_000;

/** Both the key and the model are set. Without them the AI routes answer 503. */
export function aiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL);
}

let client: GoogleGenAI | undefined;

function gemini(): GoogleGenAI {
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

/** One completion. Throws `Error('gemini: …')` on failure, timeout or a missing config. */
export async function generateText(input: GenerateInput): Promise<string> {
  if (!aiConfigured()) throw new Error('gemini: not configured');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await gemini().models.generateContent({
      model: env.GEMINI_MODEL!,
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
    const reason = abort.signal.aborted ? 'timed out' : (err as Error).message;
    // eslint-disable-next-line preserve-caught-error -- the cause can hold the request and key
    throw new Error(`gemini: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}
