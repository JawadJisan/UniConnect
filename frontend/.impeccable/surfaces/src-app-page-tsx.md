---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

Scope: public home page. Mode: Persuade.

Audience: university students in CSE, ECE and BBA. Job: understand what UniConnect is and sign up. Primary action: Get Started, to /register. Proof: the page shows how modules behave, using labelled sample data. No invented metrics, customers or testimonials.

Constraints: the brief pins the sections, hero copy and aesthetic. /login, /register, /privacy, /terms and /announcements don't exist yet, so those links 404 for now. Department names in the footer are plain text until department pages exist.

## Direction contract

THESIS: A campus platform that boots like a system: the page proves each module's behavior instead of listing benefits. It refuses a centered headline above a row of equal icon cards.

OWN-WORLD: Violet-black canvas, hairlines, one indigo accent, Inter at display size, mono only for commands, data and labels. Existing tokens in docs/DESIGN.md, unchanged except for the hero glow and glass header the brief asks for.

STORY: The visitor learns this is one place for clubs, events and blood requests, sees that each behaves precisely, and signs up.

FIRST VIEWPORT: Sticky glass header. Below it the command chip, then a two-line display heading across about two thirds of the width. Under that, subtext and CTAs on the left, an init terminal on the right. Get Started is the only filled indigo button in view.

FORM: Brief-pinned structure, not rolled. Signature interaction: a working Cmd/Ctrl+K palette that navigates the page and doubles as the mobile menu. Motion: terminal lines boot in sequence, then module cards stagger once on scroll. No direction roll was run, because the brief pinned the direction (new-work.md allows this); there is no seed reference.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
