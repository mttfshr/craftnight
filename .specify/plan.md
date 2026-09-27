# Implementation Plan: craftnight MVP

**Date**: 2026-05-03
**Spec**: .specify/spec.md

---

## Summary

craftnight is a SvelteKit application with a Drizzle + D1 (SQLite) data layer, deployed as a Cloudflare Worker. The architecture is deliberately boring: server-rendered pages with progressive enhancement, form actions, and signed cookies. There is no client-side state management, no notification system, no container, and no server to operate. The organizer UI is built as part of the same app under a protected `/organizer/*` prefix. Guest notifications are handled manually by the organizer, who texts guests using the phone numbers collected on the RSVP form — see ADR-001 and FR-014a.

Revised 2026-09-27 (ADR-006, ADR-007). The original plan targeted a DigitalOcean droplet running Docker Compose with Postgres, behind a Cloudflare Tunnel. That arrangement carried the full dependency surface of Cloudflare *and* the full operational burden of a server. The app now runs entirely on Cloudflare: Worker as origin, D1 as database, R2 binding for images, Turnstile, Web Analytics.

---

## Technical Context

**Language**: TypeScript (strict mode)
**Framework**: SvelteKit with file-based routing and server actions
**ORM**: Drizzle ORM with `drizzle-kit` for migrations
**Database**: Cloudflare D1 (SQLite), bound as `platform.env.DB`
**Image Storage**: Cloudflare R2 via native Worker binding (`platform.env.BUCKET`)
**Ingress**: None — the Worker is the origin. Cloudflare terminates SSL.
**Bot Protection**: Cloudflare Turnstile (subscribe/RSVP form)
**Analytics**: Cloudflare Web Analytics (public event pages)
**Build Tool**: Vite (bundled with SvelteKit)
**Adapter**: `@sveltejs/adapter-cloudflare`
**Platform**: Cloudflare Workers. Web platform APIs only — WebCrypto, `fetch`, `Request`/`Response`. No `nodejs_compat`, no `node:*` imports, no `Buffer`.
**Local dev**: `vite dev` with adapter-cloudflare's `platformProxy` enabled, so `platform.env` is backed by Miniflare — real local D1 and R2 without `wrangler dev`.

**Dependencies**:
- `drizzle-orm` + `drizzle-kit` — schema and migrations (SQLite dialect; generate-only, `wrangler d1 migrations apply` applies)
- `micromark` — markdown → HTML, server-side; escapes raw HTML by default, so no sanitizer is needed
- `cookie` — cookie parsing
- `vitest` (dev) — tests; DB tests use wrangler's own `getPlatformProxy`, so no extra test dependency

**Removed Dependencies**:
- ~~`@resend/node`~~, ~~`twilio`~~, ~~`jose`~~ — blast, SMS, magic links (ADR-001)
- ~~`postgres`~~ — Postgres driver; D1 needs no driver, only the binding (ADR-006)
- ~~`@aws-sdk/client-s3`~~ — replaced by the R2 binding; was ~3 dozen transitive packages for a single `PutObject` (ADR-006)
- ~~`bcryptjs`~~ — replaced by PBKDF2 via WebCrypto (FR-059, ADR-006)
- ~~`dotenv`~~ — secrets come from `platform.env` / `.dev.vars`, not dotenv (ADR-006)
- ~~`@tiptap/*`~~ (core, pm, starter-kit, extension-placeholder) — replaced by a `<textarea>` (ADR-007)
- ~~`isomorphic-dompurify`~~ — pulled in jsdom, cannot run on Workers, and is unnecessary once the renderer escapes raw HTML (ADR-007)
- ~~`@sveltejs/adapter-node`~~, ~~`@sveltejs/adapter-auto`~~ — adapter-auto was installed and unused

**Constitution Constraints Met**:
- SvelteKit frontend and backend ✅
- Drizzle ORM ✅
- Cloudflare Workers ✅ (ADR-006)
- Cloudflare D1 ✅ (ADR-006)
- Web platform APIs only, no `nodejs_compat` ✅
- TypeScript ✅
- Cloudflare R2 via native binding ✅
- Cloudflare Turnstile ✅
- Cloudflare Web Analytics ✅
- Markdown for formatted text ✅ (ADR-007)
- No notification delivery ✅ (ADR-001)

---

## Constitution Check

✅ **SvelteKit + Drizzle + D1**: Stack matches exactly.
✅ **Privacy is structural**: No social graph, no contact harvesting. Guest data never appears in URLs or public HTML (NF-005) — contact details render only in authenticated organizer views. Cloudflare Web Analytics is cookie-free and non-fingerprinting.
✅ **No account required to view or RSVP**: Public pages are server-rendered. Core content present in initial HTML (NF-001). Turnstile and analytics are progressive enhancements.
✅ **Organizer owns the data, not the hardware**: Amended value. Content is markdown, the database is a SQLite file exportable with `wrangler d1 export`, images are ordinary objects in a bucket. No proprietary format anywhere in the data layer. The runtime is vendor-dependent and we accept that explicitly rather than half-accepting it.
✅ **Web platform APIs only**: WebCrypto for HMAC and PBKDF2, `fetch` for Turnstile, R2 and D1 via bindings. No `nodejs_compat` flag set. Any dependency needing `node:*`, `Buffer`, or a DOM fails the constraint (NF-006) — this is what disqualified `isomorphic-dompurify`.
✅ **TypeScript**: Drizzle schema inference + SvelteKit generated route types provide end-to-end safety.
✅ **Markdown for formatted text**: `<textarea>` in, markdown stored, HTML rendered server-side by a renderer that escapes raw HTML. No sanitization step exists because no untrusted markup is ever stored (ADR-007).
✅ **Do one thing well**: No blast channel of any kind (ADR-001). The organizer's contact list is an operational tool for manual texting (FR-014a), not a delivery system.
✅ **Cloudflare R2**: Images written through the Worker's R2 binding into the existing public bucket. No SDK, no credentials in env, no filesystem anywhere.
✅ **No ingress layer**: The Worker *is* the origin. `cloudflared`, the Dockerfile, and both Compose files are deleted (ADR-006).
✅ **Cloudflare Turnstile**: Applied to subscribe/RSVP form. Server action validates token before processing, and fails closed if the secret is absent (FR-057).
✅ **Cloudflare Web Analytics**: Script tag injected into public event pages. Cookie-free.
✅ **Costs nothing to run**: Workers, D1, and R2 free tiers comfortably cover a monthly event with 10-40 guests. No scheduled maintenance (NF-007).

---

## Project Structure

