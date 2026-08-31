# Recipe suggestion app — Phase 1 spec

Drop this at the repo root. It's the working context for the build.

## What this is

An Android app that suggests meal ideas based on what's in the kitchen. The user
browses suggestions with a Tinder-style swipe. Spanish rioplatense, voseo,
Argentine ingredient vocabulary and recipe repertoire.

Single user, single device, no accounts, no sync. Built for real use by its author
as a home cook in Buenos Aires.

## Maintaining this file

This file is loaded into context every session, so it should stay small and hold
only what the code can't tell you.

Update it when:

- A decision is made that won't be visible from reading the code — a tradeoff, a
  rejected alternative, a "we tried X and it felt wrong"
- A decision here is reversed. Edit it in place; don't leave both versions
- A section becomes redundant because the code now holds it. Delete the content
  and point at the file instead

Don't update it for routine code changes. If the answer is in the repo, this file
should point at it, not repeat it.

**When you finish a task that changed any of the above, say so and offer the
edit.** Don't wait to be asked.

The build order is expected to shrink as steps complete (delete finished ones).
The principles, free-tier ceilings, and the don't-relitigate list stay
permanently — none of them are recoverable from reading the code.

## Principles — read these before making design calls

1. **Suggestion, not tracking.** The app helps decide what to cook. It is not an
   inventory system and it is not a nutrition tracker. Any feature that asks the
   user to maintain accuracy is suspect.
2. **Mistakes are cheap.** If the app thinks there's lettuce and there isn't, the
   user swipes left. That costs half a second. Never build machinery to prevent
   this — no confirmation prompts, no freshness tracking, no expiry dates.
3. **Tolerant matching.** A recipe is worth suggesting if most ingredients are
   present. Missing ones get flagged on the card, not used to filter it out.
   Flagging is informational (amber), never an error state.
4. **Argentine authenticity is a requirement, not polish.** Vocabulary, dish
   repertoire, and local product availability all matter. `morrón` not `pimiento`.
   `zapallito` not `calabacín`. Voseo throughout.
5. **The tone is a knowledgeable friend looking in your fridge.** Not a chef, not
   an app.

## Phase 1 scope

In:

- Kitchen item list, grouped by location, chip-based toggle UI
- Free-text quick add
- Suggestion deck — 5 cards per request, swipe left/right
- Recipe detail view
- Saved recipes
- "La cociné" button (the only analytics)
- Generated dish images, cached

Explicitly out — do not build these, do not leave hooks for them:

- User accounts, auth, backend database, sync
- Nutrition data of any kind
- Photo-based fridge capture, voice input
- Quantities, expiry dates, shopping lists

## Repo layout

npm workspaces monorepo. Everything is TypeScript.

```
/
├── CLAUDE.md
├── package.json          ← workspaces: ["apps/*", "packages/*"]
├── apps/
│   ├── mobile/           ← Expo (React Native, expo-router)
│   └── worker/           ← Cloudflare Worker (wrangler)
└── packages/
    └── shared/           ← Zod schemas, types, seed data, constants
```

**`packages/shared` is the reason this is a monorepo.** The card schema is defined
once, as Zod schemas, and imported by both the app and the Worker. The Worker uses
it to build Gemini's response schema and to validate what comes back; the app uses
the inferred types to render. Change a field and both sides fail to compile until
they agree.

npm workspaces specifically, not pnpm — Metro has known friction with pnpm's
symlink layout, and this isn't the place to spend time.

## Architecture

Three tiers. Only the middle one gets deployed.

```
Expo app (React Native, expo-router, expo-sqlite)
        │  POST /suggest
        ▼
Cloudflare Worker  ──►  R2 (image cache)
        │               Workers AI / FLUX.1 schnell
        ▼
LLM provider (structured JSON) — swappable, see below
```

The app holds all state locally and works offline except when requesting
suggestions. The Worker is stateless — every request carries its own context.

**The LLM call goes through a `CardProvider` interface**
(`apps/worker/src/providers/`), not a hardcoded Gemini call. `index.ts` only
ever calls `activeProvider.generateCards(...)` — which provider that is is a
one-line switch in `providers/index.ts`. This exists because both of the free
options hit real, unrelated platform bugs on first use (Gemini: an unresolved
Google-side billing-sync bug; Workers AI: a fresh-account `InferenceUpstreamError`)
within the same afternoon — see `plans/02-end-to-end.md` for the incident
detail. Groq is the active provider for now; `gemini` and `workers-ai` stay
registered so switching back (or picking whichever scores best on the
milestone 3 rubric) is a one-line change, not a rewrite.

### Why the Worker exists

