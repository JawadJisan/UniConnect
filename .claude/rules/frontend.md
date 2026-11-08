---
paths:
  - 'frontend/**'
---

# Frontend rules

- Follow `docs/DESIGN.md`. Use tokens from `globals.css`, not raw hex. Import `cn` from `@/lib/utils`: `shadcn add` writes the wrong import, and custom type or shadow names must be registered there. Use `m.*`, not `motion.*`, which throws under strict `LazyMotion`.
- The browser calls only same-origin `/api/*` (the Next.js rewrite), never the API origin.
- Server state uses TanStack Query. HTTP goes through one Axios instance with `withCredentials`, whose interceptor turns both error shapes (Express `{ error: { code, message, details } }` and Better Auth's) into one type. Sessions use the Better Auth React client.
- Forms use React Hook Form with `zodResolver` and the schema from `@uniconnect/shared`. Map server `details` back onto fields.
- Every data view handles loading, empty, error and success, using shared state components rather than ad-hoc text.
- Accessibility: labelled fields, visible focus, 24px pointer targets, status shown with text and not colour alone, keyboard-operable dialogs.
- Mobile first: no horizontal scroll at 375px.
- Session-dependent pages: `cacheComponents` and `partialPrefetching` are on in `frontend/next.config.ts`. Decide how authenticated pages read the session with the first one, and record it in `docs/DECISIONS.md`.
- Link only to routes that exist.
