# Tasks: craftnight MVP

**Spec**: .specify/spec.md
**Plan**: .specify/plan.md
**Build order**: Sequential phases. Complete each phase before starting the next.
**Branching**: All work on main. Commits per task or logical group.

---

## Expected Source Layout

```
craftnight/
├── wrangler.jsonc
├── .dev.vars                                # gitignored; local secrets for platformProxy
├── drizzle.config.ts
├── svelte.config.js
├── vite.config.ts
├── package.json
├── tsconfig.json
├── scripts/
│   └── hash-password.ts                     # FR-059
├── drizzle/
│   └── migrations/                          # SQLite; applied via wrangler d1 migrations apply
└── src/
    ├── app.html                             # HTML shell — Cloudflare Web Analytics script
    ├── app.d.ts                             # App.Locals (organizer, subscriberCookie, db) + App.Platform
    ├── hooks.server.ts                      # locals.db from platform.env.DB; auth guard; subscriber cookie
    ├── lib/
    │   ├── components/
    │   │   ├── InstanceCard.svelte
    │   │   └── MarkdownField.svelte
    │   ├── db/
    │   │   ├── index.ts                     # makeDb(d1) factory
    │   │   └── schema.ts                    # events, instances, subscribers, rsvps
    │   ├── server/
    │   │   ├── auth.ts                      # WebCrypto HMAC; signed { exp } payload; subscriber cookie
    │   │   ├── password.ts                  # PBKDF2 hash + constant-time verify
    │   │   ├── markdown.ts                  # renderMarkdown / toPlainText — server-only (ADR-007)
    │   │   ├── subscribers.ts               # resolveSubscriber(db, ...) — cookie → email → phone → create
    │   │   ├── r2.ts                        # uploadImage(bucket, file) via R2 binding
    │   │   └── turnstile.ts                 # Turnstile validation, fails closed
    │   └── utils/
    │       ├── slugify.ts
    │       ├── dates.ts                     # timezone-aware isPast / isUpcoming
    │       ├── jsonld.ts                    # renderJsonLd — escapes < > & for use inside <script>
    │       └── ics.ts                       # buildICS with TZID + VTIMEZONE + RFC 5545 escaping
    └── routes/
        ├── +error.svelte
        ├── events/
        │   └── [slug]/
        │       ├── +page.server.ts          # US4, US5, US6: load + form actions
        │       ├── +page.svelte             # Public event page (SSR)
        │       ├── instances/
        │       │   └── [instanceId]/
        │       │       └── calendar.ics/
        │       │           └── +server.ts   # FR-033: ICS file endpoint
        │       └── manage/
        │           ├── +page.server.ts      # US10: load + update/unsubscribe actions
        │           └── +page.svelte
        └── organizer/
            ├── +layout.server.ts            # Auth gate: redirect to /organizer/login
            ├── +page.server.ts              # FR-022: load all events
            ├── +page.svelte                 # Organizer dashboard — event list
            ├── login/
            │   ├── +page.server.ts          # US1: verify credentials, set session cookie
            │   └── +page.svelte
            ├── logout/
            │   └── +page.server.ts          # US1: clear session cookie, redirect to login
            └── events/
                ├── new/
                │   ├── +page.server.ts      # US2: create event action (R2 binding upload)
                │   └── +page.svelte
                └── [id]/
                    ├── +page.server.ts      # US2: load event + instances; US12: confirmInstance
                    ├── +page.svelte
                    ├── edit/
                    │   ├── +page.server.ts  # FR-040
                    │   └── +page.svelte
                    └── instances/
                        ├── new/
                        │   ├── +page.server.ts   # US3: create instance action
                        │   └── +page.svelte
                        └── [instanceId]/
                            ├── +page.server.ts   # US9: headcount + guest list
                            ├── +page.svelte      # Instance dashboard (FR-014a contact links)
                            └── edit/
                                ├── +page.server.ts   # FR-040
                                └── +page.svelte
```

No `api/` routes exist — the Twilio webhook was removed per ADR-001. No `Dockerfile` or Compose files — removed per ADR-006.

---

## Phase 0: Setup

**Purpose**: Scaffold the project, install dependencies, configure tooling, and get a dev environment running.