```
craftnight/
├── wrangler.jsonc                   # Worker name, compatibility_date, D1 + R2 bindings, vars
├── .dev.vars                        # Local secrets for platformProxy (gitignored)
├── drizzle.config.ts                # Drizzle-kit config — sqlite dialect, d1-http driver
├── vitest.config.ts                 # deliberately not vite.config.ts: no SvelteKit plugin, no dev emulator
├── svelte.config.js                 # adapter-cloudflare, platformProxy enabled
├── vite.config.ts
├── package.json
├── tsconfig.json
├── scripts/
│   └── hash-password.mjs            # FR-059: generate the PBKDF2 hash (plain ESM: kept outside the TS project, NF-006)
├── tests/                           # vitest: dates, ics, contact, subscribers (real in-memory D1)
│   ├── support/db.ts                # createTestDb(): getPlatformProxy + the real migrations
│   └── *.test.ts
├── drizzle/
│   └── migrations/                  # SQLite migrations, applied via `wrangler d1 migrations apply`
└── src/
    ├── app.html                     # HTML shell — Cloudflare Web Analytics script injected here
    ├── app.d.ts                     # App.Locals (organizer, subscriberCookie, db) + App.Platform (env bindings)
    ├── hooks.server.ts              # Build locals.db from platform.env.DB; organizer auth; subscriber cookie
    ├── lib/
    │   ├── components/
    │   │   └── MarkdownField.svelte # Plain textarea + a one-line syntax hint (ADR-007)
    │   ├── db/
    │   │   ├── index.ts             # makeDb(d1) factory — no module-level singleton (ADR-006)
    │   │   └── schema.ts            # Four tables: events, instances, subscribers, rsvps
    │   ├── server/
    │   │   ├── auth.ts              # Session sign/verify (WebCrypto HMAC, exp in payload); subscriber cookie read/write
    │   │   ├── password.ts          # PBKDF2 hash + constant-time verify (FR-059)
    │   │   ├── db-errors.ts         # isUniqueViolation — walks .cause, because drizzle wraps driver errors
    │   │   ├── markdown.ts          # renderMarkdown / toPlainText / withDescriptionHtml — server-only (ADR-007)
    │   │   ├── subscribers.ts       # resolveSubscriber(db, ...) — cookie → email → phone → create
    │   │   ├── r2.ts                # uploadImage(bucket, file) via the R2 binding (ADR-006)
    │   │   └── turnstile.ts         # Turnstile validation; fails closed without a secret (FR-057)
    │   └── utils/
    │       ├── slugify.ts           # Event slug generation from name
    │       ├── dates.ts             # todayIn / isPast / isUpcoming / zonedTimeToUtc, all against events.timezone (FR-020, FR-056)
    │       ├── contact.ts           # readContact / normalizePhone / normalizeEmail (FR-061)
    │       ├── jsonld.ts            # renderJsonLd — escapes < > & so descriptions can't close the <script> (FR-036)
    │       └── ics.ts               # buildICS(input) → RFC 5545 string, UTC instants, escaped and folded (FR-034)
    └── routes/
        ├── events/
        │   └── [slug]/
        │       ├── +page.server.js  # US4, US5, US6: load event+instance; resolve subscriber; form actions
        │       ├── +page.svelte     # Public event page — SSR, Turnstile widget, Web Analytics, Add to Calendar link
        │       ├── instances/
        │       │   └── [instanceId]/
        │       │       └── calendar.ics/
        │       │           └── +server.ts   # FR-033: generate and stream ICS file
        │       └── manage/
        │           ├── +page.server.js  # US10: load subscriber via cookie or token; update/unsubscribe actions
        │           └── +page.svelte
        ├── organizer/
        │   ├── +layout.server.js    # Auth gate: redirect to /organizer/login if no valid session
        │   ├── login/
        │   │   ├── +page.server.js  # US1: verify credentials, set session cookie
        │   │   └── +page.svelte
        │   ├── logout/
        │   │   └── +page.server.js  # US1: clear session cookie, redirect to login
        │   ├── +page.server.js      # US2, FR-022: load all events
        │   ├── +page.svelte         # Organizer dashboard — event list
        │   └── events/
        │       ├── new/
        │       │   ├── +page.server.js  # US2: create event action — upload image to R2, store URL
        │       │   └── +page.svelte
        │       └── [id]/
        │           ├── +page.server.js  # US2: load event + instance list
        │           ├── +page.svelte     # Event detail page
        │           ├── edit/
        │           │   ├── +page.server.ts  # FR-040: load event; update action (name, description, cover image, accent color)
        │           │   └── +page.svelte
        │           └── instances/
        │               ├── new/
        │               │   ├── +page.server.js  # US3: create instance action
        │               │   └── +page.svelte
        │               └── [instanceId]/
        │                   ├── +page.server.js  # US9: headcount, subscriber list
        │                   ├── +page.svelte     # Instance dashboard
        │                   └── edit/
        │                       ├── +page.server.ts  # FR-040: load instance; update action (date, time, location, description)
        │                       └── +page.svelte
        └── (no api/ routes — blast infrastructure removed per ADR-001)
```

**Structure Decision**: All server-only logic lives in `src/lib/server/` — SvelteKit enforces that these modules cannot be imported in client-side code. Public utility functions that are safe client-side (slug, date helpers) live in `src/lib/utils/`. Route files are thin: they call into `src/lib/server/` modules and return data or redirect. All files are `.ts` / `.svelte` with `<script lang="ts">`.

---

## Data Model

### events

**Purpose**: The persistent named event that guests subscribe to. Root entity.

