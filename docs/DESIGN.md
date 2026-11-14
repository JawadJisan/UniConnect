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

**Image drop zone.** `ImageDropZone` (`components/image-drop-zone.tsx`) is used for the profile photo (`avatar-upload.tsx`, cropped to the square) and the club logo (`club-logo-upload.tsx`, fitted whole with `object-contain`). It is a real button, so Enter and Space open the picker and a drop works too. It is a square with `rounded-xl` and a dashed `border-strong` on `surface-2`, which turns `brand-text` on `brand-tint` while a file is dragged over it. The shared type and size limits are checked before any upload, and a problem shows inline in words. A chosen file previews in place (a local blob URL) with ghost Cancel and Upload photo. While uploading, an overlay on the image shows a spinner and "Uploading…". Success is a toast. A caption under the zone states the accepted types and size.

**Admin list (users).** `/dashboard/admin/users` is the pattern for list pages. A filter row sits above the table: a search input with a leading icon that updates the URL after a 300ms pause, then `NativeSelect` filters whose first option names the unfiltered state ("All roles"). Filters, sort and page live in the URL, so reload and back keep them, and any filter change returns to page 1. The table sits in a `rounded-lg` hairline frame, and sortable headers are buttons inside `micro-label` headers with `aria-sort`. Below `md` and `sm`, secondary columns (department, joined) are hidden rather than squeezed. Each row has one status badge with an icon (Suspended, then Unverified, then Active). Role is plain text, with the account type under it when they differ. The footer reads "21–40 of 134" in mono, with secondary Previous and Next buttons. While the next page loads, the previous one stays on screen at reduced opacity. The empty state says whether filters caused it and offers Clear filters.

**Admin record (user detail).** The record page reuses the profile layout: a sticky read-only Account cell on the left and action cells on the right. These are the role (with the terms that grant it and a secondary Recompute), the details form, and the account status. Suspend is the only `destructive` button, and it opens a `Dialog` that states the consequence and takes an optional reason for the audit log. Actions that can't apply (the admin's own account, other super admins) stay visible but disabled, with a sentence that says why.

**Club directory.** `/dashboard/clubs` shows clubs as a bento grid of cells (`sm:grid-cols-2 lg:grid-cols-3`), not a table: there is one club per department. Each cell is one link: a 40px `ClubLogo` (the logo fitted whole in a `rounded-lg` square, or initials on `surface-3`), the name, the department as a `micro-label`, the description clamped to two lines, and a hairline-topped `dl` of `FEE.MONTHLY` and `FEE.YEARLY` with amounts in mono (`৳1,500.00`, or "Not set"). The caller's own club carries a `secondary` "Your department" badge. Cells enter with a short `m.li` stagger; hover is CSS only (`border-strong`, `surface-2`). A mono count sits under the grid instead of a pager.

**Club record.** `/dashboard/clubs/[id]` and `/dashboard/clubs/my-club` share one layout, the admin record's: a sticky read-only About cell on the left (description, fees, department, updated), and on the right the Committee (see Committee panel) followed, for the club's editors only, by "Details & fees" and "Logo". Viewers never see disabled edit controls; the panels are simply absent. Fee inputs are an `InputGroup` with a mono `৳` prefix and `inputMode="decimal"`. A super admin's "My club" is an info `FormAlert` linking to All clubs, not an error.

**Committee panel.** On the club record, the Committee cell has two forms. Viewers get the read-only current list (member, position, mono term) from the club detail, with no controls. The club's editors (its dept_admin, or a super admin) get every term from `GET /committee`: a `Current | All terms` toggle (two ghost `sm` buttons with `aria-pressed`, the pressed one on `surface-3`), then a `DataTable` (member with avatar, position, mono term from `sm`, `TermStatusBadge` from `md`, actions), 10 rows a page. Current rows end with a ghost Edit and a `destructive` `sm` End term, whose accessible names include the member; ended rows keep Edit only. The cell's footer holds the one `default` action, Assign member. End term always goes through a confirm `Dialog` that says the person loses moderator access unless another term keeps it.

