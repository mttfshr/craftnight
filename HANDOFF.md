Working on: Phases 14-17 are DONE and the app is deploy-ready pending YOUR steps below. Only Phase 18 (deploy) remains, plus two open product questions.
Status: `npm run check` clean (0 errors), `npm test` green (283 tests, 12 files), production build bundles cleanly, and `npm run deploy:check` currently refuses to deploy for exactly one reason (see below).

## Where things stand

The app runs entirely on Cloudflare: Workers + D1 (SQLite) + R2 binding + Turnstile. No Docker, Postgres, or server. Descriptions are markdown in a textarea, rendered server-side with micromark. Decisions are in `plan.md`: ADR-005 (date polls, with a Phase 14 amendments block), ADR-006 (Cloudflare), ADR-007 (markdown), ADR-008 (tests run in Node against real in-memory D1), ADR-009 (calendar times as UTC).

## Do this next — Phase 18, deploy (needs Matt)

`npm run deploy:check` runs the preflight on its own. Today it says one thing: **the Turnstile site key in `wrangler.jsonc` is Cloudflare's dummy key.** Status of the steps:

- [x] **Remote database migrated** (2026-09-27): all 4 tables, 9 indexes, the CHECK constraints, empty, nothing pending.
- [ ] **0. Register your `workers.dev` subdomain yourself, in the dashboard** (Workers & Pages overview; the account has none yet). It is account-wide and public: every Worker's URL becomes `craftnight.<subdomain>.workers.dev`, so choose a name you're happy to have visible (lowercase letters, digits and hyphens, unique across all of Cloudflare). It can be changed later, but the old URLs then stop working. **Do not let wrangler do this for you:** in `wrangler deploy`, when it detects an AI agent and the account has no subdomain, it registers one automatically, named after the project folder, without asking (`autoRegisterWorkersDevSubdomain`, wrangler 4.142.0). A human at a terminal is asked; an agent is not. An agent session must not run `deploy` until this step is done.
- [ ] **1. Create a real Turnstile widget** (Cloudflare dashboard, Turnstile, Add widget; mode Managed). Its hostname is `craftnight.<your-subdomain>.workers.dev` (from step 0). Hostnames can be edited later, so add the custom domain when you have one. Put the widget's **site key** in `wrangler.jsonc` `vars.PUBLIC_TURNSTILE_SITE_KEY` (it is public; safe to paste anywhere). Keep the **secret key** for step 2.
- [ ] **2. Set the three production secrets.** The Worker doesn't exist yet; the first `wrangler secret put` asks whether to create it (say yes). None of these values needs to be displayed or pasted anywhere:
  - `openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET` (random; nobody ever needs to see it; rotating it logs everyone out)
  - `npx wrangler secret put CLOUDFLARE_TURNSTILE_SECRET` (paste the widget's secret at the hidden prompt; must belong to the SAME widget as the site key)
  - `read -s "PW?Password: "; echo; printf %s "$PW" | node scripts/hash-password.mjs --raw | npx wrangler secret put ORGANIZER_PASSWORD_HASH; unset PW` (your organizer password, typed at a hidden prompt; never in shell history, the hash never displayed). Use `node`, not `npm run`: npm's banner would end up inside the secret.
- [ ] **3.** `npm run deploy:check`, then `npm run deploy` (runs the preflight, builds, deploys; refuses if anything above is missing). Step 0 must be done first, so the deploy never has to register a subdomain.
- [ ] **4. Real-world check (T122):** log in, create an event, publish an instance, send the link, RSVP from a phone that has never seen the site.

**Login CPU on the Workers FREE plan.** PBKDF2 costs ~6-7 ms per login in workerd, against a ~10 ms free-plan CPU limit. If login fails in production with "Worker exceeded CPU time limit": re-run the password one-liner above with `--iterations 50000` added to the `node scripts/hash-password.mjs` command. No code change or redeploy; the count lives inside the hash. Not an issue on the Paid plan.

**No login rate limiting exists.** Nothing slows repeated password guesses except the hash cost. Use a long random password, and consider a Cloudflare WAF rate-limiting rule on `/organizer/login` or Turnstile on the login form. Not built.

## Open questions for Matt (not built)

None outstanding. Answered: cancelling a single date is built (any non-cancelled date, final, RSVPs kept: FR-065), and Safari has not shown the `Secure`-cookie login problem, so the cookie is unchanged. Still unbuilt and worth knowing about: a *past* confirmed date can also be cancelled (erasing it from the public Past section); a calendar file a guest already downloaded can't be recalled after a cancel; and there is no login rate limiting (see above).

## Not yet verified in a browser

Logic is tested and the served HTML has been checked with curl, but nobody has clicked through:
- Organizer login and creating an event through the real forms (needs a password hash in `.dev.vars`)
- The "Confirm this date", "Cancel" and "Cancel this date" buttons and their `confirm()` dialogs (curl can't run JavaScript, so the dialog text and the button layout are unseen); the layout of the Proposed table
- Guest error messages appearing IN PLACE when JavaScript is on (reasoned from how `use:enhance` works; only the no-JS path was tested)
- The "Text the group" list and Copy button on the instance dashboard
- The description textarea with JavaScript disabled

## Hard-won gotchas

- **Layout `load` does not run before form actions.** The organizer auth guard lives in `hooks.server.ts` (FR-060). An unauthenticated POST to `/organizer/events/new` once inserted a row.
- **`wrangler deploy` auto-registers a workers.dev subdomain, named after the project folder and without asking, when it detects an AI agent** and the account has none (wrangler 4.142.0, `autoRegisterWorkersDevSubdomain`). The account-wide public name should be the owner's choice, so register it by hand first. `wrangler deploy --dry-run` is unaffected; it returns before any registration.
- **Never pipe `npm run ...` into `wrangler secret put`.** npm prints a `> craftnight@0.0.1 ...` banner to stdout, which would become part of the secret (and `wrangler` only trims trailing whitespace). Call `node scripts/hash-password.mjs --raw` directly; `npm run -s` also works but is easy to forget.
- **A form action POST needs a form `Content-Type`, even with no fields.** An empty-bodied curl POST gets `415 Unsupported Media Type` and does nothing; send `--data ''`. A browser always sends the header, so this only bites test scripts. Combined with the `Accept` gotcha below, a script that gets `415` or a JSON `200` is usually the script's fault, not the app's.
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

`npm run check` · `npm test` · `npm run dev` · `npm run deploy:check` · `npm run deploy` · `npm run db:generate` · `npm run db:migrate` (local) · `npm run db:migrate:remote` · `npm run cf-types` (after editing `wrangler.jsonc`) · `npm run hash-password -- '<pw>' [iterations]` (human-readable) or `node scripts/hash-password.mjs --raw` (pipe-safe)