**Fields**:
- `id`: text, primary key, app-generated `crypto.randomUUID()` (SQLite has no `gen_random_uuid()`)
- `name`: text, not null
- `slug`: text, not null, unique — used as `/events/[slug]` URL
- `description`: text, nullable — **markdown source** (ADR-007)
- `cover_image_url`: text, nullable — full public R2 URL
- `accent_color`: text, nullable — hex string e.g. `#e85d04`
- `timezone`: text, not null, default `'America/Los_Angeles'` — IANA identifier. Every date boundary and every calendar export resolves against this, never the runtime clock (FR-056)
- `created_at`: integer timestamp, not null, app-supplied at insert (SQLite has no `now()` default in Drizzle's D1 driver without `sql` defaults)

**Indexes**: `slug` (unique — used on every public page load)

**Lifecycle**: Created by organizer. Never deleted in MVP.

---

### instances

**Purpose**: A specific occurrence of an Event on a given date. What guests RSVP to.

**Fields**:
- `id`: text, primary key, app-generated `crypto.randomUUID()`
- `event_id`: text, not null, FK → events.id
- `date`: text, not null — `YYYY-MM-DD`. Stored as text so lexical comparison equals chronological comparison; interpreted in the parent Event's `timezone`
- `start_time`: text, not null — `HH:MM`
- `end_time`: text, not null — `HH:MM`; required for ICS DTEND and schema.org/Event endDate
- `location`: text, nullable
- `description`: text, nullable — **markdown source**; per-occurrence agenda, project instructions, what to bring (ADR-007)
- `status`: text, not null, default `'confirmed'` — one of `'proposed'`, `'confirmed'`, `'cancelled'` (see ADR-005)
- `created_at`: integer timestamp, not null, app-supplied at insert

**Indexes**: `event_id` (for listing instances per event); `(event_id, date)` (for finding upcoming instance); `(event_id, status)` (for filtering the Proposed section and confirm/cancel updates)

**Lifecycle**: Created by organizer, either directly as `confirmed` or as `proposed` (part of a date poll). A `proposed` Instance transitions to `confirmed` (chosen) or `cancelled` (not chosen) via the organizer's confirm action — never back to `proposed`. Never deleted in MVP; `cancelled` Instances are retained for the organizer's own reference but excluded from every public view.

---

### subscribers

**Purpose**: A guest's contact record for a specific Event. It exists so the organizer knows who is coming and how to reach them — manual coordination, not automated delivery (ADR-001, ADR-004, FR-014a). `phone` is retained and load-bearing: manual texting is the organizer's actual communication channel. Stable UUID is the identity key.

**Fields**:
- `id`: text, primary key, app-generated `crypto.randomUUID()` — stored in the signed cookie
- `event_id`: text, not null, FK → events.id — scoped per event
- `name`: text, not null
- `email`: text, nullable
- `phone`: text, nullable — stored in E.164 format (e.g., `+14155552671`) so it is tappable as a `tel:` link and matchable on re-subscribe
- `active`: integer (0/1), not null, default 1 — SQLite has no boolean type
- `created_at`: integer timestamp, not null, app-supplied at insert

**Constraints**:
- Check: `email IS NOT NULL OR phone IS NOT NULL` — at least one contact method required
- Unique: `(event_id, email)` — SQLite treats NULLs as distinct in a unique index, so rows with no email do not collide
- Unique: `(event_id, phone)` — same NULL behavior

**Indexes**: `event_id`; `(event_id, email)`; `(event_id, phone)` (for identity resolution lookups)

**Lifecycle**: Created on first subscribe. `active = false` on unsubscribe. Can be reactivated on re-subscribe.

---

### rsvps

**Purpose**: A single subscriber's RSVP status for a single Instance.

**Fields**:
- `id`: text, primary key, app-generated `crypto.randomUUID()`
- `subscriber_id`: text, not null, FK → subscribers.id
- `instance_id`: text, not null, FK → instances.id
- `status`: text, not null — one of `'yes'`, `'maybe'`, `'no'`
- `created_at`: integer timestamp, not null, app-supplied at insert
- `updated_at`: integer timestamp, not null, app-supplied on insert and on conflict-update

**Constraints**:
- Unique: `(subscriber_id, instance_id)` — one RSVP per subscriber per instance

**Indexes**: `instance_id` (for headcount queries); `(subscriber_id, instance_id)` (for upsert)

**Lifecycle**: Created or upserted when guest submits RSVP form. Immutable after instance date passes.

---

### ~~blast_log~~ — REMOVED per ADR-001 (2026-09-26)

Was a delivery record per notification sent. Never implemented against; removed via migration `0002_remove_blast_infrastructure.sql` along with `instances.blast_sent_at`/`instances.reminder_sent_at`.

---

## Architecture Decisions

### ADR-001: Remove Blast Notification Infrastructure (2026-05-03)

**Status**: Accepted

**Context**: The original spec included email blasts (Cloudflare Email Service), SMS blasts (Twilio), JWT magic links in notifications, a `blast_log` table, `blast.ts` orchestration, and blast buttons on the instance dashboard. During implementation, JWT magic links were first removed (notifications would just send the plain event URL). This led to the question: if the link isn't personalized, what does the blast actually add over the organizer manually sharing the event URL in their existing group thread (Signal, iMessage, etc.)?

**Decision**: Remove all blast infrastructure. This includes:
- `email.ts`, `sms.ts`, `blast.ts`, `jwt.ts`
- `blast_log` table — dropped via migration `0002_remove_blast_infrastructure.sql` (2026-09-26)
- Blast buttons and blast stats on the instance dashboard
- Twilio, Resend/Cloudflare Email, and `jose` dependencies
- The `api/twilio/webhook` route
- US7, US8, US11 user stories (announcement blast, reminder blast, SMS reply RSVP)
- `blast_sent_at`, `reminder_sent_at` columns on instances — dropped via the same migration

**Update (2026-09-26)**: Revisited and reconfirmed. A Twilio account application for SMS blast was declined (A2P 10DLC registration doesn't fit a small friends-scale project), which prompted a review of whether to reintroduce any blast channel. Decision: no blast infrastructure of any kind — SMS, email, or otherwise. Manual sharing via the organizer's existing group thread remains the entire notification story. The previously-deferred `blast_log` table and `blast_sent_at`/`reminder_sent_at` columns have been removed from the schema rather than kept dormant.

**Rationale**: The blast's primary value was delivering a personalized magic link that let guests RSVP with zero friction on a new device. Without that, the blast is just a notification that the organizer is already sending manually via their group chat. The remaining guest flow — subscribe + RSVP via the public event page, cookie-based returning guest recognition, manage/unsubscribe — works entirely without blasts. The organizer gets RSVP counts from guests who click through from the group thread and fill in the form.

**Consequences**:
- Positive: Dramatically simpler codebase. No third-party email/SMS accounts to configure or pay for. No Twilio regulatory registration required. No blast_log queries or UI to maintain.
- Negative: No automated notifications. Organizer must manually share the event URL each time a new instance is published. Guests on a new device without a cookie must re-enter their info (but resolveSubscriber silently matches them to their existing record via email/phone).
- Future: Revisited 2026-09-26 and reconfirmed — no blast channel of any kind is planned. This decision is closed, not deferred.

---

### ADR-002: Rich Text via Tiptap + Server-Side Sanitization (2026-05-03) — SUPERSEDED by ADR-007 (2026-09-27)

**Status**: Superseded

**Why it was superseded**: Two reasons, one practical and one that should have been caught at the time.

The practical one: `isomorphic-dompurify` depends on jsdom, which is a full DOM implementation requiring Node built-ins. It cannot run on Cloudflare Workers, so ADR-002 was a hard blocker on ADR-006.

The one that should have been caught: ADR-002's stated context was "the organizer is non-technical, so markdown is inappropriate." The organizer is the developer who wrote this. That premise was never true, and it justified roughly 25 packages plus a DOM implementation on the server to format sentences like "This month: linocut printing. Bring an apron."

The original decision text follows, retained because the alternatives it evaluated are still the relevant ones.

---

**Context**: Both Event descriptions (series overview) and Instance descriptions (per-occurrence agenda/instructions) needed to support formatted text — bold, italic, bullet lists, headings. The organizer is non-technical, so markdown is inappropriate. A rich text editor is required.

**Decision**: Use Tiptap with `@tiptap/starter-kit` and `@tiptap/extension-placeholder`. Build a single reusable `RichTextEditor.svelte` component that renders the Tiptap editor and syncs its HTML output to a hidden `<input>`, enabling natural form submission. Sanitize the submitted HTML server-side with `isomorphic-dompurify` before writing to the database. Render stored HTML on public pages with Svelte's `{@html}`.

**Rationale**: Tiptap is headless — it imposes no styles, plays well with Water.css, and the toolbar is fully custom. Output is clean HTML. `isomorphic-dompurify` runs in Node (no browser required), making it safe and straightforward to use in SvelteKit server actions. Storing HTML directly avoids a render-time conversion step.

**Alternatives Considered**:
- Markdown + marked/remark: Requires organizer to know markdown syntax. Rejected.
- Quill: Bundles its own CSS that conflicts with Water.css. Heavier. Older. Rejected.
- Pell: Unmaintained. Rejected.
- Storing raw Tiptap JSON: Adds a render step on every page load. Rejected in favor of storing HTML directly.

**Consequences**:
- Positive: WYSIWYG editing experience. Clean HTML output. Sanitization on write means stored data is always safe to render.
- Negative: Tiptap adds ~3 client-side JS packages (organizer pages only). Editor requires JavaScript — acceptable since organizer pages are not subject to NF-001's SSR requirement.

---

### ADR-003: Styling via Water.css (2026-05-03)

**Status**: Accepted

**Context**: The app needed baseline styling to move beyond unstyled browser defaults. Options ranged from a full component library (shadcn-svelte, Skeleton UI) to a classless stylesheet to hand-rolled CSS.

**Decision**: Use Water.css (`water.css@2`) via CDN link in `app.html`. Component `<style>` blocks handle layout constraints, accent color theming, and semantic overrides. No Tailwind, no component library.

**Rationale**: The app has very few component types. A full component library adds significant setup complexity (Tailwind config, component installation) for marginal benefit. Water.css is a single `<link>` tag that immediately improves typography, form elements, and tables. It's classless — existing semantic HTML benefits without markup changes.

**Known Limitations**: Water.css produces a developer-aesthetic result — clean and readable but not warm or personal. The guest-facing public event page is the highest-value target for a future design investment: custom typeface, more expressive accent color usage, cover image as a full hero. The organizer pages do not require this treatment.

**Consequences**:
- Positive: Zero new dependencies, no build step, immediate improvement.
- Negative: Cannot achieve a "friends for friends" warmth without additional CSS work beyond Water.css. Deferred.

---

### ADR-004: Multi-Instance Public Event Page (2026-05-04)

**Status**: Accepted

**Context**: The original public event page showed only the single next upcoming Instance. As the app matures into a recurring monthly event, guests need to see all upcoming dates (to plan ahead and RSVP to multiple), and all past dates (to see history and their own attendance record). The single-instance view also forced a confusing UX where the "subscribe" form was a separate concept from RSVPing, tied to automated notification delivery that no longer exists.

**Decision**: Redesign the public event page as two sections:

- **Upcoming**: all Instances with date ≥ today, sorted ascending (next first). Each shows date, time, location, formatted description, an "Add to Calendar" link, and an inline RSVP widget.
- **Past**: all Instances with date < today, sorted descending (most recent first). Each shows date, time, location, and the visitor's RSVP status if cookie-identified. No description, no RSVP form.

The `load()` function returns `{ upcomingInstances, pastInstances }` instead of `{ instance }`. Each instance in both lists includes the visitor's RSVP status (null if not identified or not RSVPed). The subscribe and rsvp server actions accept an explicit `instanceId` from a hidden form field.

**Turnstile placement**: One widget per page, on the first upcoming Instance that shows the first-time form. Cookie-identified guests skip Turnstile on all Instances. The first-time form collects name + contact, creating the guest record and setting the cookie. All subsequent instances on the same page (and all future visits) use the lightweight returning-guest form.

**Framing of guest record**: The guest record (currently named "subscriber") exists to support manual coordination — the organizer needs name and contact to know who is coming and how to reach them. This is independent of whether the guest received the group text. The first RSVP creates the guest record; it is not a "subscription" to automated delivery.

**Consequences**:
- Positive: Guests can RSVP to multiple upcoming dates in one visit. Past attendance history visible without logging in. No confusing distinction between "subscribe" and "RSVP".
- Positive: JSON-LD points to next upcoming Instance only (correct for SEO).
- Negative: Page load now fetches all Instances + all visitor RSVPs. At monthly cadence for years, this is still a small number of rows — no pagination needed for MVP.
- Negative: `+page.server.ts` and `+page.svelte` are significant rewrites. Prior implementation of single-instance flow is replaced entirely.

---

### ADR-005: Date Polls via Instance Status, Not a Separate Entity (2026-09-27)

**Status**: Accepted

**Context**: The organizer needs to propose two or more candidate dates for a single upcoming occurrence (e.g. "Sat Oct 24 or Sun Oct 25 — whichever works"), let guests RSVP to each independently, compare tallies, and confirm one — with the others disappearing from public view (spec US12, FR-047–055).

**Decision**: Add a `status` column to `instances`: `'proposed' | 'confirmed' | 'cancelled'`, defaulting to `'confirmed'`. No separate poll/vote entity is introduced. `rsvps` already keys on `(subscriber_id, instance_id)`, so a guest RSVPing to two `proposed` Instances just creates two ordinary RSVP rows through the existing subscribe/rsvp actions — no new mechanism there. The public page adds a Proposed section (status = `proposed`) above Upcoming; the Upcoming and Past queries add a `status = 'confirmed'` filter so a candidate never leaks into either. The organizer's "Confirm this date" action flips the chosen Instance to `confirmed` and every other `proposed` Instance for that Event to `cancelled`, in one transaction. There is no poll/batch identifier scoping which candidates belong together — confirm implicitly acts on all currently-`proposed` Instances for the Event, which assumes at most one live date-poll per Event at a time.

**Rationale**: This reuses the entire existing RSVP, lock, and card-rendering mechanism instead of building a parallel poll/vote system, in keeping with ADR-001's preference for minimal infrastructure. The only new concept is a three-value status field and one filter clause added to two existing queries.

**Alternatives Considered**:
- Separate `polls` + `poll_options` + `poll_votes` tables: More explicit, but duplicates almost everything `instances`/`rsvps` already do for no real gain at this scale.
- A `poll_group_id` on `instances` to scope confirm/cancel precisely, allowing overlapping concurrent polls: Rejected for now as unnecessary complexity for a single-organizer app that only ever runs one date-poll at a time; noted as a revisit-if-needed in the spec's clarifications.

**Consequences**:
- Positive: The whole feature is a thin extension of `InstanceCard`/RSVP mechanics already built for Phase 13 — no new tables, no new RSVP model, no notification changes.
- Negative: Safe only for one live date-poll per Event at a time. If two independent polls ever need to run concurrently on the same Event, `confirmInstance` would need a poll/batch scope — deferred until it's an actual problem.
- Requires: A migration adding `instances.status` (`text not null default 'confirmed'`) and an index on `(event_id, status)` for the Proposed-section query and the confirm/cancel update.

---

### Decision 1: Stateless organizer session (no session table)

**Context**: NF-002 requires `httpOnly` signed cookie with 24-hour expiry and no server-side session table.

**Decision**: HMAC-SHA256 signed cookie. Payload is `{ exp: unixTimestamp }`. Signature is `HMAC(secret, JSON.stringify(payload))`. Both are base64-encoded and concatenated as the cookie value. `auth.js` exposes `createSession(res)`, `verifySession(cookieHeader)`, and `clearSession(res)`.

> **⚠️ Implementation drift, found 2026-09-27.** The shipped `auth.ts` did not implement this. It signed the literal constant string `"authenticated"` — the same payload every time, with no `exp` and no nonce — so the only expiry was the cookie's `maxAge`, which is a client-side hint. A copied cookie stayed valid until `SESSION_SECRET` rotated, violating NF-002. The decision above was correct; the code was not. Corrected in Phase 15.
>
> A second drift in the same file: `isOrganizerSessionValid()` returned `true` outright whenever `NODE_ENV !== 'production'`, so the entire organizer surface was gated on one environment variable being set correctly. On Workers, where `process.env.NODE_ENV` does not exist, that bypass would have failed *open* in production. See FR-057 — dev bypasses must require an explicit opt-in flag and fail closed.

**Rationale**: No library dependency needed. WebCrypto's `crypto.subtle` handles HMAC-SHA256 (async, unlike Node's `createHmac`, so the verify path is async throughout). Simple enough to audit in 30 lines. Organizer credentials live in `platform.env` — single organizer, no user table needed.

**Alternatives Considered**:
- `iron-session`: Would work but adds a dependency for a single use case.
- Lucia / Auth.js: Overkill for a single-organizer app.

**Consequences**:
- Positive: No session table, no DB hit on every request, easy to invalidate by rotating the secret.
- Negative: Cannot invalidate a specific session without rotating the secret (acceptable for a single organizer).
- Negative: HMAC via WebCrypto is async, so `isOrganizerSessionValid` and `readSubscriberCookieMap` become async and `hooks.server.ts` awaits both. Mechanical, but it does ripple.

---

### Decision 2: Subscriber identity as signed cookie containing event-scoped UUIDs

**Context**: Subscribers are per-event. A guest may attend multiple events. FR-008 requires a persistent cookie. FR-006 requires a stable UUID as the identity key.

**Decision**: A single `craftnight_id` cookie containing a HMAC-signed JSON object: `{ [eventSlug]: subscriberUUID, ... }`. On each public page load, the route reads the relevant slug's UUID from the cookie and looks up the Subscriber.

**Rationale**: One cookie handles multiple events gracefully. Signing the whole JSON blob prevents tampering with any UUID. Cookie path is `/` so it's sent on all routes.

**Alternatives Considered**:
- One cookie per event (path-scoped): More isolated but harder to manage and read in hooks.
- Store contact info in cookie: Never — violates NF-005 and the privacy constitution value.

**Consequences**:
- Positive: Works across multiple events; single cookie to manage.
- Negative: Cookie grows slightly with each new event subscription — negligible at this scale.

---

### Decision 3: ~~Subscriber tokens as stateless JWTs~~ — SUPERSEDED by ADR-001

JWT magic links and stateless subscriber tokens were removed. Notifications use the plain event URL. Guest identity on new devices is recovered by re-submitting the subscribe form, which silently matches via email/phone through the existing `resolveSubscriber` logic.

---

### Decision 4: Cover image storage in Cloudflare R2

**Context**: Events have cover images (FR-003, FR-023, FR-030). The app is self-hosted on a single Droplet but the organizer already has an existing public R2 bucket.

**Decision**: Organizer uploads an image via multipart form. The server action writes it to R2 through the Worker's native binding — `platform.env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata })` — in `src/lib/server/r2.ts`. The stored `cover_image_url` is the full public R2 URL. *(Amended 2026-09-27 by ADR-006: was `@aws-sdk/client-s3` against the S3-compatible endpoint.)*

**Rationale**: The binding needs no credentials, no endpoint URL, no signing, and no SDK. It replaced roughly three dozen transitive `@aws-sdk`/`@smithy` packages that existed to perform a single `PutObject`. Egress is free via Cloudflare's CDN. *(Note: earlier drafts of this decision assumed an existing provisioned bucket. There isn't one — the bucket is created as part of Phase 15, T088a.)*

