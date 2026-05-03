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

### User Story 2 — Organizer Creates an Event (Priority: P1)

The organizer can create a named Event that guests will subscribe to. The Event is the persistent container — it exists independently of any specific date.

**Why this priority**: Events are the root entity. Nothing else can exist without one.

**Independent Test**: Log in, create an Event with name and description. Confirm it appears in the organizer's event list with no Instances yet.

**Acceptance Scenarios**:

1. **Given** the organizer is logged in, **When** they submit a new Event with a name and description, **Then** the Event is created and appears in the event list
2. **Given** an Event exists with no Instances, **When** the organizer views it, **Then** they see the Event details and an empty Instance list
3. **Given** the organizer submits an Event with no name, **When** the form is submitted, **Then** an error is shown and the Event is not created

---

### User Story 3 — Organizer Publishes an Instance (Priority: P1)

The organizer can publish a new Instance under an Event, specifying a date, time, and optional location. Publishing creates the Instance and makes it visible on the public event page. The announcement blast is a separate deliberate action.

**Why this priority**: Instances are what guests RSVP to. Without them, the guest flow cannot function.

**Independent Test**: With an existing Event, publish a new Instance with a date and time. Confirm it appears as the current Instance on the public event page.

**Acceptance Scenarios**:

1. **Given** an Event exists, **When** the organizer publishes an Instance with date, time, and location, **Then** the Instance appears as the current upcoming occurrence
2. **Given** an Instance is published, **When** a guest visits the Event's public page, **Then** they see the Instance's date, time, and location
3. **Given** the organizer submits an Instance without a date, **When** the form is submitted, **Then** an error is shown and the Instance is not created
4. **Given** multiple Instances exist for an Event, **When** a guest views the public page, **Then** they see only the most recent upcoming Instance

---

### User Story 4 — Guest Views Event Page (Priority: P1)

Any person with the Event's URL can view the public event page without creating an account. The page shows the Event description and the current upcoming Instance details.

**Why this priority**: The public page is the entry point for every guest. It must work with no friction.

**Independent Test**: Without any session or cookie, visit an Event's public URL. Confirm the page loads with Event and Instance details and a subscribe/RSVP form.

**Acceptance Scenarios**:

1. **Given** an Event with a published Instance exists, **When** anyone visits the public URL, **Then** they see the Event name, description, and Instance date/time/location
2. **Given** an Event has no published Instance, **When** anyone visits the public URL, **Then** they see the Event details with a message that no upcoming date is scheduled
3. **Given** an invalid or unknown Event URL, **When** anyone visits it, **Then** they see a 404 page

---

### User Story 5 — Guest Subscribes and RSVPs in One Step (Priority: P1)

A first-time guest can provide their name and a contact method (email or phone), choose their RSVP status for the current Instance, and submit — all in one form. After submission, a cookie is set so the app remembers them on return visits.

**Why this priority**: This is the core guest action. Every other guest story depends on an identity existing.

**Independent Test**: Visit a public event page with no cookie. Submit the subscribe+RSVP form with a name, email, and RSVP status. Confirm a Subscriber record exists, an RSVP record exists for the current Instance, and a cookie is set.

**Acceptance Scenarios**:

1. **Given** a guest with no cookie visits the event page, **When** they submit name + email + RSVP status, **Then** a Subscriber is created, an RSVP is recorded, and a remember-me cookie is set
2. **Given** a guest with no cookie visits the event page, **When** they submit name + phone + RSVP status, **Then** a Subscriber is created with phone, an RSVP is recorded, and a cookie is set
3. **Given** a guest submits with no name, **When** the form is submitted, **Then** an error is shown and no records are created
4. **Given** a guest submits with neither email nor phone, **When** the form is submitted, **Then** an error is shown and no records are created
5. **Given** a guest submits with an invalid email format, **When** the form is submitted, **Then** an error is shown

---

### User Story 6 — Returning Guest RSVPs via Remember-Me (Priority: P1)

A guest who has previously subscribed is recognized by their cookie on return visits. The page greets them by name and shows their current RSVP status for the upcoming Instance, which they can change without re-entering their details.

**Why this priority**: Repeat engagement is the whole point of a recurring event. The return experience must be frictionless.

