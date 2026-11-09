---
version: 1
slug: "src-app-auth-layout-tsx"
primary_target: "src/app/(auth)/layout.tsx"
related_targets: ["src/app/(auth)/login/page.tsx","src/app/(auth)/register/page.tsx","src/app/(auth)/verify-email/page.tsx","src/app/(auth)/forgot-password/page.tsx","src/app/(auth)/reset-password/page.tsx"]
---

Scope: auth flow — /login, /register (student and faculty), /verify-email, /forgot-password, /reset-password. Mode: Operate.

Audience: students first, then faculty, on phones and laptops, often right after clicking a link in an email. Job: create an account, confirm the email, sign in, or recover a password, without guessing what happens next. Constraints: fields match the shared Zod schemas exactly; no approval step; the reset request never reveals whether an email exists; errors name the problem and the fix; 375px with no horizontal scroll.

## Direction contract

THESIS: The auth flow is one short path, not five unrelated forms. Each page shows where the visitor stands on it. Refuses the centered card floating on an empty page.

OWN-WORLD: The existing world, unchanged: violet-black canvas, hairlines, one indigo button per view, Inter, mono only for the trail and data. No hero glow, no glass header, no cards around forms.

STORY: The visitor sees which step they are on, fills only what that step needs, and always knows the next move (check inbox, resend, log in).

FIRST VIEWPORT: Wordmark top-left and "Back to home" top-right on a hairline bar. A centered column about 26rem wide: the mono flow trail (register → verify → sign in, current step in foreground, done steps ticked), the page title at display-sm, one line of context, then the form. The primary action is full-width at the end of the form; secondary links sit under it.

FORM: User-chosen structure "column + flow trail" (option 1 of 3, presented through the structured question tool). Signature move: the flow trail, a real state indicator. Each page ticks only the steps it can show happened (a cold /login ticks nothing; /login?verified=true ticks two; a dead reset link restarts at step one). Motion: none on the trail; the active step's underline is static so it is identical on every page and before hydration. No concept-seed roll was run: this is an in-world Operate surface whose structure the user picked from three options in the structured question tool, so there is no seed. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