**Alternatives Considered**:
- Filesystem + Docker volume: Simpler code but creates a stateful dependency on the Droplet. Images are lost if the volume is not explicitly preserved during redeployment.
- Accept URL only (no upload): Requires the organizer to host images elsewhere before creating an event — unnecessary friction.
- DigitalOcean Spaces: Would work but adds a second object storage account and credentials when R2 is already available.

**Consequences**:
- Positive: Images served via Cloudflare CDN with no egress fees, and nothing stateful anywhere in the app.
- Positive (2026-09-27): The binding removes all five `R2_*` credential env vars. Only `R2_PUBLIC_URL` remains, as a plain non-secret var in `wrangler.jsonc`, since the app needs to construct the public URL it stores.

---

### Decision 5: ~~Blast delivery as synchronous server action~~ — SUPERSEDED by ADR-001

The blast system has been removed entirely. See ADR-001.

---

### Decision 6: Identity resolution order (FR-006b)

**Context**: A guest may re-submit the subscribe form with an email or phone that already exists in the subscriber list.

**Decision**: `subscribers.js` implements the priority lookup in order:
1. Cookie UUID match — look up by `subscribers.id` scoped to the current `event_id`
2. Email match — `SELECT * FROM subscribers WHERE event_id = ? AND email = ? AND active = true`
3. Phone match — same pattern
4. Create new Subscriber record

