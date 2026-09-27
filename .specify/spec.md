# Feature Specification: craftnight MVP

**Created**: 2026-05-03
**Status**: Draft

---

## User Stories

### User Story 1 — Organizer Login (Priority: P1)

The organizer can log in to a protected area of the app using email and password. Guests have no login and cannot access organizer views.

**Why this priority**: All organizer actions depend on an authenticated session. Nothing else works without it.

**Independent Test**: Navigate to `/organizer`. Without login, get redirected to login page. Log in with valid credentials, land on organizer dashboard. Log out, confirm redirect back to login.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user visits any `/organizer/*` route, **When** the page loads, **Then** they are redirected to `/organizer/login`
2. **Given** the organizer submits valid credentials, **When** the form is submitted, **Then** a session is created and they land on the organizer dashboard
3. **Given** the organizer submits invalid credentials, **When** the form is submitted, **Then** an error is shown and no session is created
4. **Given** an authenticated organizer clicks logout, **When** the action completes, **Then** the session is destroyed and they are redirected to login

---

### User Story 2 — Organizer Creates and Edits an Event (Priority: P1)

The organizer can create a named Event that guests will subscribe to. The Event is the persistent container — it exists independently of any specific date. The organizer can also edit an existing Event to update its name, description, cover image, or accent color.

**Why this priority**: Events are the root entity. Nothing else can exist without one.

**Independent Test**: Log in, create an Event with name and rich text description. Confirm it appears in the organizer's event list. Edit the event, change the description, confirm the change is reflected on the public page.

**Acceptance Scenarios**:

1. **Given** the organizer is logged in, **When** they submit a new Event with a name and description, **Then** the Event is created and appears in the event list
2. **Given** an Event exists with no Instances, **When** the organizer views it, **Then** they see the Event details and an empty Instance list
3. **Given** the organizer submits an Event with no name, **When** the form is submitted, **Then** an error is shown and the Event is not created
4. **Given** an Event exists, **When** the organizer edits it and saves, **Then** the updated details are reflected immediately on the organizer view and the public event page

---

### User Story 3 — Organizer Publishes and Edits an Instance (Priority: P1)

The organizer can publish a new Instance under an Event, specifying a date, start time, end time, optional location, and a rich text description (agenda, project instructions, what to bring, etc.). The organizer can also edit an existing Instance. Publishing creates the Instance and makes it visible on the public event page.

**Why this priority**: Instances are what guests RSVP to. Without them, the guest flow cannot function.

**Independent Test**: With an existing Event, publish a new Instance with a date, start time, end time, and a formatted description. Confirm it appears on the public event page with description rendered correctly. Edit the instance, update the description, confirm the update is reflected.

**Acceptance Scenarios**:

1. **Given** an Event exists, **When** the organizer publishes an Instance with date, start time, end time, optional location, and optional description, **Then** the Instance appears as the current upcoming occurrence
2. **Given** an Instance is published, **When** a guest visits the Event's public page, **Then** they see the Instance's date, start time, end time, location, and formatted description
3. **Given** the organizer submits an Instance without a date, start time, or end time, **When** the form is submitted, **Then** an error is shown and the Instance is not created
4. **Given** multiple Instances exist for an Event, **When** a guest views the public page, **Then** they see only the most recent upcoming Instance
5. **Given** an Instance exists, **When** the organizer edits it and saves, **Then** the updated details are reflected immediately on the organizer view and the public event page

---

### User Story 4 — Guest Views Event Page (Priority: P1)

Any person with the Event's URL can view the public event page without creating an account. The page shows the Event description, all upcoming Instances (next first), and all past Instances (most recent first). Each section is independently useful: upcoming instances allow RSVP, past instances show history.

**Why this priority**: The public page is the entry point for every guest. It must work with no friction.

**Independent Test**: Without any session or cookie, visit an Event's public URL with multiple published Instances. Confirm the page loads with the event description, an Upcoming section listing all future instances in date order, and a Past section listing previous instances most-recent first.

**Acceptance Scenarios**:

1. **Given** an Event with multiple published Instances exists, **When** anyone visits the public URL, **Then** they see the Event name and description, an Upcoming section with all future Instances sorted next-first, and a Past section with all past Instances sorted most-recent-first
2. **Given** an Event has no published Instances, **When** anyone visits the public URL, **Then** they see the Event details with a message that no dates have been scheduled
3. **Given** an Event has no upcoming Instances but has past ones, **When** anyone visits the public URL, **Then** the Upcoming section shows an empty state and the Past section lists all past Instances
4. **Given** an invalid or unknown Event URL, **When** anyone visits it, **Then** they see a 404 page
5. **Given** an upcoming Instance has a description, **When** anyone views that Instance in the list, **Then** the description renders as formatted HTML below the date/time/location
6. **Given** a past Instance has a description, **When** anyone views that Instance in the past list, **Then** the description is NOT shown — only date, time, location, and the visitor's RSVP if any

---

### User Story 5 — Guest RSVPs to an Upcoming Instance (Priority: P1)

A first-time guest can RSVP to any upcoming Instance inline on the public event page. The first RSVP collects their name and contact method (email or phone) and sets a remember-me cookie. Subsequent RSVPs to other instances on the same page — or on future visits — require only a status tap, no re-entry of details.

The name and contact are collected for the organizer's manual coordination (headcount list, knowing who to reach), not for automated notification delivery.

