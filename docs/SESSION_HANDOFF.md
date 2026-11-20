# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Fix `chatbot ask failed: gemini: timed out`, 2026-11-20. Uncommitted, on `main` (no task branch yet; create `fix/gemini-timeout-fallback` before committing).

## Diagnosis

- Not a configuration error: the key and model load and Google accepts them (no 401/403/404). Network is fine (DNS 29 ms, HTTPS ~0.5 s).
- Google answered `503 "This model is currently experiencing high demand"` for `gemini-3.8-flash` and the earlier preview model, or held the request open; `gemini-3.5-flash` hung. `gemini-3.5-flash-lite` answered, in 2–16 s.
- The fixed 10 s abort in `src/lib/gemini.ts` turned every slow answer into "timed out", which hid the 503.

## Completed work

- `backend/src/lib/gemini.ts`: one time budget per call (`GEMINI_TIMEOUT_MS`, default 25 s); optional `GEMINI_FALLBACK_MODEL` tried once after a 429/5xx or after the primary uses 60% of the budget, never after a 4xx rejection; `GeminiError` with `kind` (`busy`, `timeout`, `rejected`, `not_configured`) and Google's status in the message.
- `chatbot.service.ts`: `aiFailure()` logs the kind (busy and timeout as warnings, the rest as errors) and returns the same 503 `AI_UNAVAILABLE`; `ai.service.ts` uses it. API contract and frontend unchanged.
- `env.ts` and `.env.example`: `GEMINI_FALLBACK_MODEL`, `GEMINI_TIMEOUT_MS` (2,000–28,000, under the Next.js rewrite's 30 s proxy timeout).
- `tests/gemini.test.ts` (new, SDK mocked, fake timers); `GeminiError` added to the gemini mocks in `tests/chatbot.test.ts` and `tests/integration/harness.ts`.
- D44 in `docs/DECISIONS.md` updated.

## Commands executed and results

| Command                                                     | Result                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm --filter @uniconnect/backend test`                    | 25 suites, 457 tests pass                               |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`          | Pass                                                    |
| Live `generateText` (scratch script, real key), no fallback | Fails in 2.9 s as `busy`: primary model 503 high demand |
| Same with `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite`     | `"OK"` in 24.3 s                                        |

## Not covered

- `test:integration` (Neon `test` branch) not run; the harness mock changed only in the error it throws.
- Not checked through the browser chatbot on `/dashboard`.
- The user pasted the Gemini API key into the chat; they were told to rotate it.