On match via step 2 or 3, record the RSVP but do not update the subscriber's name (per clarification: keep original name on re-subscribe). Set/refresh the cookie with the matched UUID.

**Rationale**: This handles all the edge cases in the spec (duplicate email, duplicate phone, returning cookie guest) in one deterministic function. Centralizing in `subscribers.js` keeps the route action thin.

**Consequences**:
- Positive: Correct behavior for all known edge cases; easy to test.
- Negative: Three potential DB reads before creating a record — acceptable at this scale.

---

## Dependency Blocks

### Block 1: Infrastructure Foundation
**Dependencies**: None
**Builds**: Docker Compose (Postgres + app), SvelteKit scaffold, Drizzle schema + migrations, env var structure, `db/index.js` connection
**Why this block**: Nothing can run without the database and project scaffold
**Verification checkpoint**: `npm run dev` starts without errors; `drizzle-kit push` creates all 5 tables; `SELECT 1` from Postgres succeeds

### Block 2: Organizer Auth
**Dependencies**: Block 1
**Builds**: `auth.js` (sign/verify session cookie), `hooks.server.js` (auth guard), `/organizer/login` routes, `/organizer/+layout.server.js` guard, logout action
**Why this block**: Every organizer route is gated. No organizer feature can be built or tested without auth working
**Verification checkpoint**: Unauthenticated visit to `/organizer` redirects to login; valid credentials create session and land on dashboard; logout clears session