**Why this priority**: This is the core guest action. Every other guest story depends on an identity existing.

**Independent Test**: Visit a public event page with no cookie and two upcoming Instances. Submit the first RSVP form (name + contact + status) on Instance A. Confirm a Guest record and RSVP exist, cookie is set, and Instance B now shows a lightweight status form pre-filled to no selection.

**Acceptance Scenarios**:

1. **Given** a guest with no cookie visits the event page, **When** they submit name + email + RSVP status on any upcoming Instance, **Then** a Guest record is created, an RSVP is recorded for that Instance, and a remember-me cookie is set
2. **Given** a guest with no cookie visits the event page, **When** they submit name + phone + RSVP status, **Then** a Guest record is created with phone, RSVP recorded, cookie set
3. **Given** a guest submits with no name, **When** the form is submitted, **Then** an error is shown and no records are created
4. **Given** a guest submits with neither email nor phone, **When** the form is submitted, **Then** an error is shown and no records are created
5. **Given** a guest has just submitted their first RSVP (cookie now set), **When** they view other upcoming Instances on the same page, **Then** those instances show the lightweight returning-guest RSVP form — no name/contact re-entry required
6. **Given** the Instance date has passed, **When** a guest views it in the past section, **Then** no RSVP form is shown — the instance is read-only

---

### User Story 6 — Returning Guest RSVPs via Remember-Me (Priority: P1)

