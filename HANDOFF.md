Working on: Phase 15 — platform migration to Cloudflare Workers + D1. Spec reconciliation (Phase A) is complete; no code has changed yet.
Status: Phases 1–13 complete and working on the old Node/Postgres stack. Phases 15–18 are spec'd and not started. Phase 14 (date polls) is spec'd, unstarted, and deliberately deferred until after Phase 17.

## What just happened (2026-09-27)

An architecture review before first deploy produced two new ADRs and a full reconciliation of the `.specify/` documents, which had drifted badly from the code.

**ADR-006 — run entirely on Cloudflare.** The constitution valued self-hosting, but the app already depended on Cloudflare for ingress, images, bot protection, and analytics; the droplet was buying operational burden without buying independence. Decision: Workers + D1 + R2 bindings. Docker, Postgres, cloudflared, and the droplet all go away. Constitution value #3 amended from "owns the infrastructure" to "owns the data."

**ADR-007 — markdown replaces Tiptap.** `isomorphic-dompurify` pulls jsdom, which cannot run on Workers. And ADR-002's premise ("the organizer is non-technical") was never true — the organizer is the developer. Plain textarea, markdown stored, `micromark` renders server-side with raw HTML escaped, so the sanitization step disappears entirely.

**Spec reconciliation** (all four `.specify/` docs + this file): removed US7, US8, US11 and FR-010/011/012/016/017/024–027 and NF-004, all of which described blast infrastructure deleted on 2026-09-26. Added FR-014a, FR-056–059, NF-006, NF-007.

## Three real bugs the review found

These are fixed as part of Phase 15/17, not tracked separately:

1. **Auth fails open.** `isOrganizerSessionValid()` returns `true` whenever `NODE_ENV !== 'production'`. The whole organizer surface is gated on one env var. On Workers `process.env.NODE_ENV` doesn't exist, so this would fail open in production. `validateTurnstileToken` has the same shape when the secret is unset. → FR-057, T098/T101.
2. **Sessions never expire.** The signed payload is the literal constant `"authenticated"` — no `exp`, same string forever. `maxAge` is a client-side hint, so a copied cookie is valid until `SESSION_SECRET` rotates. Note `plan.md` Decision 1 already specified `{ exp: unixTimestamp }`; the implementation drifted. → NF-002, T098.
3. **The midnight lock fires at 5pm.** `dates.ts` compares against `new Date().toISOString()`, i.e. UTC. → FR-020/FR-056, T114.

## Do this next

Start Phase 15 in `.specify/tasks.md` (T086–T105). Order matters: toolchain → data layer → auth/crypto → thread `locals.db` through the routes.

**The one structural thing to understand before starting:** D1 is a per-request binding, so `import { db } from '$lib/db'` cannot work. `src/lib/db/index.ts` becomes a `makeDb(d1)` factory, `hooks.server.ts` builds `locals.db`, and ~11 route files change. `resolveSubscriber` takes `db` as its first parameter again — which is what `tasks.md` T039 originally specified before the code drifted to importing the singleton. Secrets move from `$env/static/private` to `platform.env` for the same reason.

Second: WebCrypto HMAC is async where `node:crypto`'s was sync, so `isOrganizerSessionValid` and `readSubscriberCookieMap` become async and `hooks.server.ts` awaits both.

Phases: 15 (platform) → 16 (markdown) → 17 (timezone/ICS) → 14 (date polls) → 18 (deploy). Commit at each phase boundary.

## Key decisions locked in this session

- **D1, not Hyperdrive or Neon.** Four small tables for a monthly 10–40 person event; SQLite is correct sizing, free, and one fewer vendor.
- **No data migration.** Nothing is deployed, dev data is disposable. Fresh SQLite schema; the three Postgres migrations are retired, not translated.
- **Phone numbers stay.** SMS as a *delivery channel* is gone for good, but `subscribers.phone` is load-bearing: manual texting is the actual communication channel. That's why FR-014a now requires `tel:` links and a one-tap copy of the yes/maybe phone list on the instance dashboard.
- **No `nodejs_compat`.** Deliberately off, so a Node-shaped dependency fails at build instead of quietly bloating the bundle.
- **`instances.status` is folded into the new schema** (T092) rather than added later by Phase 14's T076.

## Gotchas carried forward

- `{@const}` must be at the top of an `{#each}` block or you get a 500
- `<svelte:head>` styles can't interpolate CSS variable values — use an inline `style` on a wrapper
- The old `.env` `$`-escaping trap dies with dotenv; `.dev.vars` and `wrangler secret` don't interpolate
- D1 has no cross-statement transactions. Only matters for Phase 14's `confirmInstance` — use `batch()`
- Dev server may already be running on 5173; check before directing anyone to a URL