### Block 3: Event + Instance CRUD + Public Page
**Dependencies**: Block 2 (organizer creates events), Block 1 (DB)
**Builds**: Event create form + list + detail view; Instance create form; public `/events/[slug]` SSR page (read-only); OG meta tags; event theming (accent color)
**Why this block**: Instances are what guests RSVP to; the public page is the guest entry point — both are prerequisites for the guest flow
**Verification checkpoint**: Create an event, publish an instance, visit the public URL without a session — page renders with correct event and instance details; no JavaScript required

### Block 4: Guest Subscribe + RSVP
**Dependencies**: Block 3 (need a published instance)
**Builds**: `subscribers.js` identity resolution, subscribe+RSVP form action (first-time and returning), cookie management, RSVP locking after instance date, manage subscription page (US10)
**Why this block**: Subscribers must exist before any blast can be sent
**Verification checkpoint**: New guest submits form — Subscriber and RSVP records created, cookie set; return visit greets by name with RSVP status; changing RSVP updates record; past-instance page shows read-only state

### Block 5: ~~Blast + Notifications~~ — REMOVED per ADR-001

### Block 6: ~~P2 Features (Reminder Blast, SMS Reply)~~ — REMOVED per ADR-001

---

## Implementation Phases

### Phase 0: Project Setup
- Scaffold SvelteKit project (`npm create svelte@latest`) with TypeScript
- Add Drizzle, postgres driver, drizzle-kit
- Add `@aws-sdk/client-s3` for R2
- Configure `drizzle.config.js`
- Write `docker-compose.yml` with Postgres and `cloudflared` services
- Write `.env.example` with all required vars: `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET`, `RESEND_API_KEY`, `TWILIO_*`, `R2_*`, `CLOUDFLARE_TURNSTILE_SECRET`, `CF_TUNNEL_TOKEN`
- Configure `svelte.config.js` for Node adapter (`@sveltejs/adapter-node`)
- Inject Cloudflare Web Analytics script into `app.html`
- **Files**: `docker-compose.yml`, `drizzle.config.js`, `svelte.config.js`, `vite.config.js`, `.env.example`, `package.json`, `src/app.html`

### Phase 1: Database Schema (Block 1)
- Write `src/lib/db/schema.js` — all 5 tables with constraints and indexes
- Run `drizzle-kit generate` + `drizzle-kit push` to create tables
- Write `src/lib/db/index.js` — Drizzle connection using `postgres` pool
- **Files**: `src/lib/db/schema.js`, `src/lib/db/index.js`, `drizzle/migrations/`
- **Checkpoint**: Block 1 verification

### Phase 2: Organizer Auth (Block 2)
- Write `src/lib/server/auth.js` — HMAC cookie sign/verify/create/clear
- Write `src/hooks.server.js` — parse organizer session cookie into `locals.organizer`
- Write `src/routes/organizer/+layout.server.js` — redirect to login if not authenticated
- Write `src/routes/organizer/login/+page.server.js` + `+page.svelte`
- Write `src/routes/organizer/logout/+page.server.js`
- Write placeholder `src/routes/organizer/+page.svelte` (event list shell)
- **Checkpoint**: Block 2 verification

### Phase 3: Event Management (Block 3, part 1)
- Write `src/lib/utils/slugify.ts`
- Write `src/lib/server/r2.ts` — `uploadImage(file): Promise<string>` helper using `@aws-sdk/client-s3` pointed at R2 endpoint; returns public URL
- Write organizer event create: `src/routes/organizer/events/new/` (multipart form → R2 upload → store public URL)
- Write organizer event list: `src/routes/organizer/+page.server.ts` + `+page.svelte`
- Write organizer event detail: `src/routes/organizer/events/[id]/` (event info + instance list)
- **Files**: `slugify.ts`, `r2.ts`, organizer event routes

### Phase 4: Instance Management + Public Page (Block 3, part 2)
- Write instance create: `src/routes/organizer/events/[id]/instances/new/`
- Write instance dashboard shell: `src/routes/organizer/events/[id]/instances/[instanceId]/`
- Write `src/lib/utils/dates.ts` (isPast, isUpcoming)
- Write `src/lib/utils/ics.ts` — `buildICS(event, instance): string`; no library needed, plain template string; DTEND uses `end_time` (always set — not nullable); UID = `instance.id@craftnight`; dates formatted as `YYYYMMDDTHHMMSSZ` in UTC; lines terminated with `\r\n`
- Write ICS endpoint: `src/routes/events/[slug]/instances/[instanceId]/calendar.ics/+server.ts` — load event + instance, call `buildICS`, return with `Content-Type: text/calendar` and `Content-Disposition: attachment; filename="event.ics"`
- Write public event page: `src/routes/events/[slug]/+page.server.ts` + `+page.svelte`
  - Loads event, current upcoming instance, handles missing instance and 404 states
  - OG meta tags (`og:title`, `og:description`, `og:image`) (FR-029)
  - JSON-LD `schema.org/Event` block: `name`, `description`, `startDate`, `endDate`, `location`, `image` (FR-036)
  - Accent color via CSS custom property in page `<head>`
  - "Add to Calendar" link to ICS endpoint (hidden when instance is past) (FR-035)
  - Read-only state when instance is past (FR-020, FR-021)
- **Checkpoint**: Block 3 verification

### Phase 5: Guest Subscribe + RSVP (Block 4)
- Write `src/lib/server/subscribers.ts` — full identity resolution (4-step priority lookup)
- Write `src/lib/server/turnstile.ts` — `validateTurnstileToken(token: string): Promise<boolean>` using Cloudflare's siteverify endpoint
- Extend `src/hooks.server.ts` — parse subscriber cookie into `locals.subscriberCookie`
- Extend public event page server with form actions:
  - `subscribe` action: validate Turnstile token → identity resolve → create/upsert Subscriber → record RSVP → set cookie
  - `rsvp` action: returning guest updates RSVP status (no Turnstile required — already identified by cookie)
- Add Turnstile widget to subscribe form in `+page.svelte`
- Add returning-guest branch to `+page.svelte` (greet by name, show current RSVP)
- Write manage subscription page: `src/routes/events/[slug]/manage/`
  - Identify via cookie only; redirect to event page if not identified
  - Update name/contact action
  - Unsubscribe action (deactivate + clear cookie entry for this slug)
- **Checkpoint**: Block 4 verification

### Phase 6: ~~Blast + Notifications~~ — REMOVED per ADR-001

### Phase 7: ~~P2 — Reminder Blast, SMS Reply RSVP~~ — REMOVED per ADR-001

### Phase 8: Polish + Production Hardening
- Write `docker-compose.prod.yml` (production env overrides, volume mounts)
- Write `Dockerfile` (Node 20, build step, production start)
- Error page (`+error.svelte`) — graceful 404 and 500 states
- Empty states for all organizer views (no events, no instances, no subscribers)
- Final validation against all acceptance scenarios in spec

