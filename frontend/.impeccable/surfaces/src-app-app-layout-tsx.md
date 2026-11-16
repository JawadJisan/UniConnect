---
version: 1
slug: "src-app-app-layout-tsx"
primary_target: "src/app/(app)/layout.tsx"
related_targets: ["src/app/(app)/dashboard/page.tsx","src/app/(app)/dashboard/profile/page.tsx"]
---

Scope: signed-in workspace for every role: the app shell (sidebar + top bar), /dashboard (overview) and /dashboard/profile (FR-USER-001 to 004). Mode: Operate.

Audience: all five roles; students first, on laptops and phones. Job: see who they are in the system, keep their profile correct (contact, blood group, academic details), change avatar and password. Constraints: only routes that exist are linked; the overview shows real data only (no FR-DASH APIs yet); fields follow the shared Zod schemas and the server's per-user_type rules; toasts for confirmations, inline field errors; 375px with no horizontal scroll.

## Direction contract

THESIS: One workspace for every role. The sidebar shows only what the caller's role can reach today, so a student never sees admin chrome and nothing links to a page that does not exist. Refuses the stat-card dashboard filled with numbers the product cannot produce yet.

OWN-WORLD: The existing world, unchanged: violet-black canvas, surface-1 cards with hairlines, one indigo primary per form, Inter 14px, mono for IDs, dates and the role/department tag. SYS.PROFILE.* mono labels (user-requested) sit in each card's header row opposite the title, never as an eyebrow above it.

STORY: The visitor lands on an overview that says who they are (role, department) and what is missing from their profile, goes to Profile, fixes it card by card, and gets a toast for each save.

FIRST VIEWPORT: Left: 232px sidebar on surface-1: wordmark, "You" group (Overview, Profile), a footer tag "STUDENT · CSE". Top: 48px bar with the page title, the ⌘K chip, avatar plus name, and sign out. Content in container-wide: on lg, the Identity card (avatar zone, name, email, role badge, department) is a sticky left column (one third); the right two thirds stack Personal details, Academic details (students only) and Password, in the same order phones read them. Each form's Save sits at its card footer, right-aligned, and is the indigo primary only while that form has unsaved changes.

FORM: User-chosen structure "sidebar + top bar" (option 1 of 3, presented through the structured question tool). Signature move: the avatar drop zone, keyboard-operable, a local preview before any upload, the upload state on the image itself, and the shared limits checked before the network. Motion: none beyond token hovers and the drawer/dialog enter. No concept-seed roll was run: the roll was skipped because the user pinned the structure in the structured question tool for this in-world Operate surface (the same route as the auth surface). seed: none (skipped, structure user-pinned)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
