# craftnight Constitution

**Created**: 2026-05-03
**Project**: craftnight

---

## Purpose

A lightweight recurring event tool that lets organizers announce event instances and collect RSVPs from an opt-in subscriber base — without requiring a social platform, contacts harvesting, or account creation from guests.

---

## Core Values

1. **Privacy is structural, not a policy.** The app never asks for a guest's contacts, never builds a social graph, and never harvests data beyond what's needed for notification and RSVP. Guests opt in on their own terms.

2. **Subscribers, not invitees.** The unit of membership is a subscription to an Event, not an invitation to a specific date. Guests join the list once and stay on it. The organizer's job is to announce, not to curate.

3. **The organizer owns the data, not the hardware.** Amended 2026-09-27. The original value was self-hosting on controlled hardware. In practice the app already depended on Cloudflare for ingress, image storage, bot protection, and analytics, so owning the box bought operational burden without buying independence. The value that actually matters is portability of the *data*: four tables of SQLite, descriptions stored as markdown, images as ordinary files in a bucket. Nothing is held in a proprietary format, an export is a file copy, and the whole thing costs nothing to run — so it never goes dark for non-payment. The tool should be boring and reliable.

4. **Do one thing well.** This is not a social platform, not a feed, not a community tool. It publishes dates for a recurring event and collects RSVPs against them. It does not deliver notifications — that is the organizer's group thread's job (ADR-001). Resist every feature that pulls it toward something bigger.

5. **No friction for guests.** Viewing an event page requires no account. RSVPing requires only a name and notification preference. The bar to participate must be lower than any alternative.

---

## Hard Constraints

- **SvelteKit frontend and backend.** File-based routing, server actions, server-rendered pages. Organizer UI is built as part of the app — no separate admin tool.
- **Drizzle ORM.** Lightweight query builder with explicit, SQL-like syntax. No magic ORM abstraction.
- **Cloudflare Workers.** Deployed via `@sveltejs/adapter-cloudflare`. No container, no VM, no long-lived process, no ingress tunnel. The Worker is the origin. (ADR-006)
- **Cloudflare D1.** SQLite, bound to the Worker. No connection string, no database server to operate or back up by hand. Reached through Drizzle's `d1` driver. (ADR-006)
- **Web platform APIs only.** WebCrypto, `fetch`, `Request`/`Response`. No Node built-ins and no `nodejs_compat` flag — if a dependency needs `node:*` or `Buffer`, it does not belong in this codebase.
- **TypeScript.** Svelte components and server routes in TypeScript. Drizzle schema inference provides end-to-end type safety from DB layer through SvelteKit route types.
- **Cloudflare R2 for image storage.** Cover images written through the Worker's native R2 binding, not the S3 API. No credentials in env, no SDK. (ADR-006)
- **Cloudflare Turnstile for bot protection.** Applied to the public subscribe/RSVP form. Privacy-respecting, no user puzzles.
- **Cloudflare Web Analytics.** Injected into public event pages. Cookie-free, no fingerprinting — consistent with the privacy constitution value.
- **Markdown for formatted text.** Event and Instance descriptions are authored as markdown in a plain `<textarea>` and rendered server-side by a renderer that does not emit raw HTML. No WYSIWYG editor, no stored HTML, no sanitization step. (ADR-007)
- **No notification delivery of any kind.** No email provider, no SMS provider, no push. The organizer shares the event URL in their existing group thread. This decision is closed, not deferred. (ADR-001)

---

## Out of Scope

- Social graph, friend lists, contacts harvesting of any kind
- Federation (ATProto, ActivityPub) — philosophically interesting, explicitly not MVP
- Ticketing, payments, capacity management
- Commercial event organizer features (analytics, branding, multi-host orgs)
- Activity feed, reactions, comments
- Mobile app (responsive web only)
- Account required to view event page or RSVP
- Multi-organizer or team features
- Discovery — events are not listed publicly beyond their own URL

---

## Success Criteria

1. Organizer can create an Event and publish the first Instance in under 5 minutes
2. Guest can RSVP to any upcoming instance without creating an account
3. Organizer sees an accurate headcount and guest list before each event
4. A guest who follows the event link from the group thread can RSVP in under 60 seconds on a device the app has never seen
5. The tool successfully supports a real monthly craft night with 10-40 guests for at least 3 consecutive months
6. Running the app costs nothing and requires no scheduled maintenance