**Independent Test**: Set a subscriber cookie, visit the public event page. Confirm the page shows the guest's name and current RSVP status. Change RSVP status, confirm it updates without requiring name or contact re-entry.

**Acceptance Scenarios**:

1. **Given** a guest has a valid subscriber cookie, **When** they visit the event page, **Then** they are greeted by name and shown their current RSVP status
2. **Given** a returning guest sees their RSVP status, **When** they change it and submit, **Then** the RSVP record is updated
3. **Given** a returning guest has not yet RSVPed to the current Instance, **When** they visit the page, **Then** they see a prompt to RSVP with no status pre-selected
4. **Given** a guest's cookie references a deleted or invalid Subscriber, **When** they visit the page, **Then** the cookie is cleared and the first-time subscribe form is shown

---

### User Story 7 — Organizer Sends Announcement Blast (Priority: P1)

After publishing an Instance, the organizer can trigger an announcement blast that sends a notification to all subscribers for that Event.

**Why this priority**: Notification is the core value delivered to subscribers. Without it, guests have no way to learn about new Instances.

**Independent Test**: With subscribers on an Event and a published Instance, trigger an announcement blast. Confirm all subscribers with email receive an email and all with phone receive an SMS.

**Acceptance Scenarios**:

1. **Given** an Instance is published and subscribers exist, **When** the organizer triggers an announcement blast, **Then** all subscribers receive a notification via their chosen channel
2. **Given** a subscriber has email, **When** an announcement blast is sent, **Then** they receive an email containing the Event name, Instance date/time/location, and a personalized link containing their subscriber token
3. **Given** a subscriber has phone, **When** an announcement blast is sent, **Then** they receive an SMS containing the Event name, Instance date/time, and a personalized URL containing their subscriber token
4. **Given** an announcement blast has already been sent for an Instance, **When** the organizer views the Instance, **Then** the blast is marked as sent with a timestamp and cannot be re-triggered accidentally

---

### User Story 8 — Organizer Sends Reminder Blast (Priority: P2)

The organizer can trigger a reminder blast for a published Instance. The reminder goes only to subscribers who have RSVPed yes or maybe — not the full subscriber list.

**Why this priority**: Reminders add meaningful value close to the event but are not required for the first working version.

**Independent Test**: With mixed RSVPs on an Instance (yes, maybe, no), trigger a reminder blast. Confirm only yes and maybe subscribers receive a notification.

**Acceptance Scenarios**:

1. **Given** an Instance has yes and maybe RSVPs, **When** the organizer triggers a reminder blast, **Then** only yes and maybe subscribers receive a notification
2. **Given** a subscriber RSVPed no, **When** a reminder blast is sent, **Then** they do not receive a notification
3. **Given** no subscribers have RSVPed yes or maybe, **When** the organizer attempts a reminder blast, **Then** they see a message that there are no recipients and no blast is sent

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

### User Story 11 — Guest RSVPs via SMS Reply (Priority: P2)

A subscriber who receives an SMS notification can reply with "yes", "no", or "maybe" (and common variants) to RSVP directly without visiting the event page. The system confirms their RSVP with a reply SMS.

**Why this priority**: Significantly lowers the RSVP barrier for SMS subscribers but requires inbound webhook infrastructure not needed for MVP.

**Independent Test**: Send a test SMS blast to a subscriber. Reply "yes" from their phone. Confirm RSVP record is updated and a confirmation SMS is received. Reply "maybe" — confirm update. Reply with an unrecognized string — confirm a helpful error SMS is returned.

**Acceptance Scenarios**:

1. **Given** a subscriber replies "yes", "y", or "yep" to a blast SMS, **When** Twilio delivers the webhook, **Then** their RSVP is set to yes and they receive a confirmation reply
2. **Given** a subscriber replies "no", "n", or "nope", **When** Twilio delivers the webhook, **Then** their RSVP is set to no and they receive a confirmation reply
3. **Given** a subscriber replies "maybe", "m", or "perhaps", **When** Twilio delivers the webhook, **Then** their RSVP is set to maybe and they receive a confirmation reply
4. **Given** a subscriber replies after the Instance date has passed, **When** Twilio delivers the webhook, **Then** their RSVP is not updated and they receive a reply explaining the event has passed
5. **Given** an unrecognized phone number replies, **When** Twilio delivers the webhook, **Then** no RSVP is recorded and they receive a reply explaining they are not subscribed
6. **Given** a subscriber sends an unrecognized reply, **When** Twilio delivers the webhook, **Then** their RSVP is not updated and they receive a reply with valid options listed
7. **Given** Twilio delivers a webhook with an invalid signature, **When** the server validates it, **Then** the request is rejected with 403 and no RSVP is recorded