The active provider's API key must never ship in the APK. The Worker holds it
as a secret (`wrangler secret put GROQ_KEY`, or `GEMINI_KEY` if that provider
is active — Workers AI needs no secret, it's an account binding) and is the
only thing that talks to it.

**Build the prompt inside the Worker, not the app.** The client sends structured
data only. If the client sent the prompt, anyone could hit the endpoint and use
the quota as a free general-purpose LLM. Server-side prompts also mean prompt
iteration ships without a Play Store release.

### Free tier ceilings

- Workers: 100k req/day, 10ms CPU per request. CPU time excludes waiting on
  fetch, so a proxy uses ~1–2ms. Never the bottleneck.
- Groq free tier (active provider): 14,400 req/day, 30 req/min, **8,000
  tokens/min**, no card. The token-per-minute cap is the one that actually
  bites — a 5-card suggestion response runs ~4,000–5,000 tokens, so two
  calls inside the same minute (e.g. an initial batch plus the deck's own
  prefetch-at-2-remaining) is enough to blow the budget, well before the
  request-count allowances (14,400/day, 30/min) come anywhere close. Confirmed
  repeatedly during milestone 3 harness runs and on-device testing — see
  `apps/mobile/lib/api.ts`'s retry/backoff, added specifically because this
  is a normal transient condition, not an edge case. **This is the current
  binding constraint.** If evaluating a replacement provider later, check its
  tokens/minute ceiling specifically, not just its request-count limits.
- Gemini Flash-Lite free tier: ~1,000 req/day — tighter than Groq's, would
  become binding again if switched back.
- Workers AI: 10,000 neurons/day ≈ **~170 images/day**, not the ~2,000 an
  earlier draft assumed. `@cf/black-forest-labs/flux-1-schnell` takes no
  width/height input at all — it always outputs 1024×1024 (4 tiles), and at
  4.80 neurons/tile + 9.60 neurons/step × 4 default steps, that's ~57.6
  neurons/image (verified against Cloudflare's current pricing page during
  milestone 3 step 5, not assumed). Still comfortably enough for a
  single-user prototype with per-dish caching (see Image pipeline) — this
  would only become binding if the R2 cache-check ever broke and started
  regenerating on every request. Also hosts free LLMs, see Architecture
  above.
- R2: 10GB free, no egress charges.

Everything must stay free at prototype scale. When the active provider's cap
becomes the limit, the fix is a billing flag or a provider swap — not an
architecture change.

### Abuse protection

The endpoint is public and spends metered resources. Before the APK leaves the
author's device: shared-secret header from the app, plus a per-IP cap in KV or a
Cloudflare Rate Limiting rule.

## Data model

One table. Locations are flat — no nesting, no hierarchy.

Defined in `packages/shared`, so the Worker sees the same shape:

```ts
export const Location = z.enum([
  "freezer",
  "heladera",
  "alacena",
  "condimentos",
  "cajon",
]);

export const Item = z.object({
  id: z.string(),
  name: z.string(),
  location: Location,
  active: z.boolean().default(true),
});
export type Item = z.infer<typeof Item>;
```

Property keys are English (`name`, `location`, `active`) — code identifiers are
always English in this codebase. The `Location` enum's *values* stay Spanish
(`freezer`, `heladera`, `alacena`, `condimentos`, `cajon`): that's the one place
content, not structure, since they're the user's own words for where things live
and they go to the model as-is.

Persisted with `expo-sqlite` via Drizzle — two tables, `items` and
`saved_recipes`. SQLite over AsyncStorage because saved recipes grow unbounded
and carry long step text; AsyncStorage's per-key limits would bite eventually.

`condimentos` and `cajon` collapse by default in the UI. They're "siempre tengo"
items that don't earn screen space.

There is deliberately no `volatilidad`, no `ultima_confirmacion`, no quantity.
An earlier draft had them; they were cut because principle 2 made them pointless.

### Seed data

30 items across the 5 locations — see `packages/shared/src/seed.ts`.

## API contract

`POST /suggest`. Both request and response shapes are Zod schemas in
`packages/shared/src/api.ts` (`SuggestRequest`, `Card`, `SuggestResponse`) — the
Worker derives Gemini's response schema from the same `Card` definition it
validates against, so there is exactly one source of truth for the card shape.
An example request/response pair for manual testing lives at
`plans/fixtures/example-request.json`.

JSON keys are English (structural, never shown to the user) except the location
fields (`freezer`, `heladera`, `alacena`, `condimentos`, `cajon`) — those match
the `Location` enum's values, which are deliberately Spanish. String *values*
throughout stay in whatever language they naturally are: the user's own
ingredient words, or (in the response) the model's rioplatense Spanish.

- `condimentos` is a single string, not an array. Ten separate entries push the
  model toward listing ingredients instead of thinking about dishes.
- `notes` is free-text passed through verbatim. No parsing in Phase 1 — the
  model handles messy Spanish fine.
- `exclude` carries titles already shown, so batch 2 differs from batch 1. This
  is what keeps the Worker stateless.
- `effort` is one of `"easy" | "medium" | "elaborate"` — an internal label, not
  shown to the user verbatim. The Deck's effort badge renders it through the
  same `es-AR` i18next resource bundle the rest of the UI uses (see Screens
  below), so adding a locale later means adding a translation, not touching
  the contract.
- `"v": 1` is load-bearing — it's how a future nutrition block gets added
  without breaking old clients.

Use JSON schema mode, not markdown-fence parsing — true of every provider
behind `CardProvider` (see Architecture above). Gemini's own dialect needs
extra care: its `responseSchema` is Google's own Schema proto (uppercase
`type` values — `STRING`/`OBJECT`/`ARRAY`/...), not standard JSON Schema —
`apps/worker/src/providers/gemini.ts` converts the Zod-derived JSON Schema
into that dialect rather than hand-writing a second schema that could drift
from `api.ts`.