**Person picker.** `PersonPicker` (`components/person-picker.tsx`) chooses one person inside a dialog: a search input with a leading icon that searches 300ms after typing stops (2 characters minimum), then the results as native radios drawn as rows (radio, 24px avatar, name, mono sub-line), in a `rounded-lg` hairline list that scrolls past about six rows. Arrow keys move between results and Enter submits. Someone who can't be picked stays listed but disabled, with the reason in words ("Already on the committee"). A "Selected: name" line keeps the choice visible after a new search. The hint line under the input carries the minimum-length hint, a skeleton while searching, the empty result naming the department, or the error; the whole picker can be disabled with a sentence saying why ("Choose a department first.").

**Term status badge.** `TermStatusBadge` (`components/`): an icon plus the word in uppercase mono, like the membership badge: `CURRENT` success, `ENDED` secondary.

**Admin list (dept admins).** `/dashboard/admin/dept-admins`, super admins only, follows the memberships list: `NativeSelect` filters in the URL (department, Current or Ended), page 1 on any change, the previous page dimmed while the next loads, Clear filters on an empty filtered result. The header carries the one `default` action, Assign dept admin. The admin cell is the name with the email under it; then department (from `md`), the mono date range (from `sm`) and the status badge. Current rows end with a secondary Renew and a `destructive` `sm` End early. Assign is a `Dialog`: department first, then a `PersonPicker` over that department's active faculty (disabled until a department is chosen), then native date inputs for the first and last day, defaulting to today and a year less a day. Renew takes new dates and says the role stays department admin throughout.

**Data table.** `DataTable` (`components/data-table.tsx`) wraps TanStack Table v9 (`useTable`, `FlexRender`) around the `Table` primitives. Columns come from `dataColumns<T>()`; a column's `meta.className` carries its responsive hiding (`hidden md:table-cell`) and alignment (`text-right` for amounts), so the markup stays the same for every table. With `pageSize` it pages on the client and hands the page count to a `footer` (the shared `Pager`); without it, it shows the rows it is given (server-paged lists). Rows enter with a short `m.tr` fade and stagger (`duration.base`, at most 10 rows staggered). `Pager` and `FilterSelect` live in `app/(app)/_components/list-controls.tsx`, shared by every list page.

**Membership page.** `/dashboard/memberships` is for `user_type` student (student moderators included): the bento grid with a sticky status cell on the left and History in the other two thirds. The status cell is a `Panel` titled with the club logo and name, tagged `SYS.MEMBERSHIP.STATUS`, and a `dl` of `STATUS` (badge), `PLAN`, `PERIOD` and `EXPIRES IN` or `STARTS` in mono. Its footer holds the actions the API's one-active, one-open rule allows: one `default` (Purchase membership or Renew), a ghost Cancel membership, a secondary Cancel checkout. With no fee set the default action is disabled and a sentence says why. Purchase and Renew open one `Dialog` whose plans are native radios drawn as two cards (`FEE.MONTHLY`, `FEE.YEARLY`, mono `৳` amount, period; checked is `border-brand` on `brand-tint`, a plan without a fee is disabled); "Continue to payment" sends the browser to the gateway, and a refusal shows the API's message in a `FormAlert` inside the dialog. Cancelling always goes through a confirm `Dialog` that says memberships are not refunded. The gateway's return (`?checkout=success|failed|cancelled`) shows an info or error `FormAlert` above the grid; it never grants anything, and a confirmed payment becomes a toast once the row leaves `pending`. History is a `DataTable` (club, plan, status, period from `sm`, right-aligned mono amount, payment from `md`, transaction ID from `lg`), 10 rows a page.

**Membership status badge.** `MembershipStatusBadge` (`components/`): an icon plus the word in uppercase mono, one per row: `ACTIVE` success, `SCHEDULED` default, `PENDING` warning, `EXPIRED` secondary, `CANCELLED` destructive.

**Admin list (memberships).** `/dashboard/admin/memberships` follows the users list: `NativeSelect` filters in the URL (status, plan, and club for super admins only; a dept_admin only ever sees their own club), page 1 on any change, the previous page dimmed while the next loads, "Clear filters" on an empty filtered result. The member cell is the name with the student ID (or email) under it. Each cancellable row ends with a ghost Cancel whose accessible name includes the member, opening the same confirm dialog.

