Working on: Phases 15-17 are DONE and committed. Next is Phase 14 (date polls), then Phase 18 (deploy).
Status: `npm run check` clean (0 errors), `npm test` green (106 tests), production build bundles cleanly (`wrangler deploy --dry-run`, no `nodejs_compat`, 112 KB gzipped server).

## Where things stand

The app runs entirely on Cloudflare: Workers + D1 (SQLite) + R2 binding + Turnstile. No Docker, Postgres, or server. Descriptions are markdown in a textarea, rendered server-side with micromark. See ADR-006 and ADR-007 in `plan.md`; ADR-008 (tests) and ADR-009 (calendar times as UTC) were added in Phase 17.

Commits: `a4f0ba7` is one big snapshot of Phases 1-13 plus the migration (they were never committed individually and were rewritten in place). `3004e5a` and the Phase 17 commit follow it.

## Do this next

**Phase 14 — date polls** (`tasks.md` T077-T085; spec FR-047 to FR-055). Note T076 (the `instances.status` column) is already done: it was folded into the D1 schema. Build it against the D1 schema, and remember D1 has no multi-statement transactions: `confirmInstance` must flip one instance to `confirmed` and the others to `cancelled` using `db.batch()` so the two apply atomically. Write the failing test first, as Phase 17 did.

**Phase 18 — deploy.** Needs Matt: `wrangler secret put` for `SESSION_SECRET`, `ORGANIZER_PASSWORD_HASH` (generate with `npm run hash-password -- '<pw>'`), and `CLOUDFLARE_TURNSTILE_SECRET`; real Turnstile keys in place of the test ones; `npm run db:migrate:remote`; `npm run deploy`. Bucket public access is already enabled (`R2_PUBLIC_URL` is set).

## Not yet verified in a browser

Everything below type-checks and the underlying logic is tested, but nobody has clicked through it:
- Organizer login, and creating an event with markdown through the real forms (needs a password hash in `.dev.vars`)
- The "Text the group" list and Copy button on the instance dashboard (T117)
- The description textarea with JavaScript disabled
- A real phone: RSVP flow on a device that has never seen the site (T122)

## Hard-won gotchas

- **Layout `load` does not run before form actions.** The organizer auth guard lives in `hooks.server.ts` (FR-060). An unauthenticated POST to `/organizer/events/new` once inserted a row. Never rely on `+layout.server.ts` alone.
- **`$env/static/public` is build-time and reads `.env` files, not `wrangler.jsonc` vars.** Runtime values go through `platform.env` in `load()` and are passed down as page data.
- **Never write a literal `<script` inside a `{@html}` template literal.** Svelte's compiler scans raw text for it first. Use `renderJsonLd()`, which also escapes `<`, `>`, `&` so a description can't close the tag.
- **`svelte-check` and `checkJs`:** `tsconfig.json` has `checkJs: false` on purpose. Once a build exists, `wrangler types` imports the bundled Worker into the TS program and `checkJs` reports ~700 errors in generated code.
- **`types: []` in tsconfig** keeps `process`, `Buffer`, and `node:*` out of the TS program (NF-006). Tests read migration SQL with `import.meta.glob`, not `node:fs`.
- **Shell environments with `NODE_ENV=production`** (some agent tools set it) make `npm install`/`uninstall` prune every devDependency. Always run `NODE_ENV=development npm ... --include=dev`.
- **D1 has no `now()` and no cross-statement transactions.** Timestamps are app-supplied; use `batch()` for atomic multi-statement writes.
- **Contact fields are normalized on write** (`readContact`): emails lowercased, phones `+<digits>`. Anything new that stores an email or phone must go through it.
- `wrangler dev`'s interactive `d1 create` / `r2 bucket create` prompts append duplicate bindings to `wrangler.jsonc` instead of filling the existing ones. Check the file afterward.

## Commands

`npm run check` · `npm test` · `npm run dev` · `npm run db:generate` · `npm run db:migrate` (local) · `npm run cf-types` (after editing `wrangler.jsonc`) · `npm run hash-password -- '<pw>'`