---

## Complexity Notes

- **Subscriber identity resolution** is the most nuanced logic in the codebase. The 4-step priority lookup must be correct — incorrect matching would create duplicate subscribers or merge unrelated guests. It is also the only piece of real branching logic in the app and currently has no tests. Worth covering in isolation.
- **Phone normalization**: stored phones must be E.164 for the `tel:` links (FR-014a) and for step-3 identity matching to work. Normalize on write. There is no longer an inbound path to validate against, so the write path is the only place this can be enforced.
- **RSVP locking**: `isPast` compares against today's date *in the Event's timezone* (FR-020, FR-056), never the runtime's clock. A Worker's clock is UTC and it has no local zone, so this must be explicit. The check runs server-side on submit, not only at render, so a stale open page cannot slip a late RSVP through.
- **D1 has no multi-statement transactions** in the Postgres sense. The one place that matters is ADR-005's `confirmInstance`, which must flip one Instance to `confirmed` and the others to `cancelled` together. Use D1's `batch()` API, which applies atomically.
- **The `db` singleton cannot survive** the move to Workers — see ADR-006. `locals.db`, built per request in `hooks.server.ts`. Any new route file must take `db` from `locals`, never import it.
- **Nothing may import `node:*` or use `Buffer`** (NF-006). `nodejs_compat` is deliberately off, so such an import fails at build rather than silently bloating the bundle. Base64 work uses `atob`/`btoa` with `TextEncoder`/`TextDecoder`.

---

## Architecture Decisions (continued)

### ADR-006: Run Entirely on Cloudflare — Workers + D1 + R2 Bindings (2026-09-27)

**Status**: Accepted

**Context**: An architecture review before the first production deploy surfaced an incoherence. Constitution value #3 was "organizer owns the infrastructure — self-hosted, no dependency on VC-backed platforms." But the stack already depended on Cloudflare for ingress (Tunnel), image storage (R2), bot protection (Turnstile), and analytics. The DigitalOcean droplet was the only self-hosted component, and it sat behind a Cloudflare tunnel with no public ports. If Cloudflare went away the app was dark regardless of who owned the box.

So the project was paying the full cost of server ownership — OS patching, Postgres backups, a three-service Compose file, SSH-based migrations — while having already accepted the full dependency surface of a platform. That is the worst position on the curve. The two coherent ends are: drop the Cloudflare dependencies and genuinely self-host, or drop the server and go all-in.

**Decision**: Lean in. Everything runs on Cloudflare.

- **Runtime**: Cloudflare Workers via `@sveltejs/adapter-cloudflare`. The Worker is the origin. `cloudflared`, `Dockerfile`, `docker-compose.yml`, and `docker-compose.prod.yml` are deleted.
- **Database**: D1 (SQLite), reached through `drizzle-orm/d1` and the `platform.env.DB` binding. The three Postgres migrations are retired rather than translated — nothing is deployed, so the SQLite schema is written fresh.
- **Images**: the native R2 binding (`platform.env.BUCKET.put`). `@aws-sdk/client-s3` is removed.
- **Secrets**: `platform.env`, populated by `wrangler secret put` in production and `.dev.vars` locally. The `$env/static/private` build-time imports are removed.
- **Crypto**: WebCrypto only. `crypto.subtle` for HMAC, PBKDF2 for the organizer password. `bcryptjs` and `node:crypto` are removed, and the `nodejs_compat` flag is deliberately *not* set — it would let Node-shaped dependencies creep back in.
- **Constitution value #3** is amended from owning the hardware to owning the data.

**Rationale**: A Worker can't open a TCP socket, so Postgres needed one of three replacements: D1, Hyperdrive fronting a hosted Postgres, or Neon's HTTP driver. D1 wins on fit. The app's entire working set is four small tables for a monthly event with 10-40 guests; SQLite is correct sizing, not a compromise. It also eliminates the second vendor and the $5/mo Workers Paid requirement that Hyperdrive would impose.

The schema ports almost mechanically because the code already treats dates and times as strings: `date`/`time` columns become `text`, `uuid` becomes `text` with an app-generated `crypto.randomUUID()`, `boolean` becomes `integer`. The unique indexes behave identically, since SQLite also treats NULLs as distinct in a unique index. There are no Postgres-specific features in use — the constitution said as much from the start ("no exotic Postgres features needed").

**Alternatives Considered**:
- **Hyperdrive + Neon/Supabase**: Keeps Postgres and `postgres.js` unchanged. Rejected — requires Workers Paid and reintroduces a second vendor for a database that fits comfortably in D1.
- **Neon HTTP driver** (`drizzle-orm/neon-http`): Free tier, keeps Postgres. Rejected — an HTTP round trip per query, and the public event page issues several.
- **Stay on the droplet and drop Cloudflare instead** (Caddy for ingress, volume for images, no Turnstile, no CF analytics): This is the genuinely self-hosted option and it was seriously considered. Rejected because the value it protects is independence from a platform, and R2 + Turnstile + Tunnel had already been chosen deliberately in earlier ADRs. Reversing four decisions to recover a value the code had already traded away is a bigger change than accepting the trade explicitly.
- **Keep `nodejs_compat` on** so `node:crypto` and `Buffer` keep working: Rejected. It would have let `isomorphic-dompurify`/jsdom stay, and the whole point is a small, auditable Worker bundle. Banning Node built-ins outright is a cheap constraint that keeps the dependency tree honest (NF-006).

**Consequences**:
- Positive: Zero servers, zero cost at this scale, zero scheduled maintenance. Deploy is one command. No backups to administer (`wrangler d1 export` on demand), no SSL renewal, no OS patching.
- Positive: The dependency tree collapses. `postgres`, `@aws-sdk/client-s3` and its ~3 dozen transitive `@smithy`/`@aws-sdk` packages, `bcryptjs`, and `dotenv` all leave.
- Positive: Forces the fix to FR-020. The old date comparison used `new Date().toISOString()`, so the "midnight" RSVP lock actually fired at 5pm Pacific. A Worker has no local timezone at all, which made the latent bug impossible to ignore. Now explicit via `events.timezone` (FR-056).
- Negative — **the main structural cost**: D1 is a per-request binding, so the module-level `db` singleton in `src/lib/db/index.ts` cannot exist. `index.ts` becomes a `makeDb(d1)` factory, `hooks.server.ts` builds `locals.db` per request, and every route server file switches from `import { db }` to `locals.db`. That is ~11 route files plus `subscribers.ts`. Note that `resolveSubscriber` regains the `db` first parameter that tasks.md T039 originally specified — the singleton import was itself drift.
- Negative: WebCrypto HMAC is async where `node:crypto`'s was sync, so the cookie read/verify path becomes async and ripples into `hooks.server.ts`.
- Negative: Vendor dependency is now total and explicit. Mitigated at the data layer, not the runtime layer: markdown content, a SQLite file, and ordinary bucket objects are all portable. Migrating away means rewriting the deployment, not rescuing the data.
- Negative: D1 has no real transactions across statements in the way Postgres does. The only place this matters is ADR-005's `confirmInstance`, which flips one Instance to `confirmed` and the rest to `cancelled`. Use D1's batch API so the two statements apply atomically.

