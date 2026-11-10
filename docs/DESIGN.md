# UniConnect: Design System

The rules for every UniConnect screen. Tokens live in `frontend/src/app/globals.css`. With the dev server running, `/design` shows every token and component.

## 1. Direction

A dense, dark product UI with a developer-tool character. Two references, used for principles only:

| Reference                     | What we take                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------- |
| JS Mastery agentic course     | Violet-black canvas, terminal panels, slash-command chips, mono uppercase labels |
| [Linear](https://linear.app/) | Dense layouts, hairline borders, one accent, restrained glow, keyboard-first     |

**When they conflict:** the course page decides signature details (labels, chips, mono accents). Linear decides how app screens behave (density, tables, forms, keyboard).

**Never copy** either site's text, images, logos, icons or exact brand colors.

## 2. What the references use

Measured from their public HTML and CSS on 2026-11-07. Rendered hover and animation behavior wasn't reviewed.

| Property     | Course page                                                | Linear                                         |
| ------------ | ---------------------------------------------------------- | ---------------------------------------------- |
| Canvas       | `theme-color` `#020013`; panels are teal-black (`#0a0d0e`) | `#08090a`, marketing `#010102`                 |
| Accent       | Mint `#54f0a6`, by far the most-used color                 | Indigo `#5e6ad2`, `#7170ff`                    |
| Borders      | `#232c30`, `white/7%`                                      | `white/8%`, `white/12%`                        |
| UI text      | 11 to 16.5px                                               | 12, 13, 14, 15, 17px                           |
| Micro-labels | Mono, 10 to 11.5px, uppercase, tracking 0.08 to 0.18em     | None found                                     |
| Headings     | Tracking -0.01 to -0.04em                                  | Tracking down to -0.022em, weights 510 and 590 |
| Fonts        | JetBrains Mono heavily used, among several others          | Inter Variable, Berkeley Mono                  |
| Radius       | Mostly 4, 6, 12px and full                                 | 4, 6, 8, 12, 16, 24px                          |
| Container    | 1320px                                                     | 1024px, with a 32px gutter                     |

**Mint isn't used.** The course page's accent is mint, but this project's brief calls for a violet-black canvas and one indigo accent, so the brief wins.

## 3. Color

Dark only. There's no light theme in V1. Use the Tailwind names, never hex values or the raw CSS variables.

| Use                | Class                               | Value                           |
| ------------------ | ----------------------------------- | ------------------------------- |
| Page               | `bg-background`                     | `#07060e`                       |
| Cards, table hover | `bg-surface-1`, `bg-card`           | `#0d0c16`                       |
| Dialogs, controls  | `bg-surface-2`, `bg-popover`        | `#13121e`                       |
| Control hover      | `bg-surface-3`, `bg-accent`         | `#1a1927`                       |
| Main text          | `text-foreground`                   | `#f2f1f8`                       |
| Supporting text    | `text-fg-secondary`                 | `#b5b3c6`                       |
| Metadata           | `text-fg-tertiary`                  | `#8f8da3`                       |
| Default border     | `border-border`                     | `white/8%`                      |
| Stronger border    | `border-border-strong`              | `white/14%`                     |
| Form field border  | `border-input`                      | `white/36%`                     |
| Primary action     | `bg-brand`, `bg-primary`            | `#5b57e8`                       |
| Links, active text | `text-brand-text`                   | `#a9a8ff`                       |
| Selected row       | `bg-brand-tint`                     | Brand at 18%                    |
| Focus              | `ring-ring`                         | `#8583ff`                       |
| Status             | `success`, `warning`, `destructive` | `#4cc38a`, `#e5b454`, `#f2716f` |
| Charts             | `chart-1` to `chart-5`              | Indigo tints                    |

- **`accent` isn't the indigo accent.** It's shadcn's name for a neutral hover fill. The indigo is `brand`.
- **One accent.** Indigo means "primary or active". Don't add a second decorative color.
- **Status colors only mean status:** membership, payment, event and blood request states.
- Status meaning also needs a word or icon, never color alone.
- Inputs use a `brand-text` caret. Browser autofill is repainted onto the canvas with foreground text (base layer of `globals.css`), so filled fields never turn light.

## 4. Typography

Inter for UI, JetBrains Mono for accents and figures. Inter's optical size axis gives large text the Inter Display cut automatically, so there's no separate display font.

| Class             | Size       | Use                                        |
| ----------------- | ---------- | ------------------------------------------ |
| `text-display-lg` | 40 to 72px | Public page hero only                      |
| `text-display-md` | 32 to 48px | Public section headings                    |
| `text-display-sm` | 24 to 32px | App page titles                            |
| `text-lg`         | 17px       | Lead paragraphs                            |
| `text-md`         | 15px       | Card and dialog titles, public body text   |
| `text-base`       | 14px       | App default                                |
| `text-sm`         | 13px       | Buttons, table cells, helper text          |
| `text-xs`         | 12px       | Small buttons, captions                    |
| `text-micro`      | 11px       | Badges, keyboard hints                     |
| `micro-label`     | 11px       | Mono uppercase label, tracking 0.14em      |
| `text-field`      | 16px       | Inputs on touch screens, so iOS won't zoom |

- Weights are 400, 500 and 600 only.
- Use `font-mono` for IDs, amounts, dates in tables, code and commands.
- Use `tabular-nums` wherever numbers line up in columns. `Table` already does.

**Adding a custom type or shadow name:** add it to both `globals.css` and `frontend/src/lib/utils.ts`. Otherwise `cn` can silently drop it: it reads `text-micro` as a color and removes it when a real color follows.

## 5. Layout

Spacing follows Tailwind's 4px grid. Use the standard breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.

| Utility            | Max width | Use                                          |
| ------------------ | --------- | -------------------------------------------- |
| `container-narrow` | 720px     | Forms, articles, settings                    |
| `container-page`   | 1120px    | Default                                      |
| `container-wide`   | 1320px    | Dashboards, wide tables                      |
| `section-y`        | n/a       | Vertical space for page sections, 48 to 96px |

- All containers include responsive gutters of 16, 24 and 32px.
- Build mobile first. Pages must not scroll sideways at 375px. Wide tables scroll inside their own container, which `Table` provides.
- Use `hairline` for a default border on any element, and `link` for text links, which are always underlined.

**Signed-in workspace.** Every page under `app/(app)/` sits in `AppShell` (`app/(app)/_components/`):

- **Sidebar**, `lg` and up: 232px (`w-58`), `bg-surface-1`, hairline on the right, sticky at full height. Wordmark, then the nav groups, then a footer with a 28px avatar, the name and a `micro-label` account tag ("STUDENT · CSE": role, then department when there is one).
- **Top bar**: 48px (`h-12`), `bg-background`, hairline below, sticky. Location as "Group / Page" (the group hides below `sm`), then on the right a `CommandChipButton` with a real `Kbd` hint ("⌘K Go to", hidden below `md`), the avatar and name, and a ghost `sm` Sign out.
- **Drawer**, below `lg`: the same nav and footer in a base-ui `Dialog` that slides in from the left (`w-72`, at most 85vw, `border-border-strong`, `shadow-overlay`, `--duration-slow`), opened by a ghost menu button in the top bar.
- Pages use `container-wide` with `py-8`, an `h1` in `text-display-sm` and one `text-sm` `text-fg-secondary` line under it.
- **Bento grid**: `grid items-start gap-4 lg:grid-cols-3`, cells placed with `col-span`. Single column below `lg`.
- **Profile layout**: on `lg` the read-only identity cell is a sticky left column (one third, `top-16`), and the editable cards stack in the other two thirds. Keep one DOM order, so focus order matches what the eye reads at every width; never reorder with CSS.

## 6. Shape and depth

| Token            | Value  | Use                             |
| ---------------- | ------ | ------------------------------- |
| `rounded-sm`     | 4px    | Badges, chips, keyboard hints   |
| `rounded-md`     | 6px    | Buttons, inputs                 |
| `rounded-lg`     | 8px    | Panels, terminals, table frames |
| `rounded-xl`     | 12px   | Cards, dialogs                  |
| `shadow-float`   | Medium | Popovers, menus                 |
| `shadow-overlay` | Large  | Dialogs, command palette        |
| `shadow-glow`    | Indigo | Primary button hover only       |

Use borders for structure. Shadows are only for layers floating above the page.

## 7. Components

Everything is in `frontend/src/components/ui/`.

| Component     | Rules                                                                                                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`      | One `default` per view. `secondary` for other actions, `ghost` for low emphasis and toolbars, `destructive` for removal. Sizes `sm` 28, `default` 32, `lg` 36px, with `lg` on touch-first screens. For links, put `buttonVariants` on `next/link`, because `Button` would announce them as buttons |
| `Card`        | `bg-card` with a hairline and no shadow. Don't nest cards                                                                                                                                                                                                                                          |
| `Badge`       | Status and metadata only: `success`, `warning`, `destructive`, `secondary`, `outline`. At most one status badge per row                                                                                                                                                                            |
| `Input`       | Visible border at 3:1 contrast. Always pair with a label. Set `aria-invalid` for errors                                                                                                                                                                                                            |
| `Dialog`      | For short focused tasks. Give it a title, and put actions in `DialogFooter`                                                                                                                                                                                                                        |
| `Table`       | Dense rows, `micro-label` headers, right-aligned amounts in `font-mono`                                                                                                                                                                                                                            |
| `Command`     | Palette on Ctrl/Cmd+K. Group labels, with `Kbd` hints only for keys that work                                                                                                                                                                                                                      |
| `Kbd`         | Only for shortcuts that really work. Hide on touch-only screens                                                                                                                                                                                                                                    |
| `MicroLabel`  | Metadata, group labels, table headers                                                                                                                                                                                                                                                              |
| `CommandChip` | Pass `events`, not `/events`. `CommandChip` is a static label, `CommandChipButton` a real button                                                                                                                                                                                                   |
| `Terminal`    | Display panel for logs and status output. `TerminalLine prompt` adds the `$`                                                                                                                                                                                                                       |
| `Avatar`      | A picture, or up to two initials on `surface-3` in a full circle with a hairline. Titles such as "Dr." and "Md." are skipped. Decorative (empty alt), so always place it next to the name                                                                                                          |
| `Toaster`     | Sonner, unstyled and drawn with tokens: `surface-2`, `border-strong`, `rounded-lg`, `shadow-float`, bottom right. Icon plus words carry the meaning. Mounted once in the root layout                                                                                                               |
| `Skeleton`    | `surface-2` pulse, `aria-hidden`, shaped like the content it stands in for                                                                                                                                                                                                                         |
| `ErrorState`  | A data view that failed to load: `FormAlert` (error) with an optional secondary `sm` Try again button                                                                                                                                                                                              |

**Using the signature pieces well.** They add character, so keep them occasional:

- Use terminal panels and chips for status readouts, shortcuts and marketing moments. Don't ask a student to type shell commands, and keep forms as normal forms.
- Don't place a micro-label above every heading.
- Don't use chips for navigation that a normal link or button handles better.

**Forms.** Keep them plain, built from these pieces in `components/ui/`:

- `Field` ties one control to its label, optional description and inline error. Spread `controlProps(id, { error, description })` on the control so `aria-invalid` and `aria-describedby` point at that text. Required is the default; only `optional` is marked.
- `FormAlert` is form-level status: `tone` `error`, `success` or `info`. The icon and a title in words carry the meaning. Errors use `role="alert"`, the others `role="status"`.
- `NativeSelect` is a styled native `<select>` for short fixed lists such as departments and blood groups, so phones keep their own picker.
- On auth and other touch-first forms, inputs are `h-9`. Error messages name the problem and the fix.

**Feedback.** Each kind of outcome has one home:

- A completed action ("Profile saved.", "Profile photo updated.") gets a toast.
- A problem with one field stays inline under that field, through `Field`.
- A failure of the whole form goes in a `FormAlert` inside the form.
- A data view uses `Skeleton` while loading and `ErrorState` when the load fails, not ad-hoc text.

**Save buttons.** A form's Save is `secondary` and disabled while the form is clean, and becomes `default` only while it has unsaved changes. A ghost Reset appears next to it once the form is dirty. A form with no dirty state, such as change password, keeps a `secondary` submit. This keeps one indigo action on screen while several cards each have their own Save.

**Panel.** `Panel` (`app/(app)/_components/`) is one bento cell: a `Card` labelled by its heading. The header row has the title (`h2`, `text-md`, medium) and, opposite it in the same row, an optional `SYS.*` `micro-label` tag, never above the title. An optional `text-fg-tertiary` description sits under the title. An optional footer row holds the cell's action, right-aligned under a hairline.

**Workspace navigation.** One table (`nav.ts`) lists every signed-in destination in groups. Each item may name the roles that see it, and empty groups are dropped, so every role gets its own sidebar from the same source. Only routes that exist are listed. Group headings are `MicroLabel`s. Links are 32px (`h-8`) with a 16px icon. The current page has `aria-current="page"`, `bg-surface-3`, medium foreground text and a `brand-text` icon; the others are `fg-secondary` with a `fg-tertiary` icon and a `surface-2` hover. The ⌘K palette lists the same destinations.

**Avatar drop zone.** The profile's photo control (`avatar-upload.tsx`) is a real button, so Enter and Space open the picker and a drop works too. It is a square with `rounded-xl` and a dashed `border-strong` on `surface-2`, which turns `brand-text` on `brand-tint` while a file is dragged over it. The shared type and size limits are checked before any upload, and a problem shows inline in words. A chosen file previews in place (a local blob URL) with ghost Cancel and Upload photo. While uploading, an overlay on the image shows a spinner and "Uploading…". Success is a toast. A caption under the zone states the accepted types and size.

**Admin list (users).** `/dashboard/admin/users` is the pattern for list pages. A filter row sits above the table: a search input with a leading icon that updates the URL after a 300ms pause, then `NativeSelect` filters whose first option names the unfiltered state ("All roles"). Filters, sort and page live in the URL, so reload and back keep them, and any filter change returns to page 1. The table sits in a `rounded-lg` hairline frame, and sortable headers are buttons inside `micro-label` headers with `aria-sort`. Below `md` and `sm`, secondary columns (department, joined) are hidden rather than squeezed. Each row has one status badge with an icon (Suspended, then Unverified, then Active). Role is plain text, with the account type under it when they differ. The footer reads "21–40 of 134" in mono, with secondary Previous and Next buttons. While the next page loads, the previous one stays on screen at reduced opacity. The empty state says whether filters caused it and offers Clear filters.

**Admin record (user detail).** The record page reuses the profile layout: a sticky read-only Account cell on the left and action cells on the right. These are the role (with the terms that grant it and a secondary Recompute), the details form, and the account status. Suspend is the only `destructive` button, and it opens a `Dialog` that states the consequence and takes an optional reason for the audit log. Actions that can't apply (the admin's own account, other super admins) stay visible but disabled, with a sentence that says why.

**Flow trail.** `FlowTrail` (`app/(auth)/_components/`) shows where the visitor stands on a multi-page flow: register → verify → sign in, or request → inbox → new password. Mono `text-xs` with chevrons between steps; the current step is `text-foreground` with `aria-current="step"` and a static `brand-text` underline. Tick only the steps the page can show happened: a cold `/login` ticks nothing. No motion, so it looks the same on every page and before hydration.

**After `shadcn add`:** generated files import `cn` from the package, and ESLint will flag it. Change the import to `@/lib/utils`, then restyle to these tokens.

## 8. Motion

| Token             | Value                       | Use                                   |
| ----------------- | --------------------------- | ------------------------------------- |
| `--duration-fast` | 120ms                       | Hover and focus (the default)         |
| `--duration-base` | 180ms                       | Dialogs, menus, small enters          |
| `--duration-slow` | 280ms                       | Larger panels                         |
| `ease-out`        | `cubic-bezier(.16,1,.3,1)`  | Almost everything                     |
| `ease-in-out`     | `cubic-bezier(.65,0,.35,1)` | Moves between two on-screen positions |

- Use CSS for hover and focus, and `motion/react` for enter, exit and layout.
- **Use `m.div`, not `motion.div`.** `MotionProvider` runs `LazyMotion` in strict mode, so `motion.*` throws.
- Values for `motion` come from `frontend/src/lib/motion.ts`.
- Animate opacity and small translations. Motion should explain a change, not decorate it.
- Reduced motion is handled globally, in `MotionConfig reducedMotion="user"` and a CSS media query.

## 9. Accessibility

Calculated contrast ratios, at their lowest across all surfaces:

| Pair                     | Ratio   |
| ------------------------ | ------- |
| Primary text             | 15.44:1 |
| Secondary text           | 8.44:1  |
| Tertiary text            | 5.37:1  |
| White on brand fill      | 5.29:1  |
| Brand text               | 8.03:1  |
| Brand text on brand tint | 6.79:1  |
| Danger on its 12% tint   | 5.13:1  |
| Form field border        | 3.21:1  |

The brand hover fill stays above 4.5:1 with white text (4.77:1).

- Every interactive element needs a visible focus state. Use the global `:focus-visible` outline, or `ring-2 ring-ring`.
- Pointer targets are at least 24px.
- Decorative borders (`white/8%`, `white/14%`) don't meet 3:1, so they can't be the only way to identify a control.

## 10. Do and don't

| Do                                        | Don't                                    |
| ----------------------------------------- | ---------------------------------------- |
| Use tokens and the utilities above        | Use raw hex values or one-off font sizes |
| Separate content with hairlines and space | Nest cards or stack shadows              |
| Use flat fills                            | Use gradients, especially purple to blue |
| Keep a clear single primary action        | Put several accent buttons in one view   |
| Show real shortcuts with `Kbd`            | Show shortcuts that don't work           |
| Write plain, specific labels              | Use icon tiles above headings            |

**Two exceptions, both only on the home page:** the `hero-glow` utility is the one permitted gradient, and the sticky header may use a background blur. Don't reuse either as decoration elsewhere.

## 11. Intentional choices

Later tools and reviews shouldn't "fix" these:

- Inter as the only UI font.
- One indigo accent on a violet-black canvas.
- Dark only in V1.
- Mono uppercase micro-labels, used sparingly.
- 14px as the default app text size, for density.
- The `> ./uniconnect --init` chip above the home page heading, and the `SYS.MODULE.*` card labels. The project brief asks for both, even though Impeccable's rules discourage labels above headings.
- The `SYS.*` tags on workspace panels (`SYS.PROFILE.*`, `SYS.ACCOUNT`, `SYS.ACCESS`), which extend the `SYS.MODULE.*` exception at the user's request. In the app they sit opposite the title in the panel's header row, never above it.

## 12. Using Impeccable

[Impeccable](https://github.com/pbakaus/impeccable) 4.8.0 is installed for this project in `.claude/skills/impeccable`, for Claude Code only, without its design hook. Its context loader finds this file as `docs/DESIGN.md`.

1. **Keep this file as the source of truth.** `/impeccable document` writes a new `DESIGN.md` at the project root, which would give you two copies. If you run it, review the result as a diff and merge what's useful back here.
2. **Run `/impeccable init` once** to create `PRODUCT.md`, which it needs and doesn't have yet.
3. **Allow Inter if it gets flagged:**
   `npx impeccable ignores add-value overused-font Inter --reason "Brand font"`
4. **Prefer `audit`, `critique`, `polish` and `harden`** for consistency. `bolder`, `colorize` and `overdrive` deliberately push the style further.
5. **Test on one page first.** Its docs don't say how it resolves a conflict between its rules and your tokens.
6. **Full scans need the running app:** `npx impeccable detect http://localhost:PORT`. A source-only scan skips the contrast and small-text rules.