---

### User Story 10 — Guest Manages Subscription (Priority: P2)

A guest can visit a self-service page to view their subscription details, update their name or contact method, or unsubscribe entirely. Because identity is tied to a stable UUID rather than the contact method, guests can freely switch between email and SMS without losing their subscription history.

**Why this priority**: Unsubscribe is a legal and ethical requirement but not needed before first real use.

**Independent Test**: As a remembered guest, navigate to the manage subscription page. Confirm name and contact are shown. Unsubscribe, confirm Subscriber record is deactivated and cookie is cleared.

**Acceptance Scenarios**:

1. **Given** a guest visits the manage page with a valid subscriber cookie, **When** the page loads, **Then** they see their name and current contact method
2. **Given** a guest updates their name or contact method and submits, **When** the action completes, **Then** the Subscriber record is updated and a confirmation is shown; their UUID and RSVP history are unchanged
3. **Given** a guest clicks unsubscribe and confirms, **When** the action completes, **Then** their Subscriber record is deactivated, their cookie is cleared, and they see a confirmation message
4. **Given** a guest visits the manage page via a personalized link in a notification, **When** they arrive, **Then** they are identified via the subscriber token in the URL without needing a cookie, and the token also sets a fresh cookie for future visits
5. **Given** an unsubscribed guest visits the event page, **When** the page loads, **Then** the subscribe form is shown again (they can re-subscribe)

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST require organizer authentication for all `/organizer/*` routes
- **FR-002**: System MUST support a single organizer account configured via environment variables
- **FR-003**: System MUST allow creation of multiple Events, each with a unique slug used as its public URL (`/events/[slug]`), a cover image, and an accent color
- **FR-023**: System MUST apply each Event's cover image and accent color to its public event page (accent color tints buttons and headings via CSS custom properties)
- **FR-004**: System MUST allow creation of Instances with date, time, and optional location under an Event
- **FR-005**: System MUST display the most recent upcoming Instance on the public event page
- **FR-006**: System MUST assign a stable UUID to each Subscriber at creation time; this UUID is the identity key stored in the remember-me cookie and encoded in JWT tokens
- **FR-006a**: System MUST accept guest subscriptions with name + (email or phone); each Subscriber record is scoped to a single Event
- **FR-006b**: System MUST resolve duplicate subscribers using this priority order: (1) cookie UUID match, (2) email match, (3) phone match, (4) create new record
- **FR-007**: System MUST record RSVPs with one of three statuses: yes, maybe, no
- **FR-008**: System MUST set a persistent cookie identifying a returning subscriber
- **FR-009**: System MUST pre-populate RSVP state for returning subscribers without re-entry of contact details
- **FR-010**: System MUST send announcement blasts to all active subscribers via their chosen channel
- **FR-011**: System MUST send reminder blasts only to subscribers with yes or maybe RSVP status
- **FR-012**: System MUST prevent duplicate announcement blasts for the same Instance
- **FR-013**: System MUST display RSVP counts broken out by yes / maybe / no on the Instance dashboard
- **FR-014**: System MUST display subscriber list with name, contact, and per-Instance RSVP status
- **FR-015**: System MUST provide a self-service unsubscribe flow accessible via personalized token link in notifications and via the event page for cookie-identified guests
- **FR-018**: System MUST generate a signed JWT containing subscriber ID and 30-day expiry for each notification sent; no token storage table required
- **FR-019**: System MUST identify a guest arriving via a subscriber token link and set a fresh remember-me cookie on arrival
- **FR-020**: System MUST lock RSVP editing once the Instance date has passed
- **FR-021**: System MUST display past Instances as read-only on the public event page with a "this event has passed" state
- **FR-022**: Organizer dashboard MUST show a list of all Events as the top-level view
- **FR-016**: System MUST deliver email notifications via Resend
- **FR-017**: System MUST deliver SMS notifications via Twilio
- **FR-024**: System MUST expose a Twilio webhook endpoint to receive inbound SMS replies
- **FR-025**: System MUST validate Twilio webhook signatures and reject invalid requests with 403
- **FR-026**: System MUST match inbound SMS sender phone number to a Subscriber record and update their RSVP for the current Instance
- **FR-027**: System MUST reply with a confirmation SMS after a successful RSVP-via-reply
- **FR-029**: Public event pages MUST include Open Graph meta tags (`og:title`, `og:description`, `og:image`) using the Event name, description, and cover image respectively

