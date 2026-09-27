# craftnight

Self-hosted, privacy-first SvelteKit app for organizing recurring craft nights with friends: event/instance management, per-instance RSVPs, and headcount tracking. Single organizer, notifications handled manually via a Signal group thread (no blast/email infra by design — see `.specify/plan.md`).

## Stack

- SvelteKit + TypeScript, `adapter-node`
- Drizzle ORM + PostgreSQL
- Cloudflare R2 (cover image storage), Turnstile (bot protection), Tunnel (ingress), Web Analytics
- Water.css (classless stylesheet)
- Tiptap (rich text editor)
- Docker + docker-compose (local Postgres + production deploy)

## Domain model

- **Event** → **Instance** (deliberately not "series" — no implied mandatory recurrence)
- **Subscriber** — scoped per-event, identified by a stable UUID in a remember-me cookie; needs email or phone (or both)
- **Rsvp** — one per subscriber per instance, status `yes` / `maybe` / `no`, locks at midnight on the instance date
- Organizer session — HMAC-signed httpOnly cookie, no DB session table

Schema: `src/lib/db/schema.ts`. Migrations: `drizzle/migrations/`.

## Local development

1. Copy `.env.example` to `.env` and fill in values (see Environment variables below)
2. `docker compose up` — starts Postgres + the app (dev server, `npm install` runs inside the container)
3. Push the schema: `npx drizzle-kit push`
4. App runs at http://localhost:5173 (check the running container if that port's taken — see `ways-of-working`)

Running outside Docker: `npm install`, then `npm run dev`. Postgres still needs to be reachable at `DATABASE_URL`.

Other scripts: `npm run build`, `npm run preview`, `npm run check` (svelte-check).

## Environment variables

See `.env.example` for the full list with inline notes. Highlights:

- `DATABASE_URL` — Postgres connection string
- `SESSION_SECRET` — organizer cookie signing secret (`openssl rand -base64 32`)
- `R2_*` — Cloudflare R2 credentials for cover image uploads
- `CLOUDFLARE_TURNSTILE_SECRET` / `PUBLIC_TURNSTILE_SITE_KEY` — bot protection on the subscribe form (dev test key: `1x00000000000000000000AA`)
- `CF_TUNNEL_TOKEN` — production ingress only
- `ORGANIZER_EMAIL` / `ORGANIZER_PASSWORD_HASH` — organizer login; generate the hash with `node -e "const b = require('bcryptjs'); b.hash('yourpassword', 12).then(console.log)"`, then **escape every `$` as `\$`** in `.env`

## Production deploy

1. Fill in `.env` completely (real Turnstile keys, not test keys)
2. `docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build`
3. Run migrations: `npx drizzle-kit push`
4. Confirm the Cloudflare Tunnel routes to `app:3000`

`Dockerfile` is a two-stage build (build → `adapter-node` runtime on `node:20-alpine`, port 3000).

## Routes (short version)

- `/` — landing
- `/events/[slug]` — public event page: Upcoming/Past instances, inline RSVP, subscribe form
- `/events/[slug]/manage` — guest self-service: update or unsubscribe
- `/events/[slug]/instances/[instanceId]/calendar.ics` — ICS export for an instance
- `/organizer` — dashboard (login-gated): event list, event detail, instance management, RSVP counts

## Where things live

- `.specify/constitution.md`, `spec.md`, `plan.md`, `tasks.md` — living spec/plan/task docs; **ADRs and design decisions live in `plan.md`**, not a separate file
- `HANDOFF.md` — rewritten (not appended) at the end of each session; read this first when picking work back up