## Prompt requirements

The system prompt lives in the Worker. It must:

- Write `title`, `description`, `steps`, and ingredient `name`s in rioplatense
  Spanish with voseo (`pelá`, `cortá`, `batí`) — the schema's field names are
  English now, so this has to be explicit in the prompt; it's no longer implied
  by Spanish JSON keys the way it was in an earlier draft of this contract
- Use Argentine ingredient names and products actually available locally
- Frame the input as _lo que probablemente tenga_ rather than a precise inventory
- Vary effort across the five cards — not five 40-minute dishes
- Flag missing ingredients via `have: false`, never silently drop a recipe
- Treat `freezer` items as needing planning ahead (affects `effort`)
- Write `imagePrompt` in **English**, describing the dish physically rather than
  naming it (see image pipeline below)

## Image pipeline

Cards without images fail the core experience. This is a required feature.

**Generate per dish, not per card.** Recipes repeat constantly.

```
key = slugify(title)           →  tortilla-de-papa-con-verdeo.jpg
R2 hit  → return URL immediately
R2 miss → FLUX.1 schnell (1024×1024, no size param — see Free tier ceilings)
        → store in R2 as JPEG → return URL
```

Card render and image generation are decoupled: `/suggest` attaches each
card's `imageUrl` (a `GET /img/<key>?prompt=<imagePrompt>` URL) synchronously
— no FLUX call, no wait. Generate-or-cache-hit happens lazily, only when the
client actually requests that URL, which is what lets the card render
immediately regardless of whether its image is cached yet.

After a few weeks of use, most suggestions hit cache and daily generation
approaches zero.

**Why `imagePrompt` must be English and descriptive:** image models are trained on
English food photography. "tortilla de papa" risks returning a Mexican flatbread.
"provoleta" and "matambre a la pizza" will likely fail outright. Describing the
physical dish sidesteps the vocabulary gap. A beautiful image of the wrong food
is worse than no image — treat this as its own axis when scoring output.

**Never block the card on the image.** FLUX takes 2–5s; card JSON arrives in ~2s.
Render the card immediately with a typographic placeholder, kick off all five
image jobs at once, swap in each image as it lands. Cards 3–5 have ample time
while the user looks at card 1.

Because images are just files in a bucket keyed by dish name, bad ones can be
replaced by hand without touching code.

## Screens

All UI copy (screen titles, buttons, badges, the amber flag line) is sourced from
an `i18next`/`react-i18next` resource bundle, not hardcoded in components — one
locale for now, `es-AR` (rioplatense Spanish), matching the voseo this app is
built around. A generic `es-419` ("Latin American Spanish") locale was
considered and rejected: it doesn't imply voseo, and this app's whole voice
(`pelá`, `cortá`) depends on it. See `apps/mobile/src/i18n`.

1. **Mi cocina** — chips grouped by location, tap to toggle active. Free-text
   quick-add at top. `Buscar ideas` CTA at bottom. Condimentos/cajón collapsed.
   Chips over checkbox rows: ~30 items fits on one screen instead of four.
2. **Deck** — one card visible, `2 de 5` counter, swipe or tap the X / heart.
   Card shows image, title, time and effort badges, one-line description, and the
   `Te falta:` line in amber if anything is missing.
3. **Detalle** — full ingredient list with check/dash per item, numbered steps,
   `Guardar` and `La cociné`.
