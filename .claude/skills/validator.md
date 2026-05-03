---
name: craftnight-validator
description: Validates suggestions against craftnight's locked architectural decisions. Use when asked to "check ADRs", "validate architecture", or before implementing significant features.
---

# craftnight Architecture Validator

Enforce locked ADRs before implementation.

## Quick Validation Checklist

Before ANY recommendation or implementation:

- [ ] Does it require an account to view or RSVP? (must not)
- [ ] Does it touch or harvest guest contacts? (must not)
- [ ] Does it add social/feed/discovery features? (must not)
- [ ] Does it stay within single-organizer scope?
- [ ] Does it use the committed stack (SvelteKit + PocketBase)?
- [ ] Is it plain JavaScript, not TypeScript?
- [ ] Does it belong on a single DO droplet?

## Critical ADR Violations to Catch

### ADR-006: No account required ⚠️
❌ Login wall before viewing event page
❌ Required account creation to RSVP
❌ OAuth/SSO for guests
✅ Name + email or phone = sufficient to RSVP
✅ Public event page, no auth

### ADR-002: PocketBase is the backend
❌ Introducing a separate database (Postgres, MySQL)
❌ Building a custom admin UI for organizer
❌ Adding a separate REST API layer
✅ PocketBase collections for all data
✅ PocketBase admin = organizer interface

### ADR-001: SvelteKit + plain JS
❌ Adding React, Vue, or other frontend frameworks
❌ Requiring TypeScript compilation
✅ `.svelte` components in JavaScript
✅ SvelteKit server routes for API endpoints

## Common Scope Creep

Watch for these expansions beyond the core loop:

❌ "Let guests see who else is coming" → social feed
❌ "Add a comment section to events" → social platform
❌ "Show nearby events" → discovery
❌ "Let co-hosts manage the event" → multi-organizer
❌ "Add ticket sales" → commercial platform
❌ "Send push notifications" → mobile app dependency

**If any of these appear → redirect to core loop: subscribe → notify → RSVP → headcount**

## Validation Report Format

```
# Architecture Validation

## ADR Compliance
✅ ADR-001: SvelteKit + plain JS maintained
✅ ADR-002: PocketBase as backend
❌ ADR-006: VIOLATION - requires login to RSVP

## Scope
✅ Within single-organizer bounds
⚠️ Check: could this become a social feature?

## Recommendations
1. [Specific fix]
2. [Alternative approach]
```
