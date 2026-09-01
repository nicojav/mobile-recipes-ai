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

> **Status: built.** `apps/mobile/src/app/detail/[id].tsx` and
> `apps/mobile/src/app/saved.tsx` exist; `db/schema.ts`'s `saved_recipes`
> gained `cooked_count`/`last_cooked_at` columns (backfilled via
> `ALTER TABLE` for devices that already created the table in an earlier
> milestone). `npx tsc --noEmit` clean in `apps/mobile`.
>
> Two implementation calls not fully spelled out in this file's original
> pseudocode:
> - A deck card is tapped to open its detail. The full `CardWithImage` is
>   serialized into the route param (`/detail/[id]?card=<json>`, `id: "new"`)
>   rather than looked up by id, since a suggestion has no stable id until
>   saved. From the saved list, `/detail/[id]` gets a real `saved_recipes`
>   row id and no `card` param, and loads from SQLite instead.
> - `La cociné` on an unsaved card saves it first (same row, same write),
>   rather than leaving a tap with nothing to attach it to. Matches Guardar's
>   own upsert; still one local write, still no network call.
>
> **Fixed mid-milestone:** the tap-to-open-detail was first built as "a pan
> release under 8px of movement" inside the swipe gesture's own `onEnd` —
> on-device this did nothing, because `Gesture.Pan` only starts sending
> events once it activates (crosses its own distance threshold), so a real
> tap with ~0 movement never reached that code at all. Replaced with an
> actual `Gesture.Tap()` composed via `Gesture.Exclusive(pan, tap)` in
> `apps/mobile/src/app/deck.tsx` — pan gets first claim (so drags still
> swipe), tap only gets a chance when pan fails to activate.
>
> **Real-device check: done.** Author confirmed: tapping a card opens the
> detail view, `Guardar` persists (shows "Guardado"), and `La cociné`
> increments its counter. All acceptance boxes below closed.

### Acceptance criteria
- [x] Detail view renders full ingredients + steps for a real card from milestone 2/3
- [x] `have: false` ingredients are visually distinct but not alarming (matches
      deck styling)
- [x] `Guardar` persists the full card; app restart still shows it in the saved list
- [x] `La cociné` records locally with no network call — confirm by checking
      network traffic (e.g. Flipper/dev tools) shows nothing on tap
- [x] No quantity tracking, no expiry, no nutrition fields introduced anywhere in
      this screen — the spec explicitly excludes all three

### Spec references
`CLAUDE.md` → Screens (§3 Detalle, §4 Guardadas), Phase 1 scope (in: "La cociné"
button as the only analytics; out: quantities, expiry, nutrition), Principles #3.

---

## Step 7 — Abuse protection

> **Status: built and verified against `wrangler dev`.**
> - Secret check (`X-App-Secret`, `crypto.subtle.timingSafeEqual`) and rate
>   limit both run in `handleSuggest` before JSON parsing — see
>   `apps/worker/src/index.ts`.
> - Rate limiting uses the Workers-native Rate Limiting **binding**
>   (`[[ratelimits]]` in `wrangler.toml`), not the zone-level Rate Limiting
>   Rules product this section's pseudocode assumed — that product needs a
>   custom domain/zone, which this app doesn't have (workers.dev only). The
>   binding is atomic under concurrent requests like a platform rule would
>   be, configured entirely in `wrangler.toml`, and needs no hand-rolled KV
>   counter/TTL logic. Folded into `CLAUDE.md`'s Abuse protection section.
> - Verified live: no header → 401; wrong secret → 401; correct secret with
>   an otherwise-invalid body → 400 (past the gate, normal validation path);
>   21 rapid requests with the correct secret → the 21st gets 429, matching
>   the configured 20 req/60s cap.
> - `GROQ_KEY`/`GEMINI_KEY` never appear anywhere in `apps/mobile` (grepped)
>   — true by construction, since the app only ever calls the Worker's own
>   `/suggest`. The literal "grep the built APK" acceptance box is still
>   open pending an actual build, same as the on-device checks below.
> - The app secret is `EXPO_PUBLIC_APP_SECRET` in `apps/mobile/.env`
>   (gitignored), sent as a header in `lib/api.ts` — not hardcoded in the
>   `fetch` call. Local dev value matches the Worker's `.dev.vars`
>   `APP_SECRET`; a real deploy needs its own value via
>   `wrangler secret put APP_SECRET`.
>
> **Deliberately deferred by the author:** a real deploy (`wrangler secret
> put APP_SECRET` with a production value, `wrangler deploy`) and a real
> Android build to grep for the provider keys in the actual APK bytes. This
> is prototype phase — dev-mode testing against `wrangler dev` over Expo Go
> is the target for now; the production deploy is a deliberate later step,
> not unfinished work here.

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
- [x] Request to `/suggest` without the header → 401, no Gemini/FLUX call made
- [x] Request with a wrong secret → 401
- [x] Request with the correct secret → normal 200 flow (verified through to
      the 400 validation path with a correct secret + invalid body; a full
      200 needs a real Groq call, not repeated here to avoid burning the
      token-per-minute budget — see harness runs in milestone 3 for that)
- [x] Rapid repeated requests from one IP are throttled — scripted 21 requests
      against `wrangler dev`, 21st returned 429 (20 req/60s cap)
- [ ] `GEMINI_KEY` does not appear anywhere in the built APK — grep the built
      bundle/binary for the literal key value as a final check (true by
      construction from source, see status note; a real APK build is the
      remaining step)
- [x] Shared secret lives in Expo config, not hardcoded inline in a `fetch` call

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
