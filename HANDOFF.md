Working on: Phases 14-17 are DONE and the app is deploy-ready pending YOUR steps below. Only Phase 18 (deploy) remains, plus two open product questions.
Status: `npm run check` clean (0 errors), `npm test` green (267 tests, 11 files), production build bundles cleanly, and `npm run deploy:check` currently refuses to deploy for exactly one reason (see below).

## Where things stand

The app runs entirely on Cloudflare: Workers + D1 (SQLite) + R2 binding + Turnstile. No Docker, Postgres, or server. Descriptions are markdown in a textarea, rendered server-side with micromark. Decisions are in `plan.md`: ADR-005 (date polls, with a Phase 14 amendments block), ADR-006 (Cloudflare), ADR-007 (markdown), ADR-008 (tests run in Node against real in-memory D1), ADR-009 (calendar times as UTC).

## Do this next — Phase 18, deploy (needs Matt)

`npm run deploy:check` runs the preflight on its own. Today it says: **the Turnstile site key in `wrangler.jsonc` is Cloudflare's dummy key.** That is the only problem it finds. In order:

1. **Create a real Turnstile widget** in the Cloudflare dashboard (Turnstile). Put its *site key* in `wrangler.jsonc` `vars.PUBLIC_TURNSTILE_SITE_KEY`. Keep its *secret key* for step 3. The two must belong to the same widget.
2. **Generate the password hash:** `npm run hash-password -- '<a long random password>'`. Copy the `pbkdf2$...` value.
3. **Set the three production secrets.** The Worker doesn't exist yet; `wrangler secret put` will ask whether to create it and add the secret (say yes):
   `npx wrangler secret put SESSION_SECRET` (any long random string; rotating it logs everyone out)
   `npx wrangler secret put ORGANIZER_PASSWORD_HASH` (the value from step 2)
   `npx wrangler secret put CLOUDFLARE_TURNSTILE_SECRET` (the widget's secret from step 1)
4. `npm run db:migrate:remote` (the remote D1 has never been migrated).
5. `npm run deploy` (runs the preflight, builds, deploys; refuses if anything above is missing).
6. Real-world check (T122): log in, create an event, publish an instance, send the link, and RSVP from a phone that has never seen the site.

**Login CPU on the Workers FREE plan.** PBKDF2 costs ~6-7 ms per login in workerd, against a ~10 ms free-plan CPU limit. If login fails in production with "Worker exceeded CPU time limit": `npm run hash-password -- '<same password>' 50000`, then `wrangler secret put ORGANIZER_PASSWORD_HASH`. No code change or redeploy; the count lives inside the hash. Not an issue on the Paid plan.

**No login rate limiting exists.** Nothing slows repeated password guesses except the hash cost. Use a long random password, and consider a Cloudflare WAF rate-limiting rule on `/organizer/login` or Turnstile on the login form. Not built.

## Open questions for Matt (not built)

- **No way to cancel or delete a single instance.** A candidate created by mistake, or a date poll abandoned without confirming any date, can only be cleared by confirming a sibling; a lone mistaken instance can't be removed at all. Not in the spec. Probably wants a "Cancel this date" action on the instance dashboard.
- **Safari and login.** The session cookie is `Secure` unconditionally on the assumption that browsers exempt localhost. If Safari keeps bouncing to the login page in local dev, that's the first suspect (Safari has historically refused `Secure` cookies over plain `http://localhost`). Irrelevant in production over HTTPS.

## Not yet verified in a browser

Logic is tested and the served HTML has been checked with curl, but nobody has clicked through:
- Organizer login and creating an event through the real forms (needs a password hash in `.dev.vars`)
- The "Confirm this date" button and its `confirm()` dialog; the layout of the Proposed table
- Guest error messages appearing IN PLACE when JavaScript is on (reasoned from how `use:enhance` works; only the no-JS path was tested)
- The "Text the group" list and Copy button on the instance dashboard
- The description textarea with JavaScript disabled

## Hard-won gotchas

- **Layout `load` does not run before form actions.** The organizer auth guard lives in `hooks.server.ts` (FR-060). An unauthenticated POST to `/organizer/events/new` once inserted a row.
- **`curl` sends `Accept: */*`, which SvelteKit resolves to its JSON action protocol** (a `200` wrapping `{"type":"failure","status":400,...}`), not the HTML a browser gets. To test what a browser without JS sees, send `-H 'Accept: text/html'`.
- **To test as the organizer without touching real secrets:** run `wrangler dev --local --var SESSION_SECRET:<throwaway>` and sign a `craftnight_organizer` cookie (`base64url({exp})` + `.` + hex HMAC-SHA256) with that throwaway. A tampered cookie is rejected.
- **A security test that passes first time proves nothing until it has been made to fail.** The auth tests were mutation-checked: break `auth.ts` on purpose, confirm the tests catch it, `git checkout` the file. Do the same when changing auth.
- **`$env/static/public` is build-time and reads `.env` files, not `wrangler.jsonc` vars.** Runtime values go through `platform.env` in `load()` and are passed down as page data.
- **Never write a literal `<script` inside a `{@html}` template literal.** Svelte's compiler scans raw text for it first. Use `renderJsonLd()`, which also escapes `<`, `>`, `&` so a description can't close the tag.
- **`checkJs: false` in tsconfig is deliberate.** Once a build exists, `wrangler types` imports the bundled Worker into the TS program and `checkJs` reports ~700 errors in generated code.
- **`types: []` in tsconfig** keeps `process`, `Buffer`, and `node:*` out of the TS program (NF-006). Tests read migration SQL with `import.meta.glob`, not `node:fs`. `scripts/*.mjs` are outside the TS project and may use Node built-ins.
- **Shell environments with `NODE_ENV=production`** (some agent tools set it) make `npm install`/`uninstall` prune every devDependency. Always run `NODE_ENV=development npm ... --include=dev`.
- **D1 has no `now()` and no cross-statement transactions.** Timestamps are app-supplied; `db.batch()` is atomic (proven by test) and is what `confirmInstance` uses.
- **Contact fields are normalized on write** (`readContact`): emails lowercased, phones `+<digits>`. Anything new that stores an email or phone must go through it.
- **Visibility rules live in one place:** `partitionInstances` decides which public section an instance is in. Don't build a second list elsewhere, or a cancelled candidate can leak.
- **Public action failures go through `reject()`** so they carry the instance id and render on the right card. A bare `fail()` is invisible to the guest.
- `wrangler`'s interactive `d1 create` / `r2 bucket create` prompts append duplicate bindings to `wrangler.jsonc` instead of filling the existing ones. Check the file afterward.

## Commands

`npm run check` · `npm test` · `npm run dev` · `npm run deploy:check` · `npm run deploy` · `npm run db:generate` · `npm run db:migrate` (local) · `npm run db:migrate:remote` · `npm run cf-types` (after editing `wrangler.jsonc`) · `npm run hash-password -- '<pw>' [iterations]`