- [x] T001 Scaffold SvelteKit project with TypeScript via `npm create svelte@latest` in `/Users/matt/Github/craftnight` (select TypeScript, ESLint, skeleton app)
- [x] T002 Install runtime dependencies in `package.json`: `drizzle-orm`, `postgres`, `@aws-sdk/client-s3`, `resend`, `twilio`, `jose`, `cookie`
- [x] T003 Install dev dependencies: `drizzle-kit`, `dotenv`, `@sveltejs/adapter-node`, `typescript`, `@types/cookie`
- [x] T004 Configure `svelte.config.ts` to use `@sveltejs/adapter-node`
- [x] T005 Write `drizzle.config.ts` reading `DATABASE_URL` from `dotenv` (points `drizzle-kit` at `src/lib/db/schema.ts`, output to `drizzle/migrations/`)
- [x] T006 Write `docker-compose.yml` with three services: `postgres` (Postgres 16, port 5432, named volume), `app` (Node 20, depends on postgres), `cloudflared` (image `cloudflare/cloudflared`, env `CF_TUNNEL_TOKEN`)
- [x] T007 Write `.env.example` with all required vars: `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `CLOUDFLARE_TURNSTILE_SECRET`, `CF_TUNNEL_TOKEN`, `ORGANIZER_EMAIL`, `ORGANIZER_PASSWORD_HASH`
- [x] T008 Add Cloudflare Web Analytics script tag to `src/app.html` inside `<head>` (FR-032)

**Checkpoint**: `npm run dev` starts without errors; app renders at localhost; `docker compose up postgres` starts Postgres successfully.

---

## Phase 1: Foundational — Database + Core Utilities

**Purpose**: Database schema, connection, and shared utilities required by every user story.

⚠️ CRITICAL: No user story work can begin until this phase is complete.

- [x] T009 Write `src/lib/db/schema.ts` — define all 5 tables (`events`, `instances`, `subscribers`, `rsvps`, `blast_log`) with all fields, constraints, unique indexes, and FK relationships exactly as specified in plan.md Data Model section
- [x] T010 Write `src/lib/db/index.ts` — create Drizzle ORM connection using `postgres` pool driver, reading `DATABASE_URL` from env; export singleton `db`
- [x] T011 Run `drizzle-kit generate` to produce initial migration in `drizzle/migrations/` and `drizzle-kit push` to apply to local Postgres
- [x] T012 [P] Write `src/lib/utils/slugify.ts` — `slugify(name: string): string` that lowercases, strips non-alphanumeric chars, collapses hyphens; exported for use in event create action
- [x] T013 [P] Write `src/lib/utils/dates.ts` — `isPast(date: string): boolean` and `isUpcoming(date: string): boolean` using server-side date comparison (date-only, midnight boundary per FR-020)
- [x] T014 [P] Write `src/app.d.ts` — augment `App.Locals` to declare `organizer: boolean`, `subscriberCookie: Record<string, string>`

**Checkpoint**: `SELECT 1` from Postgres succeeds; all 5 tables visible via `drizzle-kit studio`; TypeScript compiles without errors.

---

## Phase 2: User Story 1 — Organizer Login (Priority: P1) 🎯 MVP

**Goal**: Organizer can authenticate, access protected routes, and log out. All `/organizer/*` routes redirect unauthenticated visitors to login.

**Independent Test**: Visit `/organizer` without session → redirect to `/organizer/login`. Submit valid credentials → land on organizer dashboard. Logout → redirect back to login.

- [x] T015 [US1] Write `src/lib/server/auth.ts` — `createSession(cookies)`, `verifySession(cookieHeader): boolean`, `clearSession(cookies)` using HMAC-SHA256 (Node `crypto`) on `SESSION_SECRET`; session payload: `{ exp: unixTimestamp }`; 24-hour expiry (NF-002)
- [x] T016 [US1] Write `src/hooks.server.ts` — in `handle()`, verify organizer session cookie and set `locals.organizer = true/false`; initialize `locals.subscriberCookie = {}` (subscriber parsing added in Phase 6)
- [x] T017 [US1] Write `src/routes/organizer/+layout.server.ts` — check `locals.organizer`; if false, redirect to `/organizer/login`
- [x] T018 [US1] Write `src/routes/organizer/login/+page.server.ts` — `load()` redirects authenticated organizer to `/organizer`; `actions.default` compares submitted email/password against `ORGANIZER_EMAIL`/`ORGANIZER_PASSWORD_HASH` env vars (bcrypt); on success calls `createSession` and redirects to `/organizer`; on failure returns `{ error: 'Invalid credentials' }`
- [x] T019 [US1] Write `src/routes/organizer/login/+page.svelte` — login form with email + password fields; display error if returned; no session required to view
- [x] T020 [US1] Write `src/routes/organizer/logout/+page.server.ts` — `actions.default` calls `clearSession`, redirects to `/organizer/login`
- [x] T021 [US1] Write placeholder `src/routes/organizer/+page.svelte` — heading "Events" with "No events yet" empty state (to be filled in Phase 3)

**Checkpoint**: Unauthenticated visit to `/organizer` redirects to login. Valid credentials create session and land on organizer dashboard. Logout clears session. Invalid credentials show error with no session created.

---

## Phase 3: User Story 2 — Organizer Creates an Event (Priority: P1)

**Goal**: Organizer can create named Events with description, cover image (uploaded to R2), and accent color. Created events appear in the organizer dashboard.

**Independent Test**: Log in, create an Event with name, description, image, accent color. Confirm it appears in event list with no instances yet.

- [x] T022 [US2] Write `src/lib/server/r2.ts` — `uploadImage(file: File): Promise<string>` using `@aws-sdk/client-s3` `PutObjectCommand` pointed at R2 endpoint (`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`); returns full public URL (`${R2_PUBLIC_URL}/${key}`); key is `images/${crypto.randomUUID()}-${filename}`
- [x] T023 [US2] Write `src/routes/organizer/events/new/+page.server.ts` — `actions.default`: parse multipart form (name, description, accent_color, cover_image file); validate name is present; call `slugify` for slug; call `uploadImage` if file provided; insert into `events` table via Drizzle; redirect to `/organizer/events/[id]`; return validation error if name missing
- [x] T024 [US2] Write `src/routes/organizer/events/new/+page.svelte` — form with fields: name (required), description (textarea), accent_color (color picker input, default `#e85d04`), cover_image (file input); display validation errors; `enctype="multipart/form-data"`
- [x] T025 [US2] Write `src/routes/organizer/+page.server.ts` — `load()`: query all events from DB ordered by `created_at` desc; return `{ events }`
- [x] T026 [US2] Update `src/routes/organizer/+page.svelte` — render event list with name, slug, and link to event detail; show "No events yet" with link to `/organizer/events/new` when empty; include "New Event" button
- [x] T027 [US2] Write `src/routes/organizer/events/[id]/+page.server.ts` — `load()`: query event by id; query instances for this event ordered by date desc; return `{ event, instances }` or throw 404 if event not found
- [x] T028 [US2] Write `src/routes/organizer/events/[id]/+page.svelte` — display event name, description, cover image, accent color, slug (as public URL `/events/[slug]`); list instances with date and link to instance dashboard; "Add Instance" button; "No instances yet" empty state

**Checkpoint**: Create event via organizer UI → appears in event list → event detail shows no instances. Slug is auto-generated from name.

---

## Phase 4: User Story 3 — Organizer Publishes an Instance (Priority: P1)

**Goal**: Organizer can publish a new Instance under an Event with date, start time, end time, and optional location. Published instance appears on the public event page.

**Independent Test**: With existing Event, publish Instance with date/start/end. Confirm it appears on event detail and will appear on public page (to be verified after Phase 5).

- [x] T029 [US3] Write `src/routes/organizer/events/[id]/instances/new/+page.server.ts` — `load()`: verify event exists, return `{ event }`; `actions.default`: validate date, start_time, end_time all present; insert into `instances` table; redirect to `/organizer/events/[id]/instances/[instanceId]`; return validation errors if required fields missing
- [x] T030 [US3] Write `src/routes/organizer/events/[id]/instances/new/+page.svelte` — form with fields: date (date input, required), start_time (time input, required), end_time (time input, required), location (text input, optional); display validation errors; submit label "Publish Instance"
- [x] T031 [US3] Write `src/routes/organizer/events/[id]/instances/[instanceId]/+page.server.ts` — shell `load()`: query instance + parent event; return `{ event, instance, rsvpCounts: { yes:0, maybe:0, no:0, noResponse:0 }, subscribers: [] }`; blast actions added in Phase 7
- [x] T032 [US3] Write `src/routes/organizer/events/[id]/instances/[instanceId]/+page.svelte` — shell: display instance date, start time, end time, location; placeholder sections for headcount, subscriber list, blast buttons (filled in Phase 7)

**Checkpoint**: Create instance via organizer UI → appears in event detail instance list → instance dashboard page renders with correct date/time/location.

---

## Phase 5: User Story 4 — Guest Views Event Page (Priority: P1)

**Goal**: Any visitor can view the public event page (SSR, no JS required) with event details, upcoming instance, OG meta, JSON-LD, accent theming, Add to Calendar link, and ICS download endpoint.

**Independent Test**: Without session or cookie, visit `/events/[slug]` — page renders with correct event and instance details. Visit `/events/[slug]/instances/[id]/calendar.ics` — ICS file downloads.

- [x] T033 [US4] Write `src/lib/utils/ics.ts` — `buildICS(event: Event, instance: Instance): string`; plain template string, no library; fields: `SUMMARY` (event name), `DESCRIPTION` (event description), `DTSTART`/`DTEND` (date + time formatted `YYYYMMDDTHHMMSS`, no Z suffix — local time); `LOCATION` (if set), `UID` (`${instance.id}@craftnight`); lines terminated with `\r\n`; wrapped in `BEGIN:VCALENDAR` / `END:VCALENDAR`
- [x] T034 [US4] Write `src/routes/events/[slug]/instances/[instanceId]/calendar.ics/+server.ts` — `GET`: query event by slug and instance by id + event_id; call `buildICS`; return `Response` with `Content-Type: text/calendar`, `Content-Disposition: attachment; filename="event.ics"` (FR-033, FR-034)
- [x] T035 [US4] Write `src/routes/events/[slug]/+page.server.ts` (load only — form actions added in Phase 6) — query event by slug (404 if not found); query upcoming instances ordered by date asc, take first; set `subscriber = null` (cookie handling in Phase 6); return `{ event, instance, subscriber }`
- [x] T036 [US4] Write `src/routes/events/[slug]/+page.svelte` — SSR public page: render event name, description, cover image; display instance date/time/location or "No upcoming date scheduled"; set accent color via `<style>:root { --accent: {event.accent_color} }</style>` in `<head>`; OG meta tags (`og:title`, `og:description`, `og:image`) (FR-029); JSON-LD `schema.org/Event` block with `name`, `description`, `startDate`, `endDate`, `location`, `image` (FR-036); "Add to Calendar" link to ICS endpoint hidden when instance is past (FR-035); read-only "This event has passed" state when `isPast(instance.date)` (FR-020, FR-021); subscribe/RSVP form placeholder (wired in Phase 6)
- [x] T037 [US4] Write `src/routes/+error.svelte` — display friendly 404 ("Event not found") and 500 error states; link back to home

**Checkpoint**: Without any session, visit `/events/[slug]` — correct SSR output with event + instance data; OG tags present in `<head>`; JSON-LD present; no JavaScript required to read the page. ICS download returns valid `.ics` file.

---

## Phase 6: User Story 5 + 6 — Guest Subscribe + RSVP (Priority: P1)

**Goal**: First-time guest can subscribe and RSVP in one form (Turnstile protected). Returning guest is recognized by cookie, greeted by name, can update RSVP without re-entering details.

**Independent Test**: New guest submits subscribe form → Subscriber + RSVP records created, cookie set. Return visit → greeted by name, current RSVP shown. Change RSVP → record updates.

- [x] T038 [US5] Write `src/lib/server/turnstile.ts` — `validateTurnstileToken(token: string): Promise<boolean>` — POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret` and `response`; return `success` boolean (FR-031)
- [x] T039 [US5] [US6] Write `src/lib/server/subscribers.ts` — `resolveSubscriber(db, eventId, cookieUUID, email, phone): Promise<Subscriber>` implementing 4-step priority: (1) cookie UUID match, (2) email match on active subscribers, (3) phone match on active subscribers, (4) create new record; does not update name on match; returns matched or created Subscriber
- [x] T040 [US5] [US6] Extend `src/hooks.server.ts` — in `handle()`, after organizer session check: parse `craftnight_id` cookie (HMAC-signed JSON `{ [slug]: uuid }`); populate `locals.subscriberCookie` with parsed map; signature verification uses `SESSION_SECRET`
- [x] T041 [US5] [US6] Extend `src/routes/events/[slug]/+page.server.ts` — add subscriber resolution to `load()`: read UUID from `locals.subscriberCookie[slug]`, look up active Subscriber, query existing RSVP for current instance; add `subscribe` action (validate Turnstile token → resolve identity → upsert RSVP → set/refresh `craftnight_id` cookie); add `rsvp` action (returning guest: no Turnstile required — identified by cookie → upsert RSVP); both actions enforce `isPast` lock and return validation errors per spec acceptance scenarios
- [x] T042 [US5] [US6] Extend `src/routes/events/[slug]/+page.svelte` — wire subscribe form with Turnstile widget (`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async>`); first-time branch: form with name (required), email or phone (one required), RSVP status radio (yes/maybe/no), Turnstile widget; returning guest branch: greet by name, show current RSVP status, one-click change form (no Turnstile); disable form and show "This event has passed" when instance is past

**Checkpoint**: New guest submits form → Subscriber + RSVP records in DB, cookie set. Return visit (same browser) → greeted by name with RSVP status shown. Update RSVP → DB updated, no re-entry required. Invalid Turnstile token → error, no records created.

---

## Phase 7: User Story 9 — Instance Dashboard (Priority: P1)

**Goal**: Instance dashboard shows RSVP headcount and the guest list with statuses and contact details.

> **US7 (announcement blast) removed per ADR-001.** T043–T046 built blast, email, SMS, and JWT modules that were deleted on 2026-09-26 along with the `blast_log` table. They are struck through below rather than deleted so the phase numbering in git history still resolves.

- [x] ~~T043 Write `src/lib/server/jwt.ts`~~ — REMOVED (ADR-001)
- [x] ~~T044 Write `src/lib/server/email.ts`~~ — REMOVED (ADR-001)
- [x] ~~T045 Write `src/lib/server/sms.ts`~~ — REMOVED (ADR-001)
- [x] ~~T046 Write `src/lib/server/blast.ts`~~ — REMOVED (ADR-001)
- [x] T047 [US9] Extend `src/routes/organizer/events/[id]/instances/[instanceId]/+page.server.ts` — `load()`: RSVP counts by status; guest list with each guest's RSVP status for this instance; count of no-response guests (FR-013, FR-014)
- [x] T048 [US9] Extend `src/routes/organizer/events/[id]/instances/[instanceId]/+page.svelte` — RSVP counts; guest table with name, contact, status

**Checkpoint**: Dashboard shows accurate yes/maybe/no counts and a guest table with each person's status.

---

## Phase 8: User Story 10 — Guest Manages Subscription (Priority: P2)

**Goal**: Guests can view subscription details, update name or contact method, or unsubscribe, via cookie. Guests without a cookie are redirected to the event page where re-subscribing silently re-identifies them.

**Independent Test**: Remembered guest navigates to manage page → name and contact shown. Unsubscribe → record deactivated, cookie cleared.

- [x] T049 [US10] Write `src/routes/events/[slug]/manage/+page.server.ts` — `load()`: identify via cookie only (`locals.subscriberCookie[slug]`); redirect to event page if not identified; `update` action: update subscriber name and/or email/phone; `unsubscribe` action: set `active = false`, clear cookie entry for this slug, redirect to event page
- [x] T050 [US10] Write `src/routes/events/[slug]/manage/+page.svelte` — display current name and contact; update form; unsubscribe button with confirm prompt; confirmation messages; link back to event page

**Checkpoint**: Cookie-identified guest visits manage page → details shown. Update name/contact → DB updated, UUID unchanged. Unsubscribe → `active = false`, cookie cleared, redirected. Guest without cookie → redirected to event page to re-subscribe.

---

## Phase 9: ~~User Story 8 — Reminder Blast~~ — REMOVED (ADR-001)

T051 and T052 were never started and never will be. No blast channel exists.

---

## Phase 10: ~~User Story 11 — Guest RSVPs via SMS Reply~~ — REMOVED (ADR-001)

T053 was never started. It depended on an outbound SMS blast that does not exist and a Twilio account that was declined.

---

## Phase 11: Polish + Production Hardening

**Purpose**: Docker production config, Dockerfile, error handling, empty states, and final validation.

- [x] ~~T054 Write `Dockerfile`~~ — OBSOLETE (ADR-006); deleted in Phase 15
- [x] ~~T055 Write `docker-compose.prod.yml`~~ — OBSOLETE (ADR-006); deleted in Phase 15
- [x] T056 [P] Audit and add empty states across all organizer views — no events on dashboard, no instances on event detail, no subscribers on instance dashboard, no RSVPs on instance dashboard
- [x] T057 [P] Final validation pass — walk every acceptance scenario in spec.md and confirm each is met; fix any gaps found

**Checkpoint**: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build` starts all services. All acceptance scenarios pass. Error pages display correctly for 404 and 500.

---

## Dependencies & Execution Order

### Phase Dependencies
- Phase 0 (Setup) → Phase 1 (Foundational) → All user story phases → Phase 11 (Polish)
- Phase 1 must be complete before any Phase 2+ work begins (DB required)

### User Story Dependencies
- **US1** (Phase 2): Depends on Phase 1 only
- **US2** (Phase 3): Depends on US1 (organizer must be logged in to create events)
- **US3** (Phase 4): Depends on US2 (instances belong to events)
- **US4** (Phase 5): Depends on US3 (public page shows instance data)
- **US5 + US6** (Phase 6): Depends on US4 (subscribe form is on public event page)
- **US7 + US9** (Phase 7): Depends on US5/US6 (need subscribers to blast)
- **US10** (Phase 8): Depends on US5 (subscriber identity must exist)
- **US8** (Phase 9): Depends on US7 (reminder blast extends announcement blast infrastructure)
- **US11** (Phase 10): Depends on US7 (inbound SMS references instances from blast)

### Within Each Phase
- Server modules (`src/lib/server/`) → Route server files → Svelte components
- Schema → Connection → Migrations (Phase 1)
- `blast.ts` depends on `email.ts` + `sms.ts` + `jwt.ts` (all must exist before wiring blast actions)

### Parallel Opportunities
**Phase 1**: T012, T013, T014 can run in parallel (different files, no dependencies)
**Phase 5**: T033, T034 can run in parallel (ICS utility and endpoint are independent of page load)
**Phase 11**: T056, T057 can run in parallel

---

## Implementation Strategy

### MVP First (Recommended)
1. Complete Phase 0 + Phase 1 (foundation)
2. Complete Phase 2 (US1 — auth)
3. Complete Phase 3 (US2 — events)
4. Complete Phase 4 (US3 — instances)
5. Complete Phase 5 (US4 — public page)
6. Complete Phase 6 (US5 + US6 — subscribe + RSVP)
7. Complete Phase 7 (US7 + US9 — blast + dashboard)
8. **STOP. Run a real craft night.** Validate the core loop works.
9. Add Phase 8 (US10 — manage subscription)
10. Add Phase 9 (US8 — reminder blast)
11. Add Phase 10 (US11 — SMS reply RSVP)

### Incremental Delivery
Each phase adds value without breaking previous ones. The app is functional and usable after Phase 7. Phases 8–10 are P2 enhancements.

### Parallel Team Strategy
- One developer can work on organizer UI (Phases 3–4) while another builds guest infrastructure (Phase 5 ICS utilities, date helpers)
- `src/lib/server/` modules (auth, jwt, email, sms, blast, r2) can be written and unit-tested independently before wiring into routes

---

## Notes

- `[P]` = different files, no dependencies on incomplete tasks in same phase — can run in parallel
- `[US#]` = maps task to user story
- All files are `.ts` / `.svelte` with `<script lang="ts">` — no `.js` in `src/`
- `drizzle.config.ts` is the exception — needed by drizzle-kit CLI, uses `dotenv` to load env
- Stop at any phase checkpoint to validate independently before proceeding
- Commit after each task or logical group
- Phone numbers stored and matched in E.164 format throughout — normalize on subscriber create, validate on Twilio inbound
- `blast_sent_at` is set *before* iterating subscribers to prevent duplicate sends on partial failures

---

## Phase 12: Rich Text Descriptions + Edit Forms

**Purpose**: Add Tiptap rich text editing to event and instance descriptions. Add edit routes for both. Render descriptions on the public event page. Requires a schema migration.

**Dependencies**: Phase 11 complete. All prior phases complete.

---

### Step 1: Schema + Dependencies

- [x] T058 Add `description` column to `instances` table in `src/lib/db/schema.ts` — `text('description')` nullable; run `drizzle-kit generate` and `drizzle-kit push` to produce and apply migration
- [x] T059 Install Tiptap packages: `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`; install `isomorphic-dompurify` for server-side sanitization

---

### Step 2: Shared Editor Component

- [x] T060 Write `src/lib/components/RichTextEditor.svelte` — props: `name: string` (hidden input name), `value: string` (initial HTML); mounts Tiptap editor with StarterKit + Placeholder; toolbar buttons: bold, italic, bullet list, ordered list, h2; syncs editor HTML to hidden `<input name={name}>` on every update so the value submits with the form naturally; minimal toolbar styles scoped to component

---

### Step 3: Event Create + Edit

- [x] T061 Update `src/routes/organizer/events/new/+page.svelte` — replace plain `<textarea>` for description with `<RichTextEditor name="description" value="" />`
- [x] T061a Update `src/routes/organizer/events/new/+page.server.ts` — sanitize description with `isomorphic-dompurify` before inserting into DB
- [x] T062 Write `src/routes/organizer/events/[id]/edit/+page.server.ts` — `load()`: query event by id, return `{ event }`; `actions.default`: parse multipart form (name, description, accent_color, cover_image); validate name present; sanitize description; call `uploadImage` if new file provided; update `events` row; redirect to `/organizer/events/[id]`
- [x] T063 Write `src/routes/organizer/events/[id]/edit/+page.svelte` — pre-populated edit form: name input, `<RichTextEditor>` with existing description, accent color picker, cover image file input (show current image); `enctype="multipart/form-data"`; cancel link back to event detail

---

### Step 4: Instance Create + Edit

- [x] T064 Update `src/routes/organizer/events/[id]/instances/new/+page.svelte` — add `<RichTextEditor name="description" value="" />` below location field; label "Description / agenda"
- [x] T064a Update `src/routes/organizer/events/[id]/instances/new/+page.server.ts` — parse and sanitize description field before inserting instance
- [x] T065 Write `src/routes/organizer/events/[id]/instances/[instanceId]/edit/+page.server.ts` — `load()`: query instance + parent event; `actions.default`: parse form (date, start_time, end_time, location, description); validate required fields; sanitize description; update `instances` row; redirect to `/organizer/events/[id]/instances/[instanceId]`
- [x] T066 Write `src/routes/organizer/events/[id]/instances/[instanceId]/edit/+page.svelte` — pre-populated edit form: date, start/end time, location, `<RichTextEditor>` with existing description; cancel link back to instance dashboard

---

### Step 5: Add Edit Links to Organizer Views

- [x] T067 Update `src/routes/organizer/events/[id]/+page.svelte` — add "Edit event" link to `/organizer/events/[id]/edit`; render event description as `{@html event.description}` (already sanitized)
- [x] T068 Update `src/routes/organizer/events/[id]/instances/[instanceId]/+page.svelte` — add "Edit instance" link to edit route; render instance description as `{@html instance.description}` below date/time block

---

### Step 6: Public Event Page

- [x] T069 Update `src/routes/events/[slug]/+page.svelte` — render instance description with `{@html instance.description}` below the date/time/location block (FR-041); render event description with `{@html event.description}` (already in place as text — switch to HTML render)

---

**Checkpoint**: Organizer can write a formatted description for an event (series overview) and for each instance (agenda/instructions). Both descriptions render correctly with formatting on the public event page. Edit forms for events and instances pre-populate with existing content. Descriptions are sanitized before storage — no XSS possible from stored HTML.

---

## Phase 13: Multi-Instance Public Event Page

**Purpose**: Redesign the public event page to show all Instances in two sections — Upcoming (next first) and Past (most recent first) — with inline RSVP on each upcoming Instance. Replaces the single-instance view entirely. See ADR-004 in plan.md.

**Dependencies**: Phase 12 complete.

---

### Step 1: Update server load + actions

- [x] T070 Rewrite `src/routes/events/[slug]/+page.server.ts` `load()` — query all Instances for the event; split into `upcomingInstances` (date ≥ today, sorted asc) and `pastInstances` (date < today, sorted desc); if visitor is cookie-identified, query all their RSVPs for this event in one query and key by `instance_id`; return `{ event, subscriber, upcomingInstances, pastInstances, rsvpsByInstance }` where `rsvpsByInstance` is a `Record<string, Rsvp>`
- [x] T071 Rewrite `subscribe` action in `+page.server.ts` — read `instanceId` from form (hidden field); validate instance belongs to this event and is not past; validate Turnstile token; resolve identity; upsert RSVP; set cookie; redirect back to page
- [x] T072 Rewrite `rsvp` action in `+page.server.ts` — read `instanceId` from form (hidden field); validate instance belongs to this event and is not past; validate cookie identity; upsert RSVP; redirect back to page

---

### Step 2: Rewrite the public page template

- [x] T073 Rewrite `src/routes/events/[slug]/+page.svelte` — structure: event header (cover image, name, description, accent color); Upcoming section; Past section; keep OG meta, JSON-LD (pointing to first upcoming instance), Turnstile script tag (conditional — only when first-time form is shown)
- [x] T074 Upcoming section: for each upcoming Instance render — date/time/location, formatted description (`{@html}`), "Add to Calendar" link, inline RSVP widget; extracted into `InstanceCard.svelte`; card uses typographic date block (accent month, large day, muted weekday), pill action buttons for RSVP (Going/Maybe/Can't make it)
- [x] T075 Past section: for each past Instance render — date/time/location; if `rsvpsByInstance[instance.id]` exists show the visitor's RSVP status as a read-only badge; no description, no form; if no past instances show "No past events yet"

---

**Checkpoint**: Visit the public event page with multiple Instances. Upcoming section lists all future dates next-first, each with description and inline RSVP. Past section lists all past dates most-recent-first with visitor's RSVP shown. First-time visitor sees name+contact form on first upcoming instance only. Cookie-identified visitor sees status-only form on all upcoming instances. Submitting an RSVP updates the correct Instance's record.

---

## Phase 14: Date Poll (Proposed Instances)

**Purpose**: Let the organizer propose two or more candidate dates for a single occurrence, let guests RSVP to each independently, and let the organizer confirm one — the others are cancelled and disappear from every public view. See ADR-005 in plan.md, US12 and FR-047–055 in spec.md.

**Dependencies**: Phase 13 complete (the Proposed section sits alongside the existing Upcoming/Past sections and reuses `InstanceCard.svelte`).

---

### Step 1: Schema

- [x] T076 `instances.status` column, `(event_id, status)` index, and a CHECK constraint on the three values — done in Phase 15 as part of the fresh D1 schema (T092), so no separate migration was needed.

---

### Step 2: Organizer — create a proposed Instance

- [x] T077 Create-instance form: checkbox "This is a proposed date (part of a date poll)" with a one-line explanation that candidates get no calendar link until confirmed.
- [x] T077a Create-instance action reads the checkbox and writes `'proposed'` or `'confirmed'` — only ever one of those two literals, never the form value, since the column is a CHECKed enum (FR-048).

---

### Step 3: Organizer — compare candidates and confirm

- [x] T078 Organizer event page `load()`: candidates split out soonest-first for side-by-side comparison, each with yes/maybe/no tallies from `rsvpTallies` (FR-051). Cancelled instances stay in the main list, labelled (FR-054).
- [x] T079 Organizer event page: a "Proposed dates" table above the list with per-candidate tallies and a "Confirm this date" button whose `confirm()` prompt says how many other dates will be cancelled and that it can't be undone.
- [x] T080 `confirmInstance` action, backed by `confirmInstance()` in `src/lib/server/polls.ts`. **Corrected from the task text in two ways.** (1) "One transaction": D1 has no interactive transactions; the two UPDATEs go through one `db.batch()`, and `tests/polls.test.ts` proves against real D1 that a failing statement rolls the whole batch back, rather than citing the docs. (2) The target is now validated — it must be a `proposed` instance of THIS event. As originally written, "confirming" an already-cancelled candidate would have resurrected it while cancelling every live one, and an id from another Event would have flipped that Event's poll. A double-clicked button now loses cleanly (409) because the second call sees the target is no longer proposed.
- [x] T081 Instance dashboard shows a "Cancelled" notice (red) on a cancelled candidate and a "Proposed — compare candidates" notice on a live one, so landing on an old date directly can't be mistaken for a live one.

---

### Step 4: Public page — Proposed section

- [x] T082 Public `load()`: which section each instance belongs in — status AND date — is one pure, tested function, `partitionInstances` (`src/lib/utils/instances.ts`). Cancelled appears nowhere; proposed candidates appear regardless of date (a stale one is marked `locked`); upcoming and past are confirmed-only. The visitor's RSVP lookup covers only instances actually shown.
- [x] T083 Public page: a "Proposed dates" section above Upcoming, one `InstanceCard` per candidate with the same inline RSVP, a "Proposed" tag, and no calendar link. The Upcoming section is dropped while a poll is running with nothing confirmed, since "No upcoming dates" would contradict the section above it. A candidate whose date passed shows "RSVPs are closed" instead of a form that could only fail on submit (spec scenario 8).
- [x] T084 **Corrected: the actions DID need a change.** The task said no status filter was needed, and that holds for `proposed` (FR-050) but not for `cancelled`: a guest with a stale page open while the organizer confirmed another date could RSVP "yes" to a candidate that no longer appears anywhere. The check is extracted to `loadRsvpTarget` (`src/lib/server/rsvp-target.ts`): confirmed and proposed accepted, cancelled rejected ("This date was cancelled"), then the date lock in the Event's timezone. Tested against real D1, including the stale-page and 6:30pm-Pacific cases.
- [x] T085 **Corrected: the premise was wrong.** The task said the calendar endpoint is "keyed off `upcomingInstances[0]`" and needs no change. It isn't — the route takes `instanceId` straight from the URL, so a cancelled (or merely tentative) date still downloaded as a calendar file, violating FR-053. The endpoint now returns 404 for anything not `confirmed`. 404 rather than 403, so a cancelled date isn't even confirmed to have existed. OG meta and JSON-LD are keyed off `upcomingInstances[0]`, which is confirmed-only by construction, so those needed no change.
- [x] T085a **Found while building this phase: the public page never displayed action errors.** Neither `+page.svelte` nor `InstanceCard` read `form`, so a failed Turnstile check, an unreadable phone number (my Phase 17 messages), or a date that had just been cancelled all looked like the button doing nothing. All 11 failure sites in the two public actions now go through one `reject()` helper that attaches the instance id; the page shows the message on that card via `errorFor()`. A failure whose card is no longer on the page (a date cancelled since the guest loaded it — without JavaScript the response is a fresh page) gets a page-level banner instead of vanishing.
- [x] T085b **"Cancel this date"** (FR-065; decided: any non-cancelled date, final). `cancelInstance` in `src/lib/server/instance-status.ts`, tests first against real D1 (16). Buttons on the instance dashboard (which redirects back to the same page, so the going/maybe phone list is right there to text people) and in the Proposed table beside Confirm. Both dialogs say how many guests said going or maybe and that nothing is sent. The dashboard's "Cancelled" notice previously read "another date was confirmed", which was only true when confirming a sibling was the sole way to cancel; it now says what actually happens. Mutation-checked: removing the conditional UPDATE breaks 3 tests, dropping the event check from the read breaks 1. One mutation survived and is kept on purpose: `event_id` in the UPDATE's WHERE changes no behavior (the id is a primary key that never moves between events, and the read already checked), but it keeps the write scoped if the read is ever refactored. An earlier redundant "already cancelled" pre-check was removed instead, because it was a second decision that could drift from the first. Verified in workerd as the organizer: unauthenticated attempts blocked and changed nothing; a confirmed date with RSVPs cancels, its RSVPs stay, its calendar link 404s, the public page drops it, and a stale-page guest is refused with a visible reason, creating neither an RSVP nor a guest record; a double-click and a wrong-event attempt are harmless; cancelling one candidate leaves the poll running and the survivor can still be confirmed, and the cancelled one is not resurrected.

---

**Checkpoint (met — verified end to end in workerd, both as a guest and as the organizer)**: Publish two proposed Instances for an Event. On the public page, a Proposed section shows both candidates with independent RSVP forms and no calendar links. RSVP yes to one, maybe to the other. On the organizer's event page, both candidates show their tallies. Confirm one — reload the public page: the confirmed candidate now appears as a normal Upcoming Instance with its calendar link; the other candidate is gone from every section. On the organizer side, the cancelled candidate's dashboard still shows its data, labeled "Cancelled".
---

## Phase 15: Platform Migration — Cloudflare Workers + D1

**Purpose**: Move off Node/Postgres/Docker onto Workers/D1/R2 bindings. Fold in the auth correctness fixes, because they touch the same files and doing them twice is waste. See ADR-006, FR-056–059, NF-002, NF-006, NF-007.

**Dependencies**: None. Phase 14 (date polls) is unstarted and should be built *after* this, against the new schema.

**Nothing is deployed and dev data is disposable** — the D1 schema is written fresh, not migrated.

### Step 1: Toolchain

- [x] T086 Remove `@sveltejs/adapter-node`, `@sveltejs/adapter-auto`, `postgres`, `@aws-sdk/client-s3`, `bcryptjs`, `@types/bcryptjs`, `dotenv`. Install `@sveltejs/adapter-cloudflare` and `wrangler`. (Tiptap and DOMPurify leave in Phase 16.)
- [x] T087 Rewrite `svelte.config.js` — `adapter-cloudflare`, with `platformProxy` enabled so `vite dev` gets Miniflare-backed local D1 and R2
- [x] T088 Write `wrangler.jsonc` — worker name, `compatibility_date`, D1 binding `DB` (+ `migrations_dir`), R2 binding `BUCKET`, assets binding, plain vars `R2_PUBLIC_URL` and `PUBLIC_TURNSTILE_SITE_KEY`. Do **not** set `nodejs_compat` (NF-006).
- [~] T088a R2 bucket `craftnight-media` created. **Still to do:** enable public access in the dashboard and paste the URL into `R2_PUBLIC_URL`. *(There was no pre-existing bucket; earlier drafts of Decision 4 wrongly assumed one.)*
- [x] T089 Write `.dev.vars.example`; add `.dev.vars`, `.wrangler/`, and the generated `src/worker-configuration.d.ts` to `.gitignore`. Delete `.env` and `.env.example`.
- [x] T090 Delete `Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`
- [x] T091 Rewrite `src/app.d.ts` — `App.Platform` derives `env` from the generated `Cloudflare.Env` rather than restating bindings, overriding only the three secrets (optional, for fail-closed) and adding the dev bypass flag. `App.Locals` gains `db`.
- [x] T091a Toolchain corrections found while wiring up: wrangler's interactive prompts *appended* duplicate `craftnight` / `craftnight_media` bindings rather than filling in the existing `DB` / `BUCKET` ones — collapsed. `wrangler types` output moved to `src/` so SvelteKit's generated `include` (which only covers `src/**`) can see it. `"types": ["node"]` removed from `tsconfig.json`, which is what makes NF-006 compiler-enforced. npm scripts added: `cf-types`, `db:generate`, `db:migrate`, `db:migrate:remote`, `deploy`, `hash-password`.

### Step 2: Data layer

- [x] T092 Rewrite `src/lib/db/schema.ts` for SQLite — `sqliteTable`; `text` ids with `$defaultFn(() => crypto.randomUUID())`; `date`/`start_time`/`end_time` as `text`; `active` as `integer({ mode: 'boolean' })`; timestamps as `integer({ mode: 'timestamp' })`. Includes `events.timezone` (FR-056) and `instances.status` (FR-047 — Phase 14's T076 folded in). CHECK constraints added for `instances.status` and `rsvps.status`, which were only comments in the Postgres schema.
- [x] T093 Rewrite `src/lib/db/index.ts` — export `makeDb(d1: D1Database)` using `drizzle-orm/d1`. **Module-level singleton deleted.**
- [x] T094 Rewrite `drizzle.config.ts` — `dialect: 'sqlite'`, generate-only. *Changed from the original plan:* no `d1-http` driver and no `push`. `drizzle-kit generate` writes SQL, `wrangler d1 migrations apply` applies it, so migration state is owned by D1 and no Cloudflare API token is needed in local config.
- [~] T095 Postgres migrations deleted; `0000_wild_speedball.sql` generated and verified (4 tables, all indexes, both CHECK constraints, FKs). D1 `craftnight` created — `90e657c9-1ca8-486e-a336-0abfbb8297a9`. **Re-run `npm run db:migrate`:** the first apply ran against a local DB keyed on the `REPLACE_ME` placeholder id, so miniflare now points at a different, empty database.

### Step 3: Auth, crypto, and the fail-closed fixes

- [x] T096 Write `src/lib/server/password.ts` — PBKDF2-HMAC-SHA256 via WebCrypto, random per-hash salt, constant-time compare, stored as `pbkdf2$<iterations>$<salt-b64>$<hash-b64>`. Iterations are read from the stored string, so raising them later doesn't invalidate the existing hash (FR-059).
- [x] T097 Write `scripts/hash-password.mjs` — plain ESM, run with `npm run hash-password -- '<password>'`. *Changed from `.ts`:* the TS project excludes `@types/node` to enforce NF-006, so Node-only tooling stays outside it. Node 18+ has WebCrypto globally, so no deps and no tsx.
- [x] T098 Rewrite `src/lib/server/auth.ts` — WebCrypto HMAC (async throughout); session payload carries `exp` and the **server** verifies it (NF-002, fixes the Decision-1 drift); secret passed as a parameter rather than imported; base64url via `atob`/`btoa` + `TextEncoder`, no `Buffer`. The `NODE_ENV` bypass is replaced by `isAuthBypassed()`, which requires **both** `dev` from `$app/environment` (fixed at build time, unspoofable in a production bundle) **and** `DANGEROUSLY_DISABLE_ORGANIZER_AUTH === 'true'` (FR-057). A missing `SESSION_SECRET` returns false rather than true.
- [x] T099 Rewrite `src/hooks.server.ts` — build `locals.db` from `platform.env.DB`, 503 if the binding is absent; `await` the now-async organizer and subscriber cookie checks
- [x] T099a **Security fix — organizer actions were unauthenticated (FR-060).** Found while mapping the organizer form actions for Phase 16. `locals.organizer` was checked in exactly one place, the layout `load`, and SvelteKit does not run a layout load before a form action. Demonstrated against a live dev server: an unauthenticated `POST /organizer/events/new` inserted a row. Fixed with a path guard in `hooks.server.ts` (`/organizer` and `/organizer/*`, except exactly `/organizer/login`, redirect to login before any route code runs). Re-ran the same attacks afterward: create, edit, and instances/new all redirected to login and the database was unchanged. Unknown whether the pre-migration `hooks.server.ts` had this guard — Phases 1–13 were never committed, so there is no history to diff — but the current tree did not, and nothing was deployed.
- [x] T100 Update `src/routes/organizer/login/+page.server.ts` — `verifyPassword` from `password.ts`, secrets from `platform.env`, and a distinct 500 for missing auth config so a forgotten `wrangler secret put` doesn't present as "incorrect password". `logout/+page.server.ts` needed no change — `clearOrganizerSession` is still synchronous.
- [x] T101 Rewrite `src/lib/server/turnstile.ts` — secret and optional remote IP passed in; **a missing secret, an empty token, a non-OK response, and a network failure all return false** instead of the old fail-open `return true` (FR-057)
- [x] T102 Rewrite `src/lib/server/r2.ts` — `uploadImage(bucket, publicUrl, file)` via the binding; no SDK, no credentials. Added a MIME allow-list, a 5MB cap, and an extension derived from the declared type rather than the client filename; sets immutable cache headers.

### Step 4: Thread `locals.db` through every route

- [x] T103 Update `src/lib/server/subscribers.ts` — `resolveSubscriber(db, eventId, ...)` takes db as its first parameter, restoring the T039 signature
- [x] T104 All ten route server files now take `db` from `locals`; the singleton import is gone everywhere. The two R2 call sites moved to `uploadImage(bucket, publicUrl, file)` and surface `UploadError` as a 400 rather than a generic 500. `manage/+page.server.ts` awaits the now-async cookie helpers and passes the secret from `platform.env`.
- [x] T105 `sql\`now()\`` replaced with an app-supplied `new Date()` in the RSVP upsert, set on both insert and conflict-update. The `sql` import is gone.
- [x] T105a **FR-045 amended** — spec conflict found while wiring Turnstile. The first-time form renders on *every* upcoming card (FR-044), but the widget only rendered on the first, so forms 2..n submitted with no token and the action could only accept them by treating a missing token as a pass — fail-open, which FR-057 forbids. Now: one widget per first-time form, token mandatory in the `subscribe` action, `remoteip` passed through from `getClientAddress()`. `InstanceCard`'s `isFirst` prop is removed along with the `idx` it was derived from.

**Checkpoint**: `npm run check` passes with no `node:*` imports anywhere. `vite dev` serves against local D1 and R2 via platformProxy. Create an event, publish an instance, RSVP as a guest, view the headcount. Organizer auth is enforced in dev, a tampered session cookie is rejected, and an expired one is rejected.

### Step 5: `npm run check` fixes

Four errors and one pre-existing warning turned up on the first run. The warning (`RichTextEditor.svelte`'s `state_referenced_locally`) is expected — that component is deleted wholesale in Phase 16, not patched here.

- [x] T105b `src/lib/server/auth.ts` — `Object.entries().filter()` with a type predicate narrowing a destructured tuple element doesn't typecheck (TS rejects a predicate referencing an element of a binding pattern). Replaced with a plain `for` loop building the result object.
- [x] T105c `src/lib/server/password.ts` — TypeScript's DOM lib made `Uint8Array` generic over its backing buffer; an unannotated `Uint8Array` widens to `Uint8Array<ArrayBufferLike>`, which `SharedArrayBuffer` also satisfies, and that no longer matches WebCrypto's `BufferSource`. Added a `type Bytes = Uint8Array<ArrayBuffer>` alias and threaded it through every array in the file rather than casting at the `deriveBits` call site.
- [x] T105d `src/lib/components/InstanceCard.svelte` — `$env/static/public` had no `PUBLIC_TURNSTILE_SITE_KEY` because that module is populated from `.env` files at *build* time, and the key only ever existed in `wrangler.jsonc`'s `vars` (a *runtime* binding via `platform.env`). Removed the static import; the site key now flows `platform.env` → `+page.server.ts` load → page data → `InstanceCard` prop, keeping it in the one file that already declares it instead of duplicating it into a `.env`.
- [x] T105e `src/routes/events/[slug]/+page.svelte` — the JSON-LD line (`` {@html `<script...>...</script>`} ``) failed with "Unterminated template". Svelte's compiler locates a file's script block(s) with a raw-text scan for `<script`/`</script>` *before* the JS parser ever sees `{@html}` content; a literal occurrence inside our own template literal is indistinguishable from a real block boundary to that scan, so the JS parser was handed a truncated string. Added `src/lib/utils/jsonld.ts` — `renderJsonLd(data)` builds the tag by concatenation (`'<' + 'script...'`), which produces identical HTML without the contiguous substring in source. The inline `JSON.stringify` in `+page.svelte` became a plain object passed to the helper.

**Checkpoint (re-verified)**: `npm run check` — 0 errors, 1 expected warning.

---

## Phase 16: Markdown Replaces Tiptap

**Purpose**: Remove the rich text editor, the sanitizer, and jsdom. See ADR-007, FR-038, FR-041.

**Dependencies**: Phase 15. (Could be done first, but `isomorphic-dompurify` blocks the Worker build, so it must land before deploy either way.)

- [x] T106 Removed the four `@tiptap/*` packages and `isomorphic-dompurify` (jsdom, parse5, the ProseMirror tree and ~100 transitive packages went with them); `micromark` added. Runtime dependencies are now just `cookie`, `drizzle-orm`, `micromark`.
- [x] T107 Wrote `src/lib/server/markdown.ts` — `renderMarkdown`, `toPlainText({ singleLine, maxLength })`, `withDescriptionHtml`. **Moved from `utils/` to `server/`:** SvelteKit refuses to bundle `$lib/server` into client code, so "markdown is only ever rendered on the server" is enforced by the build rather than by convention, and micromark stays out of the browser bundle. Routes render in `load()` and pass HTML down as page data.
- [x] T108 Wrote `src/lib/components/MarkdownField.svelte` — a plain `<textarea>` plus a one-line syntax hint. Submits with JavaScript disabled, which the Tiptap editor did not.
- [x] T109 Deleted `RichTextEditor.svelte`, taking the `state_referenced_locally` warning and the dark-mode toolbar bug with it.
- [x] T110 Swapped `RichTextEditor` → `MarkdownField` in the four organizer forms.
- [x] T111 Removed `DOMPurify.sanitize()` from all four `+page.server.ts` actions; the markdown source is stored as submitted (trimmed, or null when empty).
- [x] T112 Render sites now use `descriptionHtml` computed in `load()`: public event page, `InstanceCard` (typed inline as `Instance & { descriptionHtml }` so no client file references a server module), organizer event detail, organizer instance dashboard.
- [x] T113 `og:description`, `<meta name="description">` and the JSON-LD `description` use `toPlainText` (meta is single-line, truncated at 200 chars). **Bug caught by verification:** `renderJsonLd` used `JSON.stringify`, which does not escape `<`, while `toPlainText` decodes `&lt;` back to `<`. A description containing `</script>` therefore closed the JSON-LD element early, and `</script><script>alert(1)</script>` would have executed. Introduced by this phase, not pre-existing. Fixed in `renderJsonLd`: `<`, `>`, `&`, U+2028, U+2029 are emitted as `\uXXXX` escapes — still valid JSON, but the HTML parser never sees a `<`.
- [x] T113a **Verified in workerd**, not just built: `wrangler dev` on the production bundle, seeded with a hostile description (`<script>`, a `javascript:` link, named entities `&hearts;` `&copy;`, and a `</script><script>` breakout). 12/12 assertions pass — markdown renders, raw HTML is inert, the `javascript:` href is dropped, `&hearts;` decodes (proving the entity decoder runs on Workers rather than hitting the DOM build), and the JSON-LD parses with a real JSON parser and round-trips the payload intact. `wrangler deploy --dry-run` bundles cleanly with no `nodejs_compat`. Server bundle: 112 KB gzipped, 872 KiB total upload. Test rows removed afterward.
- [x] T113b `tsconfig.json`: `checkJs: false`. `wrangler types` emits an import of `.svelte-kit/cloudflare/_worker` into `src/worker-configuration.d.ts`, but only once that file exists (after the first build); from then on TypeScript pulls the bundled Worker into the program and `checkJs` reported 684 errors in generated code. Everything under `src/` is TypeScript or `lang="ts"`, so nothing of ours goes unchecked. (Tried and rejected first: `svelte-check --ignore`, which only works with `--no-tsconfig`; a tsconfig `exclude`, ignored because the files enter via import; and scoping `--workspace` to `src/`, same reason.)

**Checkpoint**: Organizer writes markdown in a plain textarea with JS disabled and it renders correctly on the public page. `grep -r dompurify\|tiptap src/` returns nothing. A description containing `<script>` renders as visible text, not markup.

---

## Phase 17: Timezone Correctness + ICS

**Purpose**: Make the midnight lock actually fire at midnight, and emit a spec-compliant calendar file. See FR-020, FR-034, FR-056.

**Dependencies**: Phase 15 (needs `events.timezone`), Phase 16 (needs `toPlainText`).

- [x] T114 Rewrote `src/lib/utils/dates.ts` — `todayIn(timeZone, now?)`, `isPast(date, timeZone, now?)`, `isUpcoming(...)`, plus `DEFAULT_TIMEZONE`. Assembled from `Intl.DateTimeFormat#formatToParts` rather than a locale that happens to print ISO dates. Every function takes an optional `now` so tests can pin the clock. `new Date().toISOString()` is gone.
- [x] T115 Passed `event.timezone` at both call sites. There were **two independent copies** of the UTC bug: the public page `load()`'s Upcoming/Past split had its own inline `toISOString()`, separate from `dates.ts`, so fixing only the helper would have left the page and the RSVP lock disagreeing. `loadAndValidateInstance` now takes the timezone. Verified against the real module at the moments the old code failed (6:30pm Pacific on event day: old = past, new = not past), at midnight, and either side of both 2026 DST transitions — the old code was wrong in 4 of 8 cases, the new code in none.
- [x] T116 Rewrote `src/lib/utils/ics.ts` (UTC instants per ADR-009): `buildICS(input)` takes plain strings, not DB rows, so it needs no markdown or database. Adds `DTSTAMP` (RFC-required; the old file omitted it), `URL`, and the **instance** description ahead of the event's (the old file never carried "what to bring" into the calendar). `escapeText` escapes `\ ; ,` and every newline style, and drops control characters, so a CRLF in a name can no longer inject a property or a second VEVENT. `foldLine` folds at 75 **octets** without splitting multi-byte characters. An end time earlier than the start rolls `DTEND` to the next day (previously it produced DTEND before DTSTART). Added `zonedTimeToUtc` and `nextDay` to `dates.ts`. Route now sends `text/calendar; charset=utf-8`. Checked live in workerd: CRLF throughout, 22:00-01:00 PST on Dec 1 came out as `20261202T060000Z`-`20261202T090000Z`.
- [x] T117 Organizer instance dashboard: a "Text the group" block listing yes/maybe guests' phone numbers comma-separated (pastes into a new message's To: field) in a selectable read-only textarea, with a Copy button that renders only after mount so there is no dead button without JavaScript. Guests going/maybe with only an email are named as "not on this list" rather than silently dropped. Contact cells are now `tel:`/`mailto:` links showing **both** phone and email (previously `email ?? phone`, hiding the phone whenever an email existed). `tel:` hrefs are digits-and-plus only; display keeps what was typed.
- [x] T118 First tests — 106 tests in four files, all passing, type-clean. `vitest` in Node with a real in-memory D1 via `getPlatformProxy` (ADR-008). `contact` (40), `dates` (30, including both 2026 DST transitions and every moment the old code got wrong), `ics` (22, including CRLF-injection attempts and multi-byte folding), `subscribers` (14, against real D1 semantics). `npm test`.
- [x] T117a Contact normalization (FR-061, decided: minimal, US-centric, no library): `src/lib/utils/contact.ts` — `readContact` used by both the first-time RSVP form and the manage-details form. Email trimmed and lowercased; phone stored `+<digits>`; a filled-in field that can't be read gets its own message instead of being dropped or reported as "required". Checked live: `"  Sam@X.com "` + `(415) 555-0100` stored as `sam@x.com` / `+14155550100`, and the same person re-submitted as `SAM@x.COM` / `415.555.0100` did not create a second guest.
- [x] T117b **Confirmed, then fixed** (FR-062). Tests written first against the unfixed code: 3 failed with `UNIQUE constraint failed: subscribers.event_id, subscribers.email` (and `.phone`) — an unsubscribed guest could never come back, and a double-tapped RSVP could crash the same way. Fix in `resolveSubscriber`: look up by contact in *any* active state and reactivate a match; insert with `ON CONFLICT DO NOTHING` and re-read on a lost race. The manage-details `update` action had a sibling of the same bug (editing your contact to one another guest uses → 500); now a 409 with a message, via `isUniqueViolation`, which walks `.cause` because drizzle wraps the driver error.

**Checkpoint (met, except the two items marked untested)**: An instance dated today is still RSVP-able at 6pm Pacific (it was not, before). The downloaded `.ics` imports into Google Calendar and Apple Calendar at the correct wall-clock time, with no literal HTML in the description. The organizer can copy a yes/maybe phone list in one action.

---

## Phase 18: Deploy

- [x] T118a **Tests for the security core, which had none.** `password.ts` and `auth.ts` were rewritten in Phase 15 and had only ever been exercised through curl. Now 80 tests: hash/verify round trip and salting; every malformed or missing hash fails closed; sessions expire on the SERVER (a copied cookie replayed two days later is refused, the exact NF-002 bug); a tampered expiry, signature, or secret is refused; a missing secret creates and accepts nothing; and the dev bypass is dead when `dev` is false but works only for the exact string `"true"` when it is true (`tests/support/stubs/app-environment.ts` stands in for `$app/environment`; `tests/auth-dev.test.ts` mocks it to `true`).
- [x] T118b **Mutation-checked, because a first-run pass on a security test proves nothing.** `auth.ts` was deliberately broken four ways and each was caught, then restored from git: expiry check removed (3 tests fail), build-mode guard removed from the bypass (2), signature verification removed (6), fail-closed on a missing secret removed (1).
- [x] T118c **Production bundle verified, not inferred.** The compiled server bundle contains `isAuthBypassed(env) { return false; }` and the flag name `DANGEROUSLY_DISABLE_ORGANIZER_AUTH` does not appear anywhere in it: the bundler folded `dev` to false and removed the branch. No environment variable on a deployed Worker can enable the bypass.
- [x] T118d **Login CPU cost measured (a risk flagged in Phase 15 and never resolved).** PBKDF2-SHA256: 9.7 ms at 100k iterations in Node, 1.0 ms at 10k. In workerd a login round-trip is ~10 ms against ~3.5 ms for a trivial page, so the hash costs roughly 6-7 ms. That is under the Workers FREE plan's ~10 ms CPU limit but not by a comfortable margin, and Cloudflare's hardware can't be measured without deploying. No code change is needed if it bites: the iteration count is stored inside the hash and `verifyPassword` reads it back, so regenerate with `npm run hash-password -- '<pw>' 50000` and `wrangler secret put ORGANIZER_PASSWORD_HASH`. The script now takes that optional count (10,000-1,000,000). Not applicable on the Paid plan.
- [x] T118e **Pre-deploy guard** (`scripts/predeploy-check.mjs`, run by `npm run deploy`; alone as `npm run deploy:check`, or `-- --offline`). Refuses to deploy if: Turnstile's dummy site key is in `wrangler.jsonc` (it passes every check, so bot protection would be silently off); a placeholder remains in `R2_PUBLIC_URL` or `database_id`; `nodejs_compat` is set (NF-006); a secret sits in `vars` (committed to git in plain text); or any of the three production secrets is missing from the deployed Worker. Reports every problem at once. 42 tests, including a JSONC parser that must not mistake `https://` inside a string for a comment. Run against the real config it correctly refuses today, for exactly one reason: the dummy Turnstile key. The behaviours it relies on in wrangler 4.142.0 were checked in the installed source rather than remembered: `secret list --format json` prints `JSON.stringify(secrets)` with a `name` per entry, and `secret put` offers to create a missing Worker (`createDraftWorker`).
- [ ] T119 `wrangler secret put` for `SESSION_SECRET`, `ORGANIZER_PASSWORD_HASH`, `CLOUDFLARE_TURNSTILE_SECRET`. *Matt runs these.*
- [ ] T120 Swap Turnstile test keys for real ones; confirm the site key var and the secret match the same widget
- [ ] T121 Apply migrations to remote D1; `wrangler deploy`; map the custom domain
- [ ] T122 Real-world test: create a craft night, send the link to guests, verify the full RSVP flow on a phone that has never seen the site

**Note**: Phase 14 (date polls, T077–T085) is still unstarted. Build it after Phase 17, against the new schema — T076 (the `status` column) is absorbed into T092.
