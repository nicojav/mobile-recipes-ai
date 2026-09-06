# Recipe suggestion app — Phase 1 spec

Drop this at the repo root. It's the working context for the build.

## What this is

An Android app that suggests meal ideas based on what's in the kitchen. The user
browses suggestions by swiping through a card deck, book-style (back/next, not
Tinder-style decide-and-discard — see Screens below). Spanish rioplatense,
voseo, Argentine ingredient vocabulary and recipe repertoire.

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
   user just moves to the next card. That costs half a second. Never build
   machinery to prevent this — no confirmation prompts, no freshness tracking,
   no expiry dates.
3. **Tolerant matching.** A recipe is worth suggesting if most ingredients are
   present. Missing ones get flagged on the card, not used to filter it out.
   Flagging is informational (amber), never an error state.
4. **Argentine authenticity is a requirement, not polish.** Vocabulary, dish
   repertoire, and local product availability all matter. `morrón` not `pimiento`.
   `zapallito` not `calabacín`. Voseo throughout. The one deliberate, opt-in
   exception is Deck's post-batch cuisine interstitial (see Screens below) —
   the user actively asks for a different country's cuisine for one batch;
   it doesn't change the app's default Argentine repertoire.
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
- Nutrition data of any kind, beyond the single per-serving calorie estimate
  on each card (added post-Phase-1, see "Decisions already made") — no
  macros, no daily targets, no tracking over time
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
  Also: no streaming with structured outputs (Groq's Structured Outputs docs
  say so explicitly). If evaluating a replacement provider, check this
  alongside the tokens/minute ceiling — it's what forces the two-call first
  batch described under Prefetching below.
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
author's device: shared-secret header from the app (`X-App-Secret`, compared
timing-safe, checked before any JSON parsing or provider/image work), plus a
per-IP cap on `/suggest`.

The per-IP cap uses the Workers-native Rate Limiting **binding**
(`[[ratelimits]]` in `wrangler.toml`, `env.SUGGEST_RATE_LIMITER.limit(...)`)
— 20 req/60s per `CF-Connecting-IP`. Not the zone-level Rate Limiting Rules
WAF product the spec originally named: that needs a custom domain/zone, which
this app doesn't have (it deploys to workers.dev). Not hand-rolled KV either
— the binding is already atomic under concurrent requests, so there's nothing
a KV counter would add. Same tradeoff logic as the `CardProvider` interface:
picked the option that actually works on this deployment's free tier.

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
- Estimate `calories` **per serving** (consistent with `servings`), not for the
  whole recipe — ambiguous otherwise, and models will guess. A rough
  home-cooking estimate, not nutrition data (see principle 1)
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

Visual system — color tokens, type scale, icon set, and the Mi cocina bento
layout — is `Design.md` at the repo root. Chosen from a canvas exploration
(2026-09-03): sage/off-white "Mercado" style, Sora + Work Sans, a location-card
bento grid with a bottom sheet replacing the old accordion groups. Read it
before touching any screen's styling.

1. **Mi cocina** — bento grid, one card per location, tap to toggle active
   chips inside via a bottom sheet. Free-text quick-add at top. Floating
   `Buscar ideas` CTA. Chips over checkbox rows: ~30 items fits on one screen
   instead of four. See `Design.md` for the card/sheet/CTA spec — this
   replaced an earlier stacked-accordion-groups layout.