### Non-Functional Requirements

- **NF-001**: Public event page MUST render without JavaScript (server-rendered)
- **NF-002**: Organizer session MUST be stored as a signed `httpOnly` cookie; no server-side session table required. Session MUST expire after 24 hours.
- **NF-003**: Subscriber cookie MUST persist for 1 year
- **NF-004**: Notification blast MUST complete within 60 seconds for up to 100 subscribers
- **NF-005**: No guest data (email, phone) MUST be exposed in public-facing HTML or URLs
- **NF-006**: Subscriber tokens in notification links MUST be time-limited to 30 days

---

## Success Criteria

1. Organizer can create an Event and publish the first Instance in under 5 minutes
2. A first-time guest can subscribe and RSVP in under 60 seconds
3. A returning guest can update their RSVP in under 10 seconds
4. Announcement blast reaches all subscribers within 60 seconds of trigger
5. The tool successfully supports a real monthly craft night with 10-40 guests for at least 3 consecutive months

---

## Edge Cases

- Guest submits subscribe form with an email already in the subscriber list → resolve identity by priority: cookie UUID match first, then email match, then phone match; record RSVP against matched record; do not update name or create duplicate
- Guest submits subscribe form with a phone already in the subscriber list → same priority resolution as above
- Organizer publishes a new Instance while a previous one is in the future → both exist; public page shows the nearest upcoming one
- Subscriber cookie exists but the Instance has changed since last visit → show new Instance, prompt for fresh RSVP
- Blast is triggered when a subscriber's email bounces or SMS fails → log the failure, do not retry automatically in MVP; surface failure count to organizer
- Guest unsubscribes then re-subscribes → create new Subscriber record (or reactivate deactivated one); prior RSVP history is not surfaced to guest
- Organizer triggers reminder blast with zero yes/maybe RSVPs → show warning, block send
- Guest visits event page after Instance date has passed → page shows read-only "this event has passed" state; RSVP form is not shown


---

## Clarifications

### Session 2026-05-03

- Q: If a returning guest re-submits the subscribe form with a different name, does the name update? → A: No — keep the original name; do not overwrite on re-subscribe.
- Q: Do notification links carry a personalized subscriber token enabling auto-identification and unsubscribe? → A: Yes — every notification link is personalized with a 30-day subscriber token. Clicking through identifies the guest, sets/refreshes their cookie, and the same token enables unsubscribe without a separate mechanism.
- Q: Can guests update their RSVP after the Instance date has passed? → A: No — RSVPs lock after the Instance date; past events are read-only.
- Q: Single Event or multiple Events? → A: Multiple Events supported; each has its own public URL at `/events/[slug]`. Organizer dashboard lists all events.
- Q: How is the organizer session persisted? → A: Signed `httpOnly` cookie, stateless — no DB session table.
- Q: What per-event theming does the organizer control? → A: Cover image + accent color. Stored as fields on the Event record; accent color applied via CSS custom properties on the public page.
- Q: Should SMS subscribers be able to RSVP by replying to blast messages? → A: Yes — inbound Twilio webhook parses yes/no/maybe replies, updates RSVP, and confirms with a reply SMS.
- Q: Does publishing an Instance auto-send the announcement blast or is it a separate action? → A: Two separate steps — publish creates the Instance; the announcement blast is a separate deliberate organizer action.
- Q: Are subscriber tokens signed JWTs (stateless) or DB-stored? → A: Signed JWTs — no token table needed.
- Q: Is a Subscriber record scoped per-event or global? → A: Per-event — one Subscriber record per person per Event.
- Q: What can guests edit on the manage subscription page, and how is identity maintained when contact method changes? → A: Identity is a stable UUID stored in the cookie and JWT. Guests can update name and contact method freely — changing contact is just a field update, UUID never changes. Subscribe form stays as name + (email or phone).