4. **Guardadas** — saved recipes list.

### Not yet designed

- Empty state before any items exist
- Loading state during the 2–4s wait. **Design this one first** — it's the moment
  most likely to make the app feel cheap.

## Prefetching

One request returns five cards. Never make five requests. When the user has 2
cards left, quietly fetch the next batch with `exclude` populated. 1,000 free
daily requests becomes 5,000 cards.

## Build order

0. Workspace skeleton: root `package.json` with workspaces, `apps/mobile` via
   `create-expo-app`, `apps/worker` via `npm create cloudflare`, empty
   `packages/shared`. Verify both apps start and both can import from shared.
1. `packages/shared`: Item and Location schemas + seed data. Then Drizzle schema
   and the Mi cocina screen. No network. Verify the chip UI feels right with all
   30 real items on a real phone via Expo Go.
2. Worker: `POST /suggest`, key as secret, hardcoded prompt, real Gemini call,
   response schema derived from `packages/shared`. Test with curl before the app
   touches it.
3. Wire the app to the Worker. Deck screen with placeholder images. This is the
   first end-to-end moment — stop and evaluate suggestion quality here.
4. Prompt iteration against the scenario harness (below). Do not move on until
   the rubric scores well. Everything after this is polish; this is the product.
5. Image pipeline: R2 + FLUX + async swap-in.
6. Detail view, saved recipes, `La cociné`.
7. Rate limiting and shared secret, before the APK goes anywhere.

Run against Expo Go on a real device from step 1. The simulator will not tell you
whether the swipe gesture feels right.

## Testing

Three tiers, in order:

1. **Manual prompt testing** — iterate in isolation, no app involved.
2. **Scenario harness** — ~15 fixed payloads run against the Worker, output
   scored by rubric. Must include:
   - The six-cheese case (reggianito, port salut, cremoso, muzzarella, queso
     crema + one more). If the model asks for parmesano and flags reggianito as
     missing, tolerant matching is too literal.
   - A near-empty kitchen (does it degrade gracefully or hallucinate?)
   - Freezer-only (does effort correctly account for defrosting?)
   - A batch-2 request with `exclude` populated (real variety, or minor
     rewordings of the same dish?)
3. **Two weeks of real kitchen use** — the metric is `La cociné` taps, not likes.
   "Did they actually make it" is the only question that matters.

### Rubric

Score each batch of five on:

- **Feasibility** — could this actually be cooked with what's listed?
- **Variety** — five genuinely different dishes and effort levels?
- **Argentine authenticity** — vocabulary, voseo, dish repertoire
- **Personal cookability** — would the author actually make this?
- **Image fidelity** — does the generated image show the right dish?

## Decisions already made — don't relitigate

- No confirmation/freshness prompts. Cut deliberately; see principle 2.
- Locations are flat. Nesting leads to `alacena > estante 2 > caja de atrás` and
  a file-browser UI.
- `condimentos` goes to the model as prose, not an array.
- Free text is not parsed; it passes through in `notes`.
- Code identifiers and JSON keys are English throughout (`name`, `title`,
  `ingredients`, `notes`, `exclude`, ...). The only Spanish left in the wire
  contract is content: the `Location` enum's values (the user's own words for
  where things live) and whatever the model generates or the user typed. An
  earlier draft had Spanish keys everywhere (`titulo`, `ingredientes`,
  `tenes`); reversed because keys are structural and the user never sees them —
  translating them costs nothing and keeps the codebase in normal English.
- UI copy goes through `i18next`/`react-i18next`, one `es-AR` resource bundle,
  not hardcoded strings in components. `es-419` (generic Latin American
  Spanish) was considered and rejected — it doesn't imply voseo, and this app's
  voice depends on it. A second locale later is a new resource file, not a
  rewrite.
- KV response caching is for development only. In real use, the same kitchen on
  Tuesday and Wednesday should give different ideas, or the app feels dead.
- Expo over Kotlin/Compose. Chosen for shared types with the Worker, hot reload on
  device, and existing familiarity. Nothing in this app is performance-sensitive
  enough for the native argument to apply.
- npm workspaces, not pnpm. Metro and pnpm symlinks are a known time sink.
- Android first. Expo makes iOS cheap later, but don't spend any Phase 1 effort
  on it.
- The LLM call is behind a `CardProvider` interface, not hardcoded to Gemini.
  The spec originally named Gemini specifically; reversed after Gemini's free
  tier and Workers AI (the natural first alternative, already in the stack for
  images) both hit real platform bugs blocking every request on first use.
  Groq is active now, but the model/provider is expected to change again —
  the interface is the permanent decision, not any one provider.
