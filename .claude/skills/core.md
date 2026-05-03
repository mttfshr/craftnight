---
name: craftnight-core
description: craftnight identity and architectural principles. Use when starting a new session, when user asks about project philosophy, what craftnight is/isn't, or when validating if a suggestion aligns with core principles.
---

# craftnight: Core Identity & Principles

A lightweight recurring event tool for opt-in subscriber RSVPs — no social graph, no contacts harvesting, no account required to attend.

## Project Identity

### What craftnight IS:
- ✅ A recurring event series manager with subscriber notifications
- ✅ A privacy-first RSVP tool for casual recurring gatherings
- ✅ Self-hosted personal infrastructure owned by the organizer
- ✅ A headcount tool — organizer knows who to expect before each event
- ✅ Frictionless for guests — view and RSVP with no account

### What craftnight is NOT:
- ❌ A social platform or feed
- ❌ A contacts harvester or social graph builder
- ❌ A commercial event platform (no ticketing, no analytics)
- ❌ A discovery platform (events are not publicly listed)
- ❌ A mobile app
- ❌ A multi-organizer or team tool

## Locked Architectural Decisions

ADRs documented in `docs/decisions.md`:

**Core Stack:**
- ADR-001: SvelteKit frontend (file-based routing, server actions, plain JS)
- ADR-002: PocketBase backend (admin UI = organizer interface, SQLite, API)
- ADR-003: Digital Ocean single droplet (no serverless/edge)

**Notification Delivery:**
- ADR-004: Resend for email notifications
- ADR-005: Twilio for SMS notifications

**Data Philosophy:**
- ADR-006: No account required to view or RSVP — name + notification preference only

## Philosophical Principles

### Privacy Alignment:
- Privacy is structural, not a policy — never ask for what you don't need
- Guests opt in; organizer never imports contacts on their behalf
- Subscriber list lives on organizer-controlled infrastructure

### Design Philosophy:
- **Subscribers over invitees** — join the series once, not each event
- **Boring reliability over clever features** — this tool should never require attention
- **One thing well** — resist every pull toward social, discovery, or community features

## Common Violations to Catch

❌ **Adding social features** — comments, reactions, who-else-is-coming feeds
❌ **Contacts harvesting** — importing guest contacts, friend suggestions
❌ **Discovery features** — public event listings, search, explore pages
❌ **Scope creep toward platform** — multi-organizer, orgs, teams, ticketing
❌ **TypeScript requirement** — project is plain JavaScript

## Quick Reference

**Project Location**: `/Users/matt/Github/craftnight`
**Current Phase**: Constitution drafted, pre-spec
**Stack**: SvelteKit + PocketBase + Resend + Twilio + Digital Ocean