---

### ADR-007: Markdown in a Textarea, Not a Rich Text Editor (2026-09-27)

**Status**: Accepted — supersedes ADR-002

**Context**: ADR-002 chose Tiptap with HTML stored in the database and sanitized on write with `isomorphic-dompurify`. Two problems converged.

`isomorphic-dompurify` depends on jsdom — a full DOM implementation with Node built-ins, parse5, whatwg-url, css-tree, and the rest. It cannot run on Workers, making it a hard blocker on ADR-006. Running a DOM implementation on the server to sanitize a paragraph was already poor value before the platform made it impossible.

And ADR-002's premise was wrong. It justified the WYSIWYG with "the organizer is non-technical, so markdown is inappropriate." The organizer is the sole developer on this project. Roughly 25 Tiptap packages plus jsdom were carried to avoid asking that person to type `**bold**`.

**Decision**: Descriptions are authored as markdown in a plain `<textarea>` (`MarkdownField.svelte`, which is a textarea and a one-line syntax hint), stored as markdown source, and rendered to HTML server-side with `micromark` in `src/lib/server/markdown.ts`. The module lives under `$lib/server` deliberately: SvelteKit refuses to bundle that directory into client code, so "descriptions are only ever rendered on the server" is a build-time guarantee, and micromark never ships to the browser.

The security property is the important part: `micromark` escapes raw HTML rather than passing it through, by default. So there is no sanitization step, because no untrusted markup is ever stored or emitted. `{@html}` remains at the render site, but what it receives is output this codebase generated from a constrained grammar, not input a user supplied.

**Rationale**: Markdown is the portable format — it survives a migration away from this app, reads fine as plain text, and diffs cleanly. Storing source rather than rendered output means the rendering decision stays changeable. Removing the sanitizer removes an entire class of bug rather than defending against it.

**Alternatives Considered**:
- **Store ProseMirror JSON, keep Tiptap**: The other way to remove jsdom — the schema constrains output, so sanitization is unnecessary. Rejected once the "non-technical organizer" premise was examined: it keeps 25 packages to solve a problem that doesn't exist.
- **`marked`**: Smaller API but passes raw HTML through by default, so it would need a sanitizer — the thing being eliminated. Rejected.
- **`markdown-it`** with `html: false`: Also safe by default and has a better plugin story. A reasonable alternative; `micromark` chosen for being smaller and CommonMark-strict.
- **A Worker-safe HTML sanitizer** (HTMLRewriter-based): Keeps Tiptap and HTML storage. Rejected — solves the platform problem while keeping the weight and the stored-untrusted-markup design.

**Consequences**:
- Positive: `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `isomorphic-dompurify`, jsdom, and the whole ProseMirror tree leave. This is the largest single reduction in the dependency graph.
- Positive: No sanitization step to get wrong. No stored HTML to audit.
- Positive: `RichTextEditor.svelte`'s outstanding `state_referenced_locally` Svelte 5 warning disappears with the component, as does the Water.css dark-mode toolbar issue noted in HANDOFF.
- Positive: The organizer form now works with JavaScript disabled, which the Tiptap editor did not.
- Negative: No WYSIWYG. The organizer types markdown and sees the result after saving. Acceptable for one technical user writing a paragraph a month; revisit with a live preview pane if it ever grates.
- Negative: Existing descriptions in the local dev database are HTML and will render as escaped text. Irrelevant — nothing is deployed and dev data is disposable (spec clarification, 2026-09-27).
- Follow-on: the ICS `DESCRIPTION` field and the OG `description` meta tag must use a plain-text rendering of the markdown, not the source and not the HTML. `markdown.ts` exports `toPlainText` for this. The previous implementation passed stored HTML straight into the ICS file, so calendar clients showed literal tags (FR-034).

---

### ADR-008: Tests run in Node against a real in-memory D1 (2026-09-27)

**Status**: Accepted

**Context**: Phase 17 added the project's first tests. The logic most worth testing, `resolveSubscriber`, depends on SQLite behaviour: NULLs in unique indexes, CHECK constraints, and whether a unique index covers inactive rows.

**Decision**: `vitest` in plain Node. Database tests get a real, empty, in-memory D1 from `getPlatformProxy` (already part of wrangler), with the project's actual migration SQL applied (`tests/support/db.ts`). `vitest.config.ts` is separate from `vite.config.ts` so tests don't start the SvelteKit plugin's Cloudflare emulator.

**Alternatives Considered**:
- **`@cloudflare/vitest-pool-workers`** — runs the tests inside workerd. Most faithful, but it pins `vitest ^4.1`, and the project is on Vite 8 where vitest 5 is what supports it. Version risk for no gain over `getPlatformProxy`, which already gives real D1.
- **`better-sqlite3` or libsql in memory** — fast, but a different SQLite build behind a different driver, and a native dependency. It would test our assumptions rather than D1's behaviour.
- **Pure functions only** — leaves `resolveSubscriber` untested, which was the point.

**Consequences**:
- Positive: the T117b bug (re-subscribe crashes on a UNIQUE constraint) and the double-submit race were found by tests written *before* the fix, against production semantics.
- Positive: date, ICS and contact logic take an injectable clock or plain strings, so they need no database at all.
- Negative: the DB tests boot workerd, about a second per file.
- Note: tests live inside the TypeScript program and are held to `types: []`, so they read migration SQL with Vite's `import.meta.glob` rather than `node:fs`.

---

### ADR-009: Calendar times as UTC instants, not TZID + VTIMEZONE (2026-09-27)

**Status**: Accepted — amends FR-034

**Context**: The original FR-034 called for `DTSTART;TZID=...` plus a matching `VTIMEZONE` component. A correct VTIMEZONE for an arbitrary IANA zone has to be generated from rule data or shipped as a table, and clients differ in how they treat a missing or incomplete one.

**Decision**: Convert the Instance's wall-clock time in the Event's `timezone` to a UTC instant (`zonedTimeToUtc`, using `Intl`) and write `DTSTART:...Z` / `DTEND:...Z`.

**Consequences**:
- Positive: nothing to generate, nothing for a client to interpret differently. Each Instance is a single occurrence, so an instant is exactly what a calendar needs, and a guest in another zone sees the correct local time.
- Positive: `zonedTimeToUtc` is small and testable, including both 2026 DST transitions.
- Negative: an exported event no longer records which zone the organizer meant. Irrelevant for one-off instances; it would matter if recurring events (RRULE) were ever added.
- Known edge: a wall time that occurs twice (fall back) resolves to its first occurrence, and one that never occurs (spring forward) lands within an hour. Both are in the small hours.