2. **Deck** — one card visible, `2 de 5` counter, swipe or tap ‹ / › to move
   back and forth through the batch. Book-style navigation, not Tinder-style
   decide-and-discard: cards already shown stay in place, so going back and
   forward again shows the exact same cards, no re-fetch. There's no
   like/discard concept here and nothing is saved by swiping — only
   `Guardar` on the Detail screen (below) persists a recipe. Swipe **left**
   for **next**, swipe **right** for **back** — the horizontal-pager
   convention (Photos, Instagram stories, most carousels: drag left reveals
   what's next), not the literal "swipe left to go back like a book" of an
   earlier draft, which turned out backwards from what felt natural once
   tried on-device. The ‹ / › buttons aren't swipes, so they just match
   their own arrow: ‹ exits left (back), › exits right (next). (An even
   earlier draft had this as swipe left/right = discard/like, both
   advancing forward with a stamp animation; reversed once it became clear
   neither direction actually did anything different — both just advanced —
   so the stamps were decorative, and the real want was to revisit a card.)
   Card shows image, title, time and effort badges, one-line description, and the
   `Te falta:` line in amber if anything is missing.

   When a 5-card batch runs out, Deck stops at a **cuisine interstitial**
   (`CuisineInterstitial`, `apps/mobile/src/components/cuisine-interstitial.tsx`)
   before loading the next one: a slot-machine "roulette" reel defaulting to
   `🇦🇷 Argentina`, a primary `Girar` button that spins through a fixed
   country pool and — once landed — turns into `Sí, dale con {país}`, and an
   equally-weighted secondary button, `Seguí en Argentina`, always visible
   (not a text link — an earlier pass had it as one and it read as an
   afterthought). Picking a country discards any same-cuisine batch that was
   silently prefetched and fetches fresh with the country stuffed into the
   existing free-text `notes` field — no API/schema change, since `notes` is
   already passed through verbatim. See principle 4 above: this is the one
   deliberate exception to the Argentine-only repertoire, and it's opt-in
   per batch, not a standing preference.
3. **Detalle** — full ingredient list with check/dash per item, numbered steps,
   `Guardar` and `La cociné`.
4. **Guardadas** — saved recipes list.

### Not yet designed

- Empty state before any items exist
- Loading state during the 2–4s wait. **Design this one first** — it's the moment
  most likely to make the app feel cheap.

## Prefetching

Prefetch-ahead batches are one request for five cards, never five requests.
When the user has 2 cards left, quietly fetch the next batch with `exclude`
populated. 1,000 free daily requests becomes 5,000 cards.

**The first batch of a session is the one exception**: it's split into two
calls (2 cards, then 3), so the deck can render as soon as the first two
exist instead of waiting on all five. This exists only because Groq can't
stream structured output — see the entry under "Decisions already made" for
why, and for when to undo it.

## Build order

Phase 1 (workspace skeleton through rate limiting) is complete — see
`plans/README.md` for the milestone table and `plans/0*.md` for what each step
built and verified. Any future work should keep running against Expo Go on a
real device, not just the simulator — the simulator won't tell you whether the
swipe gesture feels right.

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
- The first suggestion batch is split into two calls (2 cards, then 3)
  instead of streaming one call. **This is a workaround for a Groq
  limitation, not the design we'd choose.** Groq does not support
  `stream: true` together with `response_format: json_schema` — "Streaming
  and tool use are not currently supported with Structured Outputs" — and
  dropping to `json_object` mode to get streaming would lose constrained
  decoding, which `providers/groq.ts` already records as necessary for this
  schema to survive (a weaker model garbled it even with strict mode on).
  **If the active provider changes, check whether it streams structured
  output. If it does, delete the split and stream one call instead** — that
  puts the first card up sooner, costs ~9% fewer tokens, and restores the
  single "dame 5 recetas variadas" prompt that keeps effort variety coherent
  across the batch. The client is not a blocker: `expo/fetch` already
  supports streaming response bodies (`response.body` is a real
  `ReadableStream`).
- Cards carry one calorie number: an estimate **per serving**, not per
  recipe — this is the anticipated use of `"v": 1` (see API contract), not a
  scope violation of "no nutrition data." Shown as a gradient chip
  (`CalorieBadge`) alongside the time/effort badges on Deck, Detalle, and
  Guardadas, ramped continuously (not discrete tiers) across a fixed
  `CalorieRange` (`apps/mobile/src/constants/theme.ts`). The ramp
  (`CalorieRamp`, sage → ochre → terracotta) is deliberately **not** a
  green→red warning scale — it reads as light → hearty, not good → bad,
  which would break principle 5's "knowledgeable friend" tone and edge
  toward the nutrition-tracker product this app explicitly isn't (principle
  1). Don't extend it toward red/`danger` later without revisiting that
  call. It's also the app's first and only gradient (`expo-linear-gradient`)
  — see `Design.md`'s Components section for why that's a bounded exception,
  not precedent for more of them. Saved recipes written before this field
  existed have no `calories` in their stored JSON; the read path types that
  as `StoredCard` (`packages/shared/src/api.ts`) rather than assuming the
  field is always present, and `CalorieBadge` renders nothing when it's
  absent.
