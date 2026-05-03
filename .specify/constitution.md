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

3. **Organizer owns the infrastructure.** Self-hosted on hardware the organizer controls. No dependency on VC-backed platforms, no risk of shutdown, no data held hostage. The tool should be boring and reliable.

4. **Do one thing well.** This is not a social platform, not a feed, not a community tool. It sends notifications and collects RSVPs for recurring events. Resist every feature that pulls it toward something bigger.

5. **No friction for guests.** Viewing an event page requires no account. RSVPing requires only a name and notification preference. The bar to participate must be lower than any alternative.

---

## Hard Constraints

- **SvelteKit frontend and backend.** File-based routing, server actions, server-rendered pages. Organizer UI is built as part of the app — no separate admin tool.
- **Drizzle ORM.** Lightweight query builder with explicit, SQL-like syntax. No magic ORM abstraction.
- **Postgres.** Hosted via Docker Compose on the same droplet. Simple schema, no exotic Postgres features needed.
- **Resend for email.** Notification delivery for email subscribers.
- **Twilio for SMS.** Notification delivery for phone subscribers.
- **Digital Ocean hosting.** Single droplet, Docker Compose. No serverless/edge constraints.
- **Plain JavaScript.** No TypeScript requirement. Svelte components and server routes in JS.

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
2. Guest can opt in to notifications and RSVP to the next instance without creating an account
3. Organizer sees an accurate headcount and subscriber list before each event
4. Subscribers receive timely notifications via their chosen channel (email or SMS) when a new instance is announced
5. The tool successfully supports a real monthly craft night with 10-40 guests for at least 3 consecutive months
