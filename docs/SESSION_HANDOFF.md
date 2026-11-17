# SESSION HANDOFF

Overwrite this file at the end of every session. Git history keeps earlier handoffs.

## Task and objective

Image upload, 2026-11-17 (D49). Work was done on `fix/image-upload` from `main`, then merged into `development` and `main` and pushed, as the user asked.

1. The live API answered 502 `UPLOAD_FAILED` on every image upload. Find out why.
2. Let users crop, zoom and rotate an image before upload, so stored images have the shape they are shown in.

## Completed work

- **Root cause of the prod error.** Render logs for `uniconnect-api` at 2026-11-17 08:53 UTC show `upload failed: Invalid api_key 7df21a7f-…`. `CLOUDINARY_API_KEY` held an OAuth app's client ID (a UUID) instead of the numeric API key from Settings → API Keys. The user is replacing all three `CLOUDINARY_*` values in Render. No code was at fault.
- **Frontend:**
  - `src/lib/crop-image.ts`: `rotatedSize`, `encodeCanvas` (WebP 0.9, falling back to PNG for alpha or JPEG on white) and `cropToFile`.
  - `src/components/image-crop-dialog.tsx`: `react-easy-crop`, with zoom (slider and ±), rotate (±90° buttons and a −180..180 slider), Reset, Cancel and Apply crop.
  - `src/components/image-drop-zone.tsx`: new `aspect`, `cropShape`, `output`, `keepAlpha` props, a 20 MB source limit, an Adjust crop button, and a zone that takes the target shape.
  - Callers: avatar (1:1, round, 512), club logo (1:1, 512, keep alpha), poster (16:9, 1600×900).
  - New dependency `react-easy-crop@^6.2.5`. Jest maps it to `tests/mocks/react-easy-crop.tsx`.
- **Backend:**
  - `src/config/env.ts` trims the Cloudinary values and checks their format (the key must be digits).
  - `src/lib/cloudinary.ts` logs "Cloudinary rejected the credentials" with the variable names on a 401 or 403. It stores images with `fill` at the same shapes (avatar and logo 512 square, poster 1600×900).
  - `.env.example` comment.
- **Tests:**
  - Frontend: `tests/app/image-upload.test.tsx`, `tests/lib/crop-image.test.ts`, the updated avatar and logo tests, and `e2e/profile.spec.ts` (crop flow, and checks that a WebP is uploaded).
  - Backend: `tests/cloudinary.test.ts` (new), and `tests/env.test.ts` (fixtures and a D49 case).
- **Docs:** D49, DESIGN.md "Image drop zone", TASKS Phase 10 row.

## Commands executed and results

| Command                                                                          | Result                                                                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm --filter @uniconnect/frontend test`                                        | 467/467 (38 suites)                                                                                |
| `pnpm --filter @uniconnect/backend test` (placeholder `DATABASE_URL`, see below) | 448/448 (24 suites)                                                                                |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`                 | Pass                                                                                               |
| `playwright test e2e/profile.spec.ts`                                            | **Did not run.** The API web server refused to start: `TEST_DATABASE_URL value is not a valid URL` |

The backend unit run needed `DATABASE_URL=postgresql://u:p@localhost:5432/unit` on the command line. `backend/.env` currently has a `DATABASE_URL` that is not a valid URL, so `env.ts` throws on import; the user was editing that file at the time. The unit tests mock Prisma and never connect.

## Not covered

- The integration suite and the e2e suite were not run: the local `backend/.env` database URLs are invalid. The real canvas crop has not run in a browser, and there was no manual check in `pnpm dev`.
- Render has `autoDeploy: no` for `uniconnect-api`, so pushing to `main` doesn't deploy the API. A manual deploy is needed.

## Exact next task

1. **User:** fix `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `TEST_DATABASE_URL` in `backend/.env` (`neon checkout development` in `backend/` rewrites the first two).
2. Run `pnpm e2e e2e/profile.spec.ts`, then `pnpm --filter @uniconnect/backend test:integration`.
3. **User:** finish setting the three `CLOUDINARY_*` values in Render and deploy the latest `main`. Then upload an avatar, a logo and a poster on the live site. Check the Render logs show no `upload failed`. In production, the API now refuses to start if the key isn't numeric.

## Recommended resume instruction

> Read `CLAUDE.md`, this file and D49. Run the profile e2e spec and the integration suite once `backend/.env` is fixed, then confirm a live upload on Render.
