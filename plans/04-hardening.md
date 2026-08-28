# Milestone 4 — Hardening

**Covers spec build order steps 6–7.**
**Done when:** detail view, saved recipes, and `La cociné` all work end-to-end
against SQLite, and the `/suggest` endpoint rejects requests without a valid
shared secret and is capped per IP — i.e. it's safe for the APK to leave the
device.

## Why this grouping

Step 6 finishes the last unbuilt screens; step 7 is what makes shipping those
screens in a real APK safe. Both are "make what already works production-shaped"
rather than new product surface, so they close out Phase 1 together.

## Step 6 — Detail view, saved recipes, `La cociné`

### Goal
Tapping into a card shows the full recipe with a per-ingredient have/missing
mark and numbered steps; `Guardar` persists it; `Guardadas` lists saved recipes;
`La cociné` records a single local tap — the only analytics in the app.

### Files to create
```
apps/mobile/src/app/detail/[id].tsx
apps/mobile/src/app/saved.tsx
```
(`saved_recipes` table already exists from milestone 1's `apps/mobile/db/schema.ts`.)

### Key shapes
`apps/mobile/src/app/detail/[id].tsx`:
- Full ingredient list, one row per `Ingredient`, check icon when `have: true`,
  dash/muted when `have: false` — same amber-not-error tone as the deck's
  `Te falta:` line, not a red warning
- Numbered `steps` list, rendered as given (no reformatting/parsing)
- `Guardar` button — writes the full card JSON into `saved_recipes` (id, title, card
  json, saved_at)
- `La cociné` button — writes a tap: local counter/timestamp only. No event
  payload, no remote call, nothing that resembles telemetry beyond "this
  happened locally." This is explicitly the *only* analytics in the whole app —
  don't let it grow into a broader tracking mechanism.

`apps/mobile/src/app/saved.tsx` — list view reading `saved_recipes`, each row
navigates back into `detail/[id]` using the stored card data (no re-fetch from
the Worker needed, since the full card was saved). "Guardar"/"Guardadas" are the
displayed button/screen text (via the `es-AR` i18next bundle) — the route file,
table, and variable names are English per the naming convention from milestone 1.

### Acceptance criteria
- [ ] Detail view renders full ingredients + steps for a real card from milestone 2/3
- [ ] `have: false` ingredients are visually distinct but not alarming (matches
      deck styling)
- [ ] `Guardar` persists the full card; app restart still shows it in the saved list
- [ ] `La cociné` records locally with no network call — confirm by checking
      network traffic (e.g. Flipper/dev tools) shows nothing on tap
- [ ] No quantity tracking, no expiry, no nutrition fields introduced anywhere in
      this screen — the spec explicitly excludes all three

### Spec references
`CLAUDE.md` → Screens (§3 Detalle, §4 Guardadas), Phase 1 scope (in: "La cociné"
button as the only analytics; out: quantities, expiry, nutrition), Principles #3.

---

## Step 7 — Abuse protection

### Goal
Before the APK is distributed anywhere: `/suggest` requires a shared secret only
the app knows, and is capped per IP, so the endpoint can't be used as a free
general-purpose LLM proxy by anyone who finds the URL.

### Files to create / edit
```
apps/worker/src/index.ts        ← edit: secret check, rate limit
apps/worker/wrangler.toml       ← edit: rate limiting rule, or KV binding for a manual cap
apps/mobile/lib/api.ts          ← edit: send shared-secret header
```

### Key shapes
Worker: reject any `/suggest` request missing or mismatching a header (e.g.
`X-App-Secret`) with `401` before doing any Gemini/image work — check this first,
cheaply, so a flood of bad requests never reaches the paid-per-call parts of the
pipeline.

Rate limiting: prefer a Cloudflare Rate Limiting rule bound to the route (no code,
configured at the platform level) over hand-rolled KV counters — simpler and
correctly atomic under concurrent requests. Fall back to a KV counter keyed on
`CF-Connecting-IP` with a short TTL only if the platform rule isn't available on
the free tier being used.

App: the secret is a build-time value (Expo config/env, e.g. `app.config.ts` →
`extra.appSecret` or `EXPO_PUBLIC_*`), sent as a header on every `/suggest` call.
It is not a literal string in a committed source file, though note per spec
principle 4 / the Worker's own design: this secret *will* ship inside the APK
(there's no way around that for a client-side secret) — its job is to block
casual scraping/abuse, not to be cryptographically unbreakable. The real
protection is that it's not the Gemini key itself.

### Acceptance criteria
- [ ] Request to `/suggest` without the header → 401, no Gemini/FLUX call made
- [ ] Request with a wrong secret → 401
- [ ] Request with the correct secret → normal 200 flow
- [ ] Rapid repeated requests from one IP are throttled (verify by scripting N
      requests quickly and observing a 429 or block)
- [ ] `GEMINI_KEY` does not appear anywhere in the built APK — grep the built
      bundle/binary for the literal key value as a final check
- [ ] Shared secret lives in Expo config, not hardcoded inline in a `fetch` call

### Spec references
`CLAUDE.md` → Abuse protection, "Why the Worker exists," Free tier ceilings.

## Phase 1 exit — two weeks of real use

Not a build step, but the spec's tier-3 test: after milestones 1–4 are done and
the APK is on the author's own phone, the only metric that matters for two weeks
is `La cociné` taps — not likes, not swipe-right rate. If nothing gets cooked,
that's a prompt/suggestion problem to take back to milestone 3, not a UI problem
to solve here.

## Risks / known friction

- Cloudflare's free-tier Rate Limiting rule availability can vary — confirm it's
  usable on the account before committing to it over a hand-rolled KV cap.
- A build-time secret is inherently extractable from the APK by anyone who tries;
  don't over-invest in making it stronger than the spec asks for (it's abuse
  deterrence, not real auth — there is no auth in this app by design, see
  Phase 1 scope "Explicitly out").