A guest recognized by their cookie sees all upcoming Instances with their current RSVP status (or no selection if they haven't RSVPed yet). They can update any RSVP with a single tap — no re-entry of name or contact.

**Why this priority**: Repeat engagement is the whole point of a recurring event. The return experience must be frictionless.

**Independent Test**: Set a subscriber cookie, visit the public event page with multiple upcoming Instances. Confirm each shows the guest's current RSVP status or an empty status selector. Update RSVP on Instance B without re-entering details. Confirm the DB record updates.

**Acceptance Scenarios**:

1. **Given** a guest has a valid cookie, **When** they visit the event page, **Then** each upcoming Instance shows their current RSVP status (or no selection if not yet RSVPed)
2. **Given** a returning guest updates their RSVP on any upcoming Instance, **When** they submit, **Then** only that Instance's RSVP record is updated
3. **Given** a returning guest has not yet RSVPed to a specific upcoming Instance, **When** they view that Instance, **Then** they see an empty status selector — no status pre-selected
4. **Given** a guest's cookie references a deleted or inactive Guest record, **When** they visit the page, **Then** the cookie is cleared and the first-time form is shown on the first upcoming Instance

---

### ~~User Story 7 — Organizer Sends Announcement Blast~~ — REMOVED

### ~~User Story 8 — Organizer Sends Reminder Blast~~ — REMOVED

Both removed per ADR-001 (2026-05-03), reconfirmed 2026-09-26 after the Twilio application was declined, and again 2026-09-27. There is no blast channel of any kind and none is planned. The organizer shares the event URL in their existing group thread. Full original text is in git history.

---

### User Story 9 — Organizer Views Headcount and Subscriber List (Priority: P1)

The organizer can view a dashboard for a published Instance showing RSVP counts broken out by status (yes / maybe / no) and the full subscriber list with each subscriber's name, contact, and RSVP status.

**Why this priority**: Knowing who is coming is the core operational output of the tool.

**Independent Test**: With RSVPs across all three statuses, view the Instance dashboard. Confirm yes/maybe/no counts are accurate and the subscriber list shows each person's status.

**Acceptance Scenarios**:

1. **Given** RSVPs exist across all three statuses, **When** the organizer views the Instance dashboard, **Then** they see separate counts for yes, maybe, and no
2. **Given** the organizer views the subscriber list, **When** the page loads, **Then** each subscriber shows name, contact method, and their RSVP status for the current Instance
3. **Given** a subscriber has not RSVPed to the current Instance, **When** the organizer views the list, **Then** that subscriber appears with status "no response"

---

### User Story 10 — Guest Manages Subscription (Priority: P2)

A guest can visit a self-service page to view their subscription details, update their name or contact method, or unsubscribe entirely. Because identity is tied to a stable UUID rather than the contact method, guests can freely switch between email and SMS without losing their subscription history.

**Why this priority**: Unsubscribe is a legal and ethical requirement but not needed before first real use.

**Independent Test**: As a remembered guest, navigate to the manage subscription page. Confirm name and contact are shown. Unsubscribe, confirm Subscriber record is deactivated and cookie is cleared.

**Acceptance Scenarios**:

1. **Given** a guest visits the manage page with a valid subscriber cookie, **When** the page loads, **Then** they see their name and current contact method
2. **Given** a guest updates their name or contact method and submits, **When** the action completes, **Then** the Subscriber record is updated and a confirmation is shown; their UUID and RSVP history are unchanged
3. **Given** a guest clicks unsubscribe and confirms, **When** the action completes, **Then** their Subscriber record is deactivated, their cookie is cleared, and they see a confirmation message
4. **Given** a guest visits the manage page without a cookie (e.g. different device), **When** the page loads, **Then** they are redirected to the event page where they can re-subscribe; the re-subscribe form matches them to their existing record via email or phone and sets a fresh cookie
5. **Given** an unsubscribed guest visits the event page, **When** the page loads, **Then** the subscribe form is shown again (they can re-subscribe)

---

### ~~User Story 11 — Guest RSVPs via SMS Reply~~ — REMOVED

Removed per ADR-001. Depended on an outbound SMS blast that does not exist, a Twilio account that was declined, and an inbound webhook route that was never built. Full original text is in git history.

---

### User Story 12 — Organizer Proposes Candidate Dates for a Date Poll (Priority: P2)

The organizer can publish two or more candidate Instances for the same upcoming occurrence when the date isn't settled yet (e.g. "Sat Oct 24 or Sun Oct 25 — whichever works better"). Guests RSVP to each candidate independently on the public page, exactly as they would a normal Instance. The organizer compares RSVP tallies across candidates and confirms one; the others are cancelled and disappear from public view. The confirmed candidate then behaves as a normal Instance going forward.

**Why this priority**: Useful for real scheduling coordination but not required for the core single-date publish/RSVP loop to work.

**Independent Test**: Publish two candidate Instances for the same Event, both marked as proposed. Visit the public page, confirm a Proposed section shows both with independent RSVP forms. RSVP yes to one, maybe to the other. View the organizer dashboard, confirm tallies are shown per candidate. Confirm one candidate. Reload the public page — the confirmed date now appears as a normal upcoming Instance; the other candidate is gone entirely.

**Acceptance Scenarios**:

1. **Given** the organizer publishes two or more Instances marked as proposed for the same Event, **When** a guest visits the public page, **Then** a Proposed section appears above Upcoming, showing each candidate Instance as its own card with an independent inline RSVP form
2. **Given** a guest RSVPs to a proposed Instance, **When** they submit, **Then** the RSVP is recorded using the same subscriber/RSVP logic as any other Instance (FR-044) — no new mechanism
3. **Given** a guest RSVPs to one proposed Instance on a page with multiple candidates, **When** they view the other candidates on the same page load, **Then** they can RSVP to each independently, the same way they can across multiple Upcoming Instances today (US6)
4. **Given** proposed Instances exist for an Event, **When** the organizer views that Event's dashboard, **Then** RSVP tallies (yes/maybe/no) are shown per candidate so they can be compared side by side
5. **Given** two or more proposed Instances exist for an Event, **When** the organizer confirms one of them, **Then** that Instance's status becomes confirmed and all other proposed Instances for that Event become cancelled
6. **Given** an Instance is cancelled, **When** anyone visits the public page, **Then** it does not appear in the Proposed, Upcoming, or Past sections
7. **Given** an Instance is cancelled, **When** the organizer views the Event dashboard, **Then** the cancelled Instance and its RSVPs remain visible, clearly labeled as cancelled, for reference
8. **Given** a proposed Instance's date passes without being confirmed or cancelled, **When** anyone visits the public page, **Then** RSVP editing on it locks per the existing midnight rule (FR-020); the organizer can still confirm or cancel it afterward

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST require organizer authentication for all `/organizer/*` routes
- **FR-002**: System MUST support a single organizer account configured via environment variables
- **FR-003**: System MUST allow creation of multiple Events, each with a unique slug used as its public URL (`/events/[slug]`), a cover image, and an accent color
- **FR-023**: System MUST apply each Event's cover image and accent color to its public event page (accent color tints buttons and headings via CSS custom properties)
- **FR-004**: System MUST allow creation of Instances with date, start time, end time, and optional location under an Event
- **FR-005**: *(superseded by FR-042 and FR-043 — multi-instance list replaces single-instance display)*
- **FR-006**: System MUST assign a stable UUID to each Guest at creation time; this UUID is the identity key stored in the remember-me cookie
- **FR-006a**: System MUST accept guest subscriptions with name + (email or phone); each Subscriber record is scoped to a single Event
- **FR-006b**: System MUST resolve duplicate subscribers using this priority order: (1) cookie UUID match, (2) email match, (3) phone match, (4) create new record
- **FR-007**: System MUST record RSVPs with one of three statuses: yes, maybe, no
- **FR-008**: System MUST set a persistent cookie identifying a returning subscriber
- **FR-009**: System MUST pre-populate RSVP state for returning subscribers without re-entry of contact details
- **FR-010, FR-011, FR-012**: *(removed — blast delivery and dedup, ADR-001)*
- **FR-013**: System MUST display RSVP counts broken out by yes / maybe / no on the Instance dashboard, along with a count of subscribers who have not responded
- **FR-028**: *(removed)*
- **FR-014**: System MUST display subscriber list with name, contact, and per-Instance RSVP status
- **FR-014a**: Phone numbers and email addresses in the organizer's subscriber and headcount views MUST be rendered as `tel:` and `mailto:` links so the organizer can reach a guest in one tap from a phone. The organizer's primary communication channel is manual texting (ADR-001), so this list is an operational tool, not just a record. The view MUST also offer a one-action copy of all phone numbers for the guests who RSVPed yes or maybe to a given Instance, for pasting into a group thread.
- **FR-015**: System MUST provide a self-service unsubscribe flow accessible via the event page for cookie-identified guests; guests without a cookie are directed to re-subscribe, which silently re-identifies them via email or phone match
- **FR-016, FR-017**: *(removed — email and SMS delivery, ADR-001)*
- **FR-020**: System MUST lock RSVP editing once the Instance date has passed. The lock triggers at midnight **in the Event's own timezone** (`events.timezone`, an IANA identifier defaulting to `America/Los_Angeles`), not in UTC and not in the runtime's local time — the Worker has no local timezone. The comparison is date-only: derive today's date in the Event's zone via `Intl.DateTimeFormat`, then compare lexically against the Instance's `YYYY-MM-DD` date string.
- **FR-021**: *(superseded by FR-043 — past instances appear in the Past section, read-only)*
- **FR-022**: Organizer dashboard MUST show a list of all Events as the top-level view
- **FR-024, FR-025, FR-026, FR-027**: *(removed — inbound Twilio webhook and SMS-reply RSVP, ADR-001)*
- **FR-029**: Public event pages MUST include Open Graph meta tags (`og:title`, `og:description`, `og:image`) using the Event name, description, and cover image respectively
- **FR-030**: Cover images MUST be written to Cloudflare R2 through the Worker's native R2 binding (`platform.env.BUCKET.put`) and served via the bucket's public URL. No S3 SDK, no R2 access keys in environment variables. (ADR-006)
- **FR-031**: The first-time subscribe form on public event pages MUST be protected by Cloudflare Turnstile; the server action MUST validate the Turnstile token before creating a Subscriber or RSVP record. Returning guests identified by a valid subscriber cookie are exempt from Turnstile on RSVP updates.
- **FR-032**: Public event pages MUST include the Cloudflare Web Analytics script tag
- **FR-033**: Each published Instance MUST have a downloadable ICS endpoint at `/events/[slug]/instances/[instanceId]/calendar.ics`; the response MUST set `Content-Type: text/calendar` and `Content-Disposition: attachment` (relates to US4)
- **FR-034**: The ICS file MUST be a valid RFC 5545 calendar for one Instance. Times MUST be written as **UTC instants** (`DTSTART:20261015T010000Z`), converted from the Instance's wall-clock date and times in the Event's IANA `timezone`; no `TZID` and no `VTIMEZONE` are emitted. (Amended 2026-09-27: each Instance is a single occurrence, so the instant is all a calendar needs and there is no timezone definition to generate; a guest in another zone sees the correct local time.) An end time earlier than the start time means the event runs past midnight, and `DTEND` MUST then fall on the following calendar day. The VEVENT MUST include `UID` (stable, derived from the Instance UUID), `DTSTAMP` (required by RFC 5545), `SUMMARY` (Event name), `LOCATION` (if set), `URL` (the public event page), and `DESCRIPTION` as **plain text** — the Instance description first, then the Event description, never markdown source or HTML. Text values MUST be escaped per RFC 5545 (backslash, comma, semicolon, and every newline style as a literal `
`; other control characters dropped) so that no field value can end its property and inject another, and lines MUST be folded at 75 **octets** without splitting a multi-byte character. Line endings are CRLF.
- **FR-035**: Each upcoming Instance in the list MUST include an "Add to Calendar" link pointing to its ICS endpoint; the link MUST NOT appear on past Instances
- **FR-036**: Public event pages MUST include a `<script type="application/ld+json">` block containing a `schema.org/Event` object for the next upcoming Instance (first in the Upcoming list) with `name`, `description`, `startDate`, `endDate`, `location`, and `image` fields. `description` MUST be plain text (not markdown source or HTML). The block MUST be serialized so that `<`, `>` and `&` are emitted as `\u003c`, `\u003e` and `\u0026`: `JSON.stringify` alone does not escape `<`, so a description containing `</script>` would otherwise end the element early and let the rest of the description execute as HTML
- **FR-037**: *(removed — blast infrastructure removed per ADR-001)*
- **FR-038**: Event descriptions and Instance descriptions MUST be authored as **markdown** in a plain `<textarea>` and stored as markdown source in the database. They MUST be rendered to HTML server-side by a renderer configured to escape rather than pass through raw HTML, so that no sanitization step is required and stored content is never trusted markup. Supported: bold, italic, headings, bullet and ordered lists, links, blockquote, inline code, horizontal rule. (ADR-007, supersedes ADR-002)
- **FR-039**: Instance description represents per-occurrence content: agenda, project instructions, what to bring, etc. It is distinct from the Event description which describes the recurring series.
- **FR-040**: The organizer MUST be able to edit existing Events (name, description, cover image, accent color) and existing Instances (date, start time, end time, location, description) via edit forms at `/organizer/events/[id]/edit` and `/organizer/events/[id]/instances/[instanceId]/edit`.
- **FR-041**: Instance description MUST be rendered on upcoming Instances in the public event page list. Instance description is NOT shown on past Instances. Event description renders near the top of the page. All descriptions are rendered from stored markdown to HTML server-side (FR-038).
- **FR-042**: The public event page MUST display all upcoming Instances in a dedicated Upcoming section, sorted ascending by date (next occurrence first).
- **FR-043**: The public event page MUST display all past Instances in a dedicated Past section, sorted descending by date (most recent first). Each past Instance shows date, time, and location. If the visitor is cookie-identified, their RSVP status for that Instance is shown. No RSVP form or description is shown on past Instances.
- **FR-044**: Each upcoming Instance MUST include an inline RSVP widget. Unrecognized visitors see a name + contact + status form. Cookie-recognized guests see a status-only form (no re-entry of details). Each form includes a hidden `instanceId` field so the action targets the correct Instance.
- **FR-045**: *(amended 2026-09-27)* Every first-time RSVP form MUST carry its own Cloudflare Turnstile widget, and the `subscribe` action MUST reject a submission with no token. Cookie-recognized guests are exempt from Turnstile on all Instances — they use the separate status-only form, which never renders a widget.

  The original wording required the widget "at most once per page load, on the first upcoming Instance." That conflicted with FR-057. The first-time form renders on *every* upcoming Instance for an unrecognized visitor (FR-044), so a single widget meant the forms on Instances 2..n submitted with no token, and the action could only accept them by treating a missing token as a pass — fail-open, exactly what FR-057 forbids. The intent behind FR-045 was that returning guests never face a challenge, and that still holds.
- **FR-046**: The `subscribe` and `rsvp` server actions MUST accept an `instanceId` parameter from the submitted form, validate it belongs to the current Event, and verify the Instance date has not passed before recording the RSVP. An Instance whose status is `cancelled` MUST be rejected with a message saying so — a guest whose page was open when the organizer confirmed another date must not silently record an RSVP against it. `proposed` Instances MUST be accepted (FR-050).
- **FR-047**: The `instances` table MUST have a `status` field with values `proposed`, `confirmed`, or `cancelled`. Instances default to `confirmed`.
- **FR-048**: The organizer's Instance creation form MUST include an optional "proposed date (date poll)" toggle; enabling it sets the new Instance's status to `proposed` instead of the default `confirmed`.
- **FR-049**: The public event page MUST display a Proposed section, above Upcoming, listing all of the Event's `proposed` Instances. Each candidate renders with the same inline RSVP widget used for Upcoming Instances (FR-044).
- **FR-050**: Guests MUST be able to RSVP independently to each proposed Instance on the same page load, following the same first-time/returning-guest logic as FR-044 and FR-045 (one `instanceId` per candidate's form).
- **FR-051**: The organizer dashboard MUST display RSVP tallies (yes/maybe/no) per `proposed` Instance so candidates can be compared.
- **FR-052**: The organizer MUST be able to confirm one `proposed` Instance via a "Confirm this date" action. On confirm, that Instance's status becomes `confirmed`, and all other `proposed` Instances for the same Event become `cancelled`.
- **FR-053**: `cancelled` Instances MUST NOT appear in the Proposed, Upcoming, or Past sections of the public page, and MUST be excluded from that Event's ICS, Open Graph, and schema.org metadata (FR-033–036). The calendar endpoint itself MUST return 404 for any Instance that is not `confirmed`, so a cancelled or tentative date cannot be downloaded by URL even though its link is not shown. (404, not 403: a cancelled date is not confirmed to have existed.)
- **FR-054**: `cancelled` Instances and their RSVPs MUST remain visible on the organizer dashboard, clearly labeled as cancelled, for historical reference. They are not deleted.
- **FR-055**: The Upcoming and Past sections (FR-042, FR-043) MUST filter to `status = 'confirmed'` only. Existing Instances (created before this feature) default to `confirmed` and are unaffected.

- **FR-056**: The `events` table MUST carry a `timezone` column holding an IANA timezone identifier, not null, defaulting to `America/Los_Angeles`. All date-boundary logic (FR-020) and all calendar output (FR-034) resolve against this value rather than the runtime's clock.
- **FR-057**: Organizer authentication MUST fail closed. Any development convenience that skips the session check MUST require an explicitly-set opt-in flag; the absence, misspelling, or misconfiguration of an environment variable MUST result in authentication being enforced, never bypassed. The same rule applies to Turnstile validation (FR-031): a missing secret MUST reject the submission, not accept it.
- **FR-058**: Secrets (`SESSION_SECRET`, `ORGANIZER_PASSWORD_HASH`, `CLOUDFLARE_TURNSTILE_SECRET`) MUST be read from the Worker's runtime bindings (`platform.env`), not from build-time static env imports, so they can be rotated with `wrangler secret put` without a rebuild. (ADR-006)
- **FR-059**: The organizer password MUST be verified using PBKDF2-HMAC-SHA256 via WebCrypto with a per-hash random salt, compared in constant time. `bcryptjs` is removed — it is a Node-oriented pure-JS implementation and the constitution forbids Node built-ins. A CLI script MUST be provided to generate the stored hash.
- **FR-060**: Organizer authorization MUST be enforced in `hooks.server.ts` for every request whose path is `/organizer` or begins with `/organizer/`, except exactly `/organizer/login`. An unauthenticated request MUST be redirected to `/organizer/login` before any route code runs. A guard in `organizer/+layout.server.ts` alone does NOT satisfy this: SvelteKit does not run a layout `load` before a form action or a `+server.ts` endpoint, so a layout-only gate protects page views while leaving every organizer mutation (create/edit event, create/edit instance, cover-image upload to R2) callable without a session. The layout gate remains as a second layer. *(Added 2026-09-27 after an unauthenticated POST to the create-event action was demonstrated to insert a row; verified fixed the same day.)*
- **FR-061**: Contact details MUST be normalized on write, so that equal contacts are stored equal (they are identity keys, FR-006b, and the organizer texts from them). Email is trimmed and lowercased. Phone is stored as `+<digits>`: ten digits (area code not starting with 0 or 1), or `1` plus ten digits, becomes `+1XXXXXXXXXX`; an explicit leading `+` followed by 8-15 digits is kept as typed. Anything else is rejected. Rules are deliberately minimal and US-centric — no phone-parsing library. A field that is filled in but unreadable MUST produce a message naming that field, never be dropped silently, and never surface as "email or phone is required". Applies to the first-time RSVP form and to the manage-details form.
- **FR-062**: A guest who unsubscribed and returns with the same email or phone MUST be reactivated as the same guest, keeping their earlier RSVPs, rather than causing an error. Two simultaneous first-time submissions from one person MUST resolve to one guest. A guest editing their own contact details to ones another guest of the same Event already uses MUST see a message saying so, not a server error.
- **FR-063**: Every failure from the public RSVP actions MUST be shown to the guest. The message appears on the Instance card the submission was for; if that card is no longer on the page (a date cancelled since the guest loaded it), it appears as a page-level notice. A failed submit must never look like the button doing nothing.
- **FR-064**: `confirmInstance` MUST accept only a `proposed` Instance belonging to the Event being acted on. It MUST confirm that Instance and cancel the Event's other `proposed` Instances atomically, and MUST leave RSVPs on cancelled Instances in place (FR-054). Confirming an Instance that is already `confirmed` or `cancelled`, or one belonging to another Event, MUST be refused without changing any status.

### Non-Functional Requirements

- **NF-001**: Public event pages MUST be server-rendered — core content (event name, instance details) must be present in the initial HTML response without requiring JavaScript execution. JavaScript is used for progressive enhancement (Turnstile, analytics, RSVP interactions) but is not required to read the page.
- **NF-002**: Organizer session MUST be stored as a signed `httpOnly` cookie; no server-side session table. The signed payload MUST itself contain an expiry timestamp that the server verifies on every request. Cookie `maxAge` alone does not satisfy this — it is a client-side hint and a copied cookie would otherwise remain valid indefinitely. Session lifetime: 24 hours.
- **NF-003**: Subscriber cookie MUST persist for 1 year
- **NF-004**: *(removed — blast delivery timing, ADR-001)*
- **NF-005**: No guest data (email, phone) MUST be exposed in public-facing HTML or URLs. Guest contact details appear only in authenticated organizer views (FR-014a).
- **NF-006**: The Worker's server bundle MUST stay within the Workers size limit and MUST NOT depend on the `nodejs_compat` flag. Dependencies requiring `node:*` built-ins, `Buffer`, or a DOM implementation are disqualified.
- **NF-007**: Deploying a change MUST be a single command with no server access, and running the app MUST require no scheduled maintenance (no OS patching, no database backups to administer, no certificate renewal).

---

## Success Criteria

1. Organizer can create an Event and publish the first Instance in under 5 minutes
2. A first-time guest can subscribe and RSVP in under 60 seconds
3. A returning guest can update their RSVP in under 10 seconds
4. The organizer can get from "who's coming?" to a list of phone numbers for the yes/maybe guests in one tap
5. The tool successfully supports a real monthly craft night with 10-40 guests for at least 3 consecutive months
6. Running the app costs nothing and requires no scheduled maintenance

---

## Edge Cases

- Guest submits subscribe form with an email already in the subscriber list → resolve identity by priority: cookie UUID match first, then email match, then phone match; record RSVP against matched record; do not update name or create duplicate
- Guest submits subscribe form with a phone already in the subscriber list → same priority resolution as above
- Organizer publishes a new Instance while a previous one is in the future → both exist; public page shows the nearest upcoming one
- Subscriber cookie exists but the Instance has changed since last visit → show new Instance, prompt for fresh RSVP
- An Instance's date arrives while a guest has the page open → the lock (FR-020) is evaluated server-side on submit against the Event's timezone, so a stale open page cannot record a late RSVP
- Organizer's own device is in a different timezone than the Event → irrelevant; all boundaries resolve against `events.timezone`, never the viewer's or the runtime's clock
- Guest unsubscribes then re-subscribes → create new Subscriber record (or reactivate deactivated one); prior RSVP history is not surfaced to guest
- Organizer needs to reach the yes/maybe guests before an Instance → they copy the phone list from the Instance dashboard (FR-014a) and text the group manually; the app never sends anything itself
- Guest visits event page after Instance date has passed → page shows read-only "this event has passed" state; RSVP form is not shown
- Guest RSVPs to a proposed Instance that the organizer later doesn't confirm → the RSVP row stays in the database, but the cancelled Instance never appears anywhere on the public site again; the guest is not notified of the outcome by the app (organizer handles that manually, e.g. via Signal)
- Organizer confirms a proposed Instance whose date has already passed → allowed; the Instance becomes `confirmed` and immediately appears in the Past section rather than Upcoming
- Organizer wants to add a third candidate date after guests have already RSVPed to the first two → publish another `proposed` Instance for the same Event; existing RSVPs on the other candidates are unaffected, and the new candidate simply joins the Proposed section


---

## Clarifications

### Session 2026-05-03

- Q: If a returning guest re-submits the subscribe form with a different name, does the name update? → A: No — keep the original name; do not overwrite on re-subscribe.
- Q: Do notification links carry a personalized subscriber token? → A: No — notifications include the plain public event URL. Guest identity is maintained via the browser cookie. Guests on a new device can re-subscribe; the resolveSubscriber logic matches them by email or phone to their existing record without creating a duplicate.
- Q: Can guests update their RSVP after the Instance date has passed? → A: No — RSVPs lock after the Instance date; past events are read-only.
- Q: Single Event or multiple Events? → A: Multiple Events supported; each has its own public URL at `/events/[slug]`. Organizer dashboard lists all events.
- Q: How is the organizer session persisted? → A: Signed `httpOnly` cookie, stateless — no DB session table.
- Q: What per-event theming does the organizer control? → A: Cover image + accent color. Stored as fields on the Event record; accent color applied via CSS custom properties on the public page.
- Q: Should SMS subscribers be able to RSVP by replying to blast messages? → A: Yes — inbound Twilio webhook parses yes/no/maybe replies, updates RSVP, and confirms with a reply SMS. (Phase 10, P2.)
- Q: Does publishing an Instance auto-send the announcement blast or is it a separate action? → A: Two separate steps — publish creates the Instance; the announcement blast is a separate deliberate organizer action.
- Q: Is a Subscriber record scoped per-event or global? → A: Per-event — one Subscriber record per person per Event.
- Q: What can guests edit on the manage subscription page, and how is identity maintained when contact method changes? → A: Identity is a stable UUID stored in the cookie. Guests can update name and contact method freely — changing contact is just a field update, UUID never changes. Subscribe form stays as name + (email or phone).
- Q: Why no JWT magic links in notifications? → A: Notifications send the plain public event URL. The cookie handles returning guest identity on the same device. On a new device, the re-subscribe form silently re-identifies the guest via email/phone match (resolveSubscriber step 2/3) — no duplicate is created and a fresh cookie is set. This is simpler and avoids JWT expiry edge cases.

### Session 2026-05-03 (continued)

- Q: What styling approach is used? → A: Water.css (classless, drop-in) provides baseline typography, form elements, and table styling. Component `<style>` blocks handle layout constraints and accent color theming. No Tailwind — overkill for this app's component count. Revisit for guest-facing pages if a warmer, more personal feel is desired.
- Q: How should rich text be stored and rendered? → A: Tiptap editor on the organizer side. HTML output stored in the database. Sanitized server-side with `isomorphic-dompurify` before write. Rendered on public pages with `{@html}`. No markdown — organizer is non-technical.
- Q: What does the Event description contain vs the Instance description? → A: Event description = the recurring series ("Craftnight is a monthly gathering where we make things together"). Instance description = per-occurrence agenda, project instructions, what to bring ("This month: linocut printing. Bring an apron.").
- Q: Do descriptions show on the public page? → A: Yes — both. Event description appears near the top. Instance description appears below the date/time/location block.
- Q: Do we need edit forms for events and instances? → A: Yes — organizer can edit name, description, cover image, accent color on events; and date, start time, end time, location, description on instances. Edit routes at `/organizer/events/[id]/edit` and `/organizer/events/[id]/instances/[instanceId]/edit`.

### Session 2026-05-04

- Q: Should the public event page show all instances or just the next upcoming one? → A: All instances, split into two sections: Upcoming (next first) and Past (most recent first). This lets guests see history and RSVP to any future date.
- Q: What does "subscriber" mean without automated notifications? → A: The subscriber/guest record exists for manual coordination, not notification delivery. The organizer needs to know who said yes and how to reach them (for a Signal group, spreadsheet, or day-of logistics) independently of whether that person received the group text. Name and contact are headcount and coordination tools.
- Q: Is "subscribe" the right concept if there's no subscription to notifications? → A: The data model is unchanged — a guest record with name and contact still makes sense. The first RSVP creates the record. The word "subscribe" in the UI can be softened but the underlying table and cookie logic are correct.
- Q: How does Turnstile work with multiple upcoming instances on one page? → A: Only one Turnstile widget per page, on the first upcoming instance that shows the first-time form. Once the guest submits (cookie set), all other instances flip to the lightweight form — no second Turnstile needed.
- Q: What happens if a guest RSVPs to Instance A then Instance B on the same page load? → A: After submitting Instance A (first-time form), the cookie is set. The page reloads (SvelteKit form action with redirect or enhance). On return, Instance B shows the lightweight returning-guest form. Two separate form submissions, two RSVP records.
- Q: Should past instance descriptions be shown? → A: No. Past instances show date, time, location, and the visitor's RSVP. Description is omitted to keep the past list compact — guests visiting the past section are checking history, not reading agendas.

### Session 2026-09-27

- Q: Should date polling be modeled as a new Poll entity, or reused from the existing Instance/Rsvp tables? → A: Reuse Instance with a new `status` field (`proposed`/`confirmed`/`cancelled`). `rsvps` already keys on `(subscriber_id, instance_id)`, so a guest RSVPing to two proposed Instances just creates two ordinary RSVP rows — no schema change needed there, and no new poll-vote mechanism.
- Q: Does the app store the poll announcement text (e.g. "Sat Oct 24 or Sun Oct 25 — let me know")? → A: No. That copy is posted manually to Signal, consistent with ADR-001 (no blast infrastructure). The public page shows only the bare candidate dates with RSVP forms; framing text is never persisted.
- Q: What happens to the non-chosen candidate(s) once the organizer confirms one? → A: They're cancelled and disappear from every public view entirely — not shown crossed out or labeled "not chosen." Cancelled Instances and their RSVPs remain visible only on the organizer dashboard, for reference.
- Q: Does confirming a candidate replace it with something new, or just change its status? → A: Just a status flip, `proposed` → `confirmed`. The confirmed Instance then behaves exactly like today's single-instance flow; RSVPs collected during the proposed phase carry over unchanged since they're already tied to that Instance's ID.
- Q: Is there a poll/batch entity grouping candidates, or does "confirm" act on all currently-proposed Instances for the Event? → A: No separate poll entity. Confirming one candidate implicitly cancels all other `proposed` Instances for that same Event. This assumes at most one live date-poll per Event at a time, which matches actual usage.

### Session 2026-09-27 (platform)

- Q: The constitution valued self-hosting, but the app already depends on Cloudflare for ingress, images, bot protection, and analytics. Which end of that do we commit to? → A: Lean in. The droplet was buying operational burden without buying independence — a Cloudflare Tunnel origin is not meaningfully self-hosted. Constitution value #3 amended from "organizer owns the infrastructure" to "organizer owns the data": portability now lives in the data format (SQLite, markdown, plain files in a bucket), not in hardware ownership.
- Q: What replaces Postgres on Workers, given a Worker can't open a TCP connection? → A: Cloudflare D1. Considered Hyperdrive + Neon (keeps Postgres but costs $5/mo and keeps a second vendor) and Neon's HTTP driver (free but a round trip per query). At 10-40 guests a month, D1 is correct sizing rather than a compromise. Drizzle's `d1` driver, migrations applied with `wrangler d1 migrations apply`.
- Q: Is there data to migrate? → A: No. Nothing has been deployed; local dev data is disposable. The D1 schema is written fresh rather than ported, and the three Postgres migrations in `drizzle/migrations/` are retired rather than translated.
- Q: Tiptap stores HTML and needs `isomorphic-dompurify`, which pulls jsdom and cannot run on Workers. Store ProseMirror JSON instead, or simplify? → A: Simplify. Drop Tiptap entirely for a plain `<textarea>` and markdown. ADR-002 justified a WYSIWYG on the grounds that "the organizer is non-technical" — the organizer is the developer, so that premise was never true. Removes ~25 Tiptap packages plus jsdom, and removes the sanitization step outright since the renderer escapes raw HTML rather than passing it through.
- Q: Does removing SMS mean removing phone numbers? → A: No. SMS as a *delivery channel* is gone (no Twilio, no outbound, no inbound webhook) and was never built. `subscribers.phone` stays: it is how the organizer reaches guests, since manual texting is the actual communication channel. Phone also remains the third key in `resolveSubscriber`'s identity priority. This makes the organizer's guest list an operational tool rather than a record — see FR-014a.
- Q: How does the app know "today" when a Worker has no local timezone? → A: An IANA timezone stored per Event (FR-056), defaulting to `America/Los_Angeles`. The previous implementation compared against `new Date().toISOString()`, meaning the midnight lock actually fired at 5pm local — a real bug against FR-020 that the move to Workers would have made permanent.
- Q: Does the organizer session need a session table now that it must expire properly? → A: No. plan.md Decision 1 already specified a signed `{ exp }` payload; the implementation drifted to signing a constant string, so `maxAge` was the only expiry and a copied cookie never died. Fixing the implementation to match the existing decision is sufficient — still stateless, still no table.
- Q: How do routes reach the database now that it's a per-request binding? → A: `locals.db`, constructed in `hooks.server.ts` from `platform.env.DB`. The module-level `db` singleton is removed. `resolveSubscriber` takes `db` as its first parameter, which is what tasks.md T039 specified before the implementation drifted to importing the singleton.

### Session 2026-09-27 (phase 17)

- Q: Write calendar times as a TZID plus a VTIMEZONE block, or as UTC instants? → A: UTC instants. Each Instance is one occurrence, so the instant is all a calendar needs; every client agrees on it; and a correct VTIMEZONE for an arbitrary IANA zone would have to be generated or shipped as a table. Costs nothing a guest would notice — their calendar shows the event at the right local time. FR-034 amended from the earlier TZID + VTIMEZONE wording.
- Q: How far should phone/email normalization go? → A: Minimal and US-centric, no library. The guests are a friends-scale group and the real need is that `(415) 555-2671` and `415-555-2671` stop being two people. A full parser would add a dependency and still could not tell a wrong number from a right one. International numbers are accepted as `+digits` exactly as typed.
- Q: How should the first tests run, including the ones that touch the database? → A: vitest in plain Node, with a real in-memory D1 from wrangler's `getPlatformProxy`. The identity logic depends on SQLite specifics (NULLs in unique indexes, CHECK constraints), so a fake database would test the wrong thing. `@cloudflare/vitest-pool-workers` was rejected because it pins vitest 4 while the project is on Vite 8.
- Found while writing the tests, not by design: an unsubscribed guest who re-subscribed with the same email or phone crashed with a UNIQUE constraint error (steps 2-3 of `resolveSubscriber` only searched active guests, but the unique indexes cover inactive rows too), and a double-tapped RSVP button could do the same. Both proven by failing tests first, then fixed (FR-062).

### Session 2026-09-27 (phase 14)

- Corrections to the Phase 14 task text, found by reading it against the code rather than by design: T080 said "one transaction" (D1 has none; `db.batch()` is atomic, proven by test) and never validated its target (confirming a cancelled candidate would have resurrected it while cancelling every live one); T084 said the RSVP actions needed no status handling (true for proposed, false for cancelled: FR-046 amended); T085 said the calendar endpoint was keyed off `upcomingInstances[0]` (it takes the id from the URL, so cancelled dates still downloaded: FR-053 amended).
- Found while building: the public page displayed no action errors at all (FR-063).
- Open, deliberately not built: there is no way to cancel or delete a single instance. A candidate created by mistake, or a poll abandoned without confirming any date, can only be removed by confirming a sibling, and a lone mistaken instance can't be removed at all. Not in the spec; raised with the organizer.