**Sandbox checkout.** `/dashboard/memberships/checkout/mock` exists only outside production and stands in for the gateway's hosted page: a `warning` `SANDBOX` badge, a `Terminal` readout (`SYS.GATEWAY.MOCK`) of the transaction and amount, and three outcomes: `default` Simulate payment success, secondary Simulate failure, ghost Cancel payment.

**Event card.** `/dashboard/events` shows events as a bento grid (`sm:grid-cols-2 lg:grid-cols-3`) of `EventCard`s, server-paged with the shared `Pager`. Each card is one link: a 16:9 poster (`object-cover`, or the club's initials on `surface-2`), the title (two lines at most), the organizing club as a `micro-label`, an `EventStatusBadge` only when the event isn't published, then a hairline-topped `dl` of `WHEN`, `VENUE`, `SEATS` and `FEE` (mono values; a `warning` Full badge when the cap is reached; a fee reads `৳200.00` plus "paid at the venue", otherwise Free), then a Members only `secondary` badge and up to three `outline` department badges plus "+N". The filter row follows the admin list: search after a 300ms pause, then `FilterSelect`s for when, visibility, department and club, all in the URL. Cards enter with a short `m.li` stagger; the previous page dims while the next loads.

**Event record.** `/dashboard/events/[id]` uses the record layout: a sticky About cell (`SYS.EVENT.INFO`: the poster fitted whole, a `dl` of `WHEN`, `VENUE`, `SEATS`, `FEE`, `ACCESS`, the department badges with the viewer's own in `secondary`, and the description as plain text), then on the right the Registration panel (`SYS.EVENT.REGISTER`, never for a super admin), and for organizers only Manage (`SYS.EVENT.MANAGE`) and Poster (`SYS.EVENT.POSTER`, an `ImageDropZone` with `fit="contain"`). Registration shows the one action the API would allow: `default` Register, or the registration badge with a ghost Cancel registration (disabled after the start, with a sentence why), or an info `FormAlert` naming why registration is closed. A busy answer is retried quietly before an error with Try again appears. Manage holds Publish (`default`), Edit and Registrations & check-in (secondary links), Mark completed (secondary, disabled until the end) and Cancel event (`destructive`); each lifecycle change opens a confirm `Dialog` that states what happens and that it can't be undone.

**Event form.** `/dashboard/events/new` and `[id]/edit` sit in `container-narrow`, one `Panel` (`SYS.EVENT.NEW`, `SYS.EVENT.EDIT`) whose footer follows the save-button rule. Times are native `datetime-local` inputs in Dhaka time, in mono. Visibility is two native radios drawn as cards (checked is `border-brand` on `brand-tint`). The fee field appears only after "This event has a fee" is ticked, with the paid-at-the-venue note. Departments are a scrolling hairline list of native checkboxes; the organizing club's department stays ticked and disabled ("Always included"). Once published, dates, visibility and departments are disabled under one info `FormAlert` that says why.

**Registrations & check-in.** `/dashboard/events/[id]/registrations` (organizers only): the title with its status badge and a mono `SEATS` line, a status `FilterSelect` in the URL, and a secondary Download CSV link that keeps the filter. A `DataTable` lists person (avatar, name, mono student ID), department (from `md`), status badge, registered (from `sm`) and checked in (from `lg`). Check-in is a secondary `sm` button on registered rows of a published event, named with the person, with a spinner while it runs; the row turns `ATTENDED` from the response. There is no undo, as in the API.

**Event and registration status badges.** `EventStatusBadge` and `RegistrationStatusBadge` (`components/event-status-badge.tsx`): an icon plus the word in uppercase mono. Events: `DRAFT` secondary, `PUBLISHED` success, `CANCELLED` destructive, `COMPLETED` default. Registrations: `REGISTERED` default, `ATTENDED` success, `CANCELLED` destructive, `NO SHOW` warning.

**Announcements feed.** `/dashboard/announcements` is one column of cards, not a grid, so long text reads well. The header carries the one `default` action, New announcement, only for moderators, dept admins and super admins. The filter row follows the admin list, in the URL with page 1 on any change: a `FilterSelect` (All announcements, My department, My club; a super admin gets Department and Club selects instead) and a ghost `sm` Pinned only toggle with `aria-pressed` (`surface-3` when pressed). The shared `Pager` sits under the list; the previous page dims while the next loads. The empty state says whether filters caused it and offers Clear filters.

**Announcement card.** An `article` labelled by its title: a `Card` whose header row holds the `h2` (`text-md`, medium) and, opposite it, `SYS.ANNOUNCE.POST` or `SYS.ANNOUNCE.PINNED`. Under the title, a meta line: an `outline` uppercase mono scope badge (`CLUB · CSE Club`, `DEPARTMENT · CSE`), a `secondary` uppercase `PINNED` badge with a pin icon when pinned, then the author in `fg-secondary` and a relative time in a `<time>` whose title is the Dhaka date and time (plus "· edited" once changed). The body is plain text (`whitespace-pre-line`, never HTML), clamped to six lines behind a Show more link button with `aria-expanded`. A pinned card uses `border-border-strong`; there is no second accent. The footer appears only when the API's `can_pin` or `can_manage` flag is set, with ghost `sm` Pin or Unpin, Edit, and Delete (destructive text), each named with the title. Cards enter with a short `m.li` stagger.

**Announcement dialog.** One `Dialog` for New and Edit. Title and a seven-row Textarea with a mono count against 10,000. The audience follows the role: a moderator sees "Posting to CSE Club" as text; a dept admin picks Department or Club as two native radios drawn as cards; a super admin picks the kind and then a `NativeSelect` of every department or club. "Pin to the top" is a checkbox shown only to dept admins and super admins. Edit keeps the audience read-only, with a sentence that it can't change after posting; its Save follows the save-button rule. A refusal from the API shows in a `FormAlert` inside the dialog. Delete always goes through a confirm `Dialog` with a `destructive` Delete announcement.

**Tabs.** `Tabs` (`components/ui/tabs.tsx`) wraps Base UI Tabs: a hairline `border-border` list, each tab a 36px text button with an optional 16px icon, the active one in `foreground` over a 2px `brand-text` underline (its icon `brand-text` too). Arrow keys move between tabs, and each panel is labelled by its tab. A page that uses tabs keeps the active tab in the URL (`?tab=`), so reload and back keep it. Use tabs for sibling views of one subject, not for navigation the sidebar already gives.

**Blood hub.** `/dashboard/blood` is one page with three tabs: Requests, Donors and, for every role but a super admin, My donations. The header holds the one `default` action of the open tab: New blood request on Requests, Record donation on My donations, none on Donors. Each tab keeps its filters and page in the URL under its own prefix (`r_`, `d_`, `m_`), so switching tabs never drops another tab's filters. Requests is a `DataTable` (patient with hospital and reason under it, blood group, units in mono, needed by in mono with a `warning` Today badge on the last day, contact as a mono `tel:` link, requester with department, the status badge only on non-pending filters), with `FilterSelect`s for status (Pending first), blood group and requester's department. Actions come only from the API's `can_fulfill` (secondary `sm` Fulfill) and `can_cancel` (ghost `sm` Cancel), named with the patient. On phones the date and contact move under the patient, so the number stays one tap away. Donors is a `DataTable` (24px avatar and name, blood group, department from `md`, last donation in mono from `lg`, an uppercase `VERIFIED` success or `UNVERIFIED` secondary badge, phone as a `tel:` link or "Not shared"), with blood group and department selects and a ghost `sm` Verified only toggle with `aria-pressed`. An email never appears anywhere in the module. My donations pairs a `Panel` (`SYS.BLOOD.DONOR`: `BLOOD GROUP`, `LAST VERIFIED`, `RECORDS`) with the history `DataTable` (date, units, hospital from `sm`, status badge, verified on from `md`).

**Blood dialogs.** New blood request and Record donation are form dialogs (`SYS.BLOOD.REQUEST`, `SYS.BLOOD.DONATE` opposite the title) built on the shared schemas: native `date` inputs in mono limited to today in Dhaka (`min` for the needed-by date, `max` for the donation date), with the same rule checked on the field so its message shows with the others; units are number inputs in mono; the contact phone starts from the profile phone. Record donation shows the profile blood group as a read-only badge ("From your profile"); without one, an info `FormAlert` links to the profile. Fulfill (`SYS.BLOOD.FULFILL`) and Verify (`SYS.BLOOD.VERIFY`) are confirm dialogs with a hairline `dl` of the row's facts in `micro-label` terms; Fulfill says it does not record a donation, Verify says it updates the donor's last donation date. Cancel request is a confirm dialog with a `destructive` Cancel request. Refusals (409 already resolved) show in a `FormAlert` inside the dialog, and the list refreshes.

**Blood verifications.** `/dashboard/admin/blood-verifications` (dept admins and super admins) follows the memberships admin list: a department `FilterSelect` for super admins only, oldest donation first, the shared `Pager`. Columns: donor with mono student ID, department (super admins, from `md`), blood group, donated (from `sm`), units, hospital and recorded (from `lg`). Each row ends with a secondary `sm` Verify named with the donor; on the admin's own donation it stays visible but disabled, with "You can't verify your own donation." under it. A verified row leaves the queue at once.

**Blood badges.** `components/blood-badges.tsx`. `BloodGroupBadge` is metadata, not status: an `outline` mono badge with a droplet icon, the group written with a real minus (`O−`), and an `aria-label` that reads "Blood group O negative". It is never red, because red means status. `BloodRequestStatusBadge`: `PENDING` warning, `FULFILLED` success, `CANCELLED` destructive, `EXPIRED` secondary. `DonationStatusBadge`: `VERIFIED` success, `PENDING` warning. Both are an icon plus the word in uppercase mono.

**Overview (role dashboards).** `/dashboard` stacks one section per view the viewer has (`lib/dashboard.ts` `dashboardSections`): the role view first (`SYS.DASH.MOD`, `SYS.DASH.DEPT`, `SYS.DASH.SUPER`), then the personal view (`SYS.DASH.PERSONAL`) for every student and faculty account, titled "Your campus" alone or "For you" under a role view. A super admin has no personal view. Each section has an `h2` and its tag on one hairline, and fetches, loads (`Skeleton`) and fails (`ErrorState` with retry) on its own. A moderator without a seat gets an `info` `FormAlert`, not an error. The profile checklist sits at the bottom only while something is missing.

**Stat tile.** `StatTile` (`dashboard/_components/stat-tile.tsx`), in a `StatRow` (one column, `sm:` two, `xl:` four): a `micro-label`, the figure in mono tabular `text-display-sm`, one `text-fg-tertiary` line of context. With `href` the whole tile is the link. `attention` raises the hairline to `warning/50` for a figure that asks for action (pending verifications, drafts), and the note says why in words. Money goes through `formatBdt`, never a float.

**Chart.** `HorizontalBarChart` (`dashboard/_components/bar-chart.tsx`, Recharts) for one series of counts (users by role, by department): one hue (`--chart-3`), 14px bars with a 4px rounded data end, the value written at the bar's end in `--fg-2`, no legend (the panel title names the series), a dashed `--border` grid, a token tooltip on hover. The chart is `aria-hidden`; an `sr-only` table carries the same numbers. Role rows keep role order with zeros; departments sort largest first. Never a second axis, never a rainbow.

**Health strip.** `HealthStrip` (`SYS.DASH.HEALTH`): Database and Redis as two cells with an icon and "Up" or "Down", then a table of BullMQ queues (mono name, state, waiting, active, delayed, failed). States are icon plus word: `OK` success, `Has failures` destructive, `No answer` warning (Redis didn't reply; the counts read "—"). A "Checked" time under it; the super admin view refetches every 60 s.

**Audit log.** `/dashboard/admin/audit-logs` (super admin only, `SYS.AUDIT.LOG`) follows the admin lists: filters in the URL above a `DataTable`. Action is a `NativeSelect` grouped with `optgroup` by area (`lib/audit.ts`); entity type is a text input pushed to the URL 400 ms after typing stops; From and To are date inputs with visible `micro-label` labels, and a backwards range is refused on the page (`FROM_AFTER_TO`, `aria-invalid`) without a request. Clicking an actor's name filters to them and shows a removable "Actor:" chip. Columns: Dhaka time in mono, actor (name plus an `outline` role badge, or "System"), action as a mono `secondary` badge, entity (`Type #id`, `sm:` up), IP (`lg:` up), and Inspect. Never an email.

**Audit diff.** `AuditDiffDialog` (`SYS.AUDIT.DIFF`, `sm:max-w-2xl`), titled by the action in words: a `dl` of action, actor, entity and IP, then the changed keys, each with an icon and a word (`Added`, `Removed`, `Changed`) and the value in mono, old → new with the old struck through. Unchanged keys are counted, not listed. Under them, Before and After as raw JSON in two scrolling `pre` blocks.

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
- The `SYS.*` tags on workspace panels (`SYS.PROFILE.*`, `SYS.ACCOUNT`, `SYS.ACCESS`, `SYS.USER.*`, `SYS.CLUB.*`), which extend the `SYS.MODULE.*` exception at the user's request. In the app they sit opposite the title in the panel's header row, never above it.
- The `FEE.MONTHLY` and `FEE.YEARLY` `micro-label` terms in club fee lists, at the user's request.
- The `SYS.MEMBERSHIP.*` panel tags and `SYS.GATEWAY.MOCK`, and the uppercase membership status badges (`ACTIVE`, `SCHEDULED`, …), all at the user's request.
- The uppercase term status badges (`CURRENT`, `ENDED`) on committee and dept admin terms, at the user's request (2026-11-12).
- The `SYS.EVENT.*` panel tags, the `WHEN`, `VENUE`, `SEATS`, `FEE`, `ACCESS` and `DEPARTMENTS` terms, and the uppercase event and registration status badges, all at the user's request (2026-11-12). Other badges keep sentence case.
- The `SYS.ANNOUNCE.*` card tags and the uppercase `PINNED`, `CLUB · …` and `DEPARTMENT · …` announcement badges, at the user's request (2026-11-14). Hairlines use the `border-border` token, not a raw `border-white/5` (confirmed by the user the same day).
- The `SYS.BLOOD.*` panel and dialog tags, the `PATIENT`, `GROUP`, `UNITS`, `HOSPITAL`, `NEEDED BY`, `DONOR`, `DONATED`, `BLOOD GROUP`, `LAST VERIFIED` and `RECORDS` terms, and the uppercase request, donation and donor status badges, at the user's request (2026-11-14). The blood group badge is deliberately `outline`, not red: red stays a status color.
- The `SYS.DASH.*` section and panel tags, `SYS.AUDIT.*` on the audit log, its dialog and the recent activity panel, and the mono uppercase audit action badges (`ROLE_CHANGED`), shown as stored so they match the filter (2026-11-14).

## 12. Using Impeccable

[Impeccable](https://github.com/pbakaus/impeccable) 4.8.0 is installed for this project in `.claude/skills/impeccable`, for Claude Code only, without its design hook. Its context loader finds this file as `docs/DESIGN.md`.

1. **Keep this file as the source of truth.** `/impeccable document` writes a new `DESIGN.md` at the project root, which would give you two copies. If you run it, review the result as a diff and merge what's useful back here.
2. **Run `/impeccable init` once** to create `PRODUCT.md`, which it needs and doesn't have yet.
3. **Allow Inter if it gets flagged:**
   `npx impeccable ignores add-value overused-font Inter --reason "Brand font"`
4. **Prefer `audit`, `critique`, `polish` and `harden`** for consistency. `bolder`, `colorize` and `overdrive` deliberately push the style further.
5. **Test on one page first.** Its docs don't say how it resolves a conflict between its rules and your tokens.
6. **Full scans need the running app:** `npx impeccable detect http://localhost:PORT`. A source-only scan skips the contrast and small-text rules.
