# Milestone 2 — End to end

**Covers spec build order steps 2–3.**
**Done when:** pressing `Buscar ideas` on a real phone sends a real request to the
deployed (or `wrangler dev`) Worker, gets back 5 real cards, and they render
in a swipeable deck with typographic placeholders standing in for images.

> **Status: done.** Verified end to end on a real device — request, deck,
> swipe/tap, loading state, and the "stop and evaluate" rubric check all
> passed. One real bug turned up during testing (infinite loading on batch
> exhaustion), was fixed, and the fix was re-verified on device — confirmed
> by the author: "retested, works now." See the incident log below for how
> the Worker side got here.
> `apps/mobile/.env` is set to the dev machine's LAN IP;
> `apps/worker/.dev.vars` has real `GEMINI_KEY` and `GROQ_KEY` values.
>
> **The LLM call is now behind a `CardProvider` interface**
> (`apps/worker/src/providers/`), not hardcoded to Gemini — see `CLAUDE.md`'s
> Architecture section. This happened mid-milestone because both free options
> we tried hit real platform bugs on first use (below); `index.ts` only calls
> `activeProvider.generateCards(...)`, so the fix each time was a one-line
> swap in `providers/index.ts`, not a rewrite. Reworked once more into a
> Template Method: `providers/base.ts`'s `BaseCardProvider` owns the shared
> flow (error wrapping, payload-presence check, schema validation via
> `parseCardsPayload`); `gemini.ts`/`workers-ai.ts`/`groq.ts` each implement
> only `callModel()` and `extractPayload()` — the two things that actually
> differ per provider. `apps/worker/src/schema.ts` (the old flat file) no
> longer exists; the Gemini-dialect conversion lives in `providers/gemini.ts`
> and the shared `CardsPayload`/`parseCardsPayload` in `providers/schema.ts`.
> Also fixed while in here: `apps/worker/src/env.ts` hand-wrote `Env` (an
> anti-pattern per the `workers-best-practices` skill — drifts from the real
> wrangler config); deleted in favor of `wrangler types`' generated
> `worker-configuration.d.ts` (gitignored, regenerate via `npm run
> cf-typegen` in `apps/worker`), and `@cloudflare/workers-types` was dropped
> since the generated runtime types supersede it.
>
> **Incident log, in order:**
> 1. `gemini-2.5-flash-lite` (the spec's original model) 404s — Google retired
>    it for new API keys. Fixed: swapped to `gemini-3.5-flash-lite`.
> 2. Every Gemini request — original key, and a second key from a brand-new
>    Google Cloud project — then got `429 RESOURCE_EXHAUSTED: "Your
>    prepayment credits are depleted"`. Confirmed via web search this is a
>    known, unresolved Google-side outage hitting confirmed free-tier
>    projects with zero usage (Google AI Developers Forum, multiple reports
>    June–August 2026, no official fix or ETA). Not a code issue.
> 3. Switched the active provider to Workers AI (already in this project's
>    stack for images, no card, no new account). Every call — even a bare
>    "say hola" with no schema — failed with `InferenceUpstreamError: internal
>    error`. Cloudflare's status page showed no incident; web search found
>    this matches a known pattern of fresh accounts hitting this until
>    something provisions server-side, sometimes for hours, with no
>    documented fix short of Cloudflare support.
> 4. Switched the active provider to Groq (`console.groq.com`, free, no card,
>    new `GROQ_KEY` secret). `openai/gpt-oss-20b` (the smallest strict-mode
>    model) generated valid-JSON-but-wrong-shape output (hoisted `imagePrompt`
>    to a single top-level field instead of nesting it per card) and
>    separately ran out of completion tokens on reasoning overhead before
>    reaching the JSON. Fixed: `reasoning_effort: "low"`,
>    `max_completion_tokens: 4096`, and switched to `openai/gpt-oss-120b`.
> 5. **Working.** `curl` against `plans/fixtures/example-request.json`
>    returned 5 valid, schema-conformant, cookable cards — real Argentine
>    vocabulary (morrón, verdeo, harina 000), consistent voseo throughout
>    `steps` (`cortá`, `agregá`, `dejá`, `serví`), good variety across effort
>    levels (30–70 min, easy→elaborate), tolerant `have: false` flagging.
>    Two minor voseo conjugation typos noted (`sofri` → `sofreí`, `peleá` →
>    `pelá`) — a milestone 3 prompt-iteration item, not a blocker.
>
> - [x] Ran the app in Expo Go on a real device, tapped `Buscar ideas` —
>   confirmed by the author: "got some food recipes swiping in the phone."
>   The core loop (request → 5 cards → swipeable deck) works end to end on
>   device, real network, real LLM.
> - [x] Counter, swipe, and the ✕/♥ tap targets all felt right — confirmed by
>   the author.
> - [x] Loading state felt considered, not a bare spinner — confirmed by the
>   author.
> - [x] **Stop and evaluate**, against the rubric: author confirmed the
>   suggestions "looked genuinely cookable." Combined with the earlier `curl`
>   check (real Argentine vocabulary, consistent voseo, good effort variety —
>   see incident log above), feasibility/variety/authenticity/personal
>   cookability all read as passing for a first pass. Image fidelity isn't
>   testable yet (no image pipeline until milestone 3). Good enough to move
>   on — milestone 3's scenario-harness step is where this gets rigorous, not
>   a blocker to starting it.
>
> **Bug found on this device test, fixed:** reaching the last card of a batch
> (or tapping ♥/✕ on it) with no next batch prefetched yet triggers a
> re-fetch while showing the loading spinner (`status: 'waiting'` in
> `deck.tsx`) — if that re-fetch failed, the code silently did nothing,
> leaving the spinner stuck forever with no error and no way out. This is
> almost certainly the "infinite loading" the author saw. Fixed in
> `apps/mobile/src/app/deck.tsx`'s `maybePrefetch`: a failure while `waiting`
> now transitions to the existing `error` state (retry button), instead of
> only the very first batch load having error handling. Re-verified on
> device — confirmed by the author: "retested, works now."
>
> All checkboxes above are checked because each was individually verified —
> on device, or by curl against the real Worker — per `plans/README.md`'s
> rule, not just because the code exists.

## Why this grouping

Step 2 (Worker endpoint) is useless to verify in isolation beyond a curl smoke
test — the real test is the app talking to it. Step 3 (wire the app) has nothing to
wire to until step 2 exists. They're one checkpoint: first real suggestion on a
real phone.

## Step 2 — Worker `POST /suggest`

### Goal
A deployed (or locally running) Worker that accepts the spec's request shape,
builds the system prompt server-side, calls Gemini 2.5 Flash-Lite in JSON schema
mode, validates the response against the same Zod-derived schema, and returns it.

### Files to create
```
packages/shared/src/api.ts      ← SuggestRequest, SuggestResponse (Zod)
apps/worker/src/schema.ts       ← Gemini responseSchema derived from api.ts
apps/worker/src/prompt.ts       ← system prompt builder
apps/worker/src/index.ts        ← POST /suggest handler
apps/worker/.dev.vars           ← local GEMINI_KEY (gitignored)
```

### Key shapes
`packages/shared/src/api.ts` — copy the shapes from `CLAUDE.md` → API contract
exactly:

```ts
export const SuggestRequest = z.object({
  v: z.literal(1),
  freezer: z.array(z.string()),
  heladera: z.array(z.string()),
  alacena: z.array(z.string()),
  cajon: z.array(z.string()),
  condimentos: z.string(),        // prose, NOT an array — deliberate, see Decisions
  notes: z.string().optional(),
  exclude: z.array(z.string()).optional(),
});

const Ingredient = z.object({
  name: z.string(),
  quantity: z.string(),
  have: z.boolean(),
});

const Card = z.object({
  title: z.string(),
  description: z.string(),
  minutes: z.number(),
  effort: z.enum(["easy", "medium", "elaborate"]),  // confirm exact values against real output
  servings: z.number(),
  ingredients: z.array(Ingredient),
  steps: z.array(z.string()),
  imagePrompt: z.string(),
});

export const SuggestResponse = z.object({
  v: z.literal(1),
  cards: z.array(Card).length(5),
});
```

Keys are English — only `freezer`/`heladera`/`alacena`/`condimentos`/`cajon`
(matching `Location`'s values) and the actual string content (dish names,
descriptions, steps, ingredient names) are Spanish. See `CLAUDE.md` → Decisions
already made.

`apps/worker/src/schema.ts` — derive Gemini's `responseSchema` from `Card`/
`SuggestResponse` (e.g. `zod-to-json-schema`, or hand-write if the library's output
doesn't match Gemini's schema dialect). One source of truth for the card shape —
don't hand-write a second schema that can drift from `api.ts`.

`apps/worker/src/prompt.ts` — the system prompt must, per spec:
- Explicitly instruct rioplatense voseo (`pelá`, `cortá`, `batí`) for `title`,
  `description`, `steps`, and ingredient `name`s — the schema's field names are
  English now, so language is no longer implied by the JSON keys and has to be
  said outright
- Use Argentine ingredient names / locally available products
- Frame input as *lo que probablemente tenga*, not a precise inventory
- Vary effort across the 5 cards
- Flag missing ingredients via `have: false`, never drop a recipe silently
- Treat `freezer` contents as needing planning ahead (raises `effort`)
- Instruct the model to write `imagePrompt` in **English**, describing the dish
  physically (not naming it) — see milestone 3 for why

`apps/worker/src/index.ts` — validate `SuggestRequest` on the way in (400 on
failure), call Gemini with the derived response schema, validate
`SuggestResponse` on the way out, return JSON. No markdown-fence stripping — JSON
schema mode shouldn't need it, and if it does, that's a signal something's
misconfigured, not something to work around with a regex.

### Commands
```
cd apps/worker
wrangler secret put GEMINI_KEY     # or set in .dev.vars for local dev
wrangler dev
curl -s localhost:8787/suggest -X POST -H 'content-type: application/json' \
  -d @../../plans/fixtures/example-request.json | jq .
```
(Create `plans/fixtures/example-request.json` from the spec's request example if
useful for repeated curl testing.)

### Acceptance criteria
- [x] `SuggestRequest`/`SuggestResponse` in `packages/shared` match the spec's
      contract field-for-field, including `condimentos` as a string not an array
- [x] LLM call uses JSON schema mode; response is validated, not regex-parsed —
      true of every provider behind `CardProvider` (Gemini, Workers AI, Groq)
- [x] `curl` against `wrangler dev` with the spec's example payload returns 5
      valid cards — confirmed against the real Groq API
- [x] Each provider's API key is only ever read from a Wrangler secret /
      `.dev.vars` (`GEMINI_KEY`, `GROQ_KEY`), never a literal in source; Workers
      AI needs no key at all (account binding)
- [x] `.dev.vars` is gitignored

### Spec references
`CLAUDE.md` → Architecture, "Why the Worker exists," Data model / API contract,
Prompt requirements, Decisions already made (`condimentos` as prose, KV caching is
dev-only — don't build response caching into this step at all, or if you do, gate
it behind an env flag that defaults off).

---

## Step 3 — Wire the app to the Worker, deck screen

### Goal
`Buscar ideas` builds a request from the app's local item state, posts it to the
Worker, and renders the 5 returned cards as a swipeable deck with a loading state,
placeholder art, and prefetch of the next batch.

### Files to create
```
apps/mobile/lib/api.ts          ← request builder + fetch
apps/mobile/src/app/deck.tsx        ← deck screen
```

### Key shapes
`apps/mobile/lib/api.ts` — reads active items from SQLite, groups by location into
arrays, composes the `condimentos` group into a single prose string (not "join with
commas" necessarily — match the tone of the spec's own example: *"los habituales
(ají molido, comino, pimentón, orégano) + harinas 000, 0000 y leudante"*), passes
the Mi cocina notes box through verbatim as `notes`, and populates `exclude` with
titles already shown this session.

`apps/mobile/src/app/deck.tsx`:
- One card visible at a time, `N de 5` counter
- Swipe left/right (`react-native-gesture-handler` + `reanimated`) plus explicit
  X / heart tap targets — swipe is not the only way to act on a card
- Card shows: placeholder image, title, time + effort badges, one-line
  description, amber `Te falta:` line listing any `have: false` ingredients
  (informational styling, not an error state — per spec principle #3). The
  effort badge renders `t(\`effort.${card.effort}\`)` through the `es-AR` i18next
  bundle (add an `effort.easy`/`effort.medium`/`effort.elaborate` resource) —
  never the raw English enum value
- Loading state while the 2–4s request is in flight. The spec flags this as the
  single most likely place the app feels cheap and says design it first — don't
  ship a bare spinner without giving it real thought (motion, a line of copy in
  voseo, something that feels considered)
- Prefetch: once 2 cards remain in the current batch, silently fetch the next
  batch with `exclude` populated with all titles shown so far — never issue more
  than one request per 5-card batch need

### Acceptance criteria
- [x] Real request built from actual toggled-on items, not seed/mock data —
      `apps/mobile/lib/api.ts` reads active items from SQLite
- [x] `condimentos` sent as one string, matching the spec's prose style
- [x] Deck renders 5 cards, swipe and tap both work, counter is accurate —
      confirmed on device
- [x] `Te falta:` line appears only when needed, styled amber, never blocks the
      swipe — confirmed on device
- [x] Effort badge shows the translated `es-AR` label, not the raw
      `easy`/`medium`/`elaborate` enum value
- [x] Loading state has been deliberately designed, not a default spinner —
      confirmed on device ("loading animation felt good")
- [x] Prefetch fires at 2-remaining and the next batch excludes prior titles —
      confirmed on device (batch exhaustion → next batch, after the
      infinite-loading fix above)
- [x] Verified on a real device against a real (not mocked) Worker response

### Spec references
`CLAUDE.md` → Screens (§2 Deck), Prefetching, "Not yet designed" (loading state),
API contract.

## Stop and evaluate

This is the first end-to-end moment in the whole build. Before touching milestone
3: run several real kitchen states through the deck and judge suggestion quality
against the spec's rubric (feasibility, variety, Argentine authenticity, personal
cookability — image fidelity isn't testable yet). If it's off, that's a prompt
problem to take back into step 2's `prompt.ts`, not something to patch around in
the app.

## Risks / known friction

- Gemini JSON schema mode output shape may not match the Zod schema exactly on
  first try (enum casing, optional vs. required fields) — expect a short
  iteration loop between `schema.ts` and real responses before validation passes
  cleanly.
- Swipe gesture feel is explicitly called out in the spec as something the
  simulator can't tell you — budget real-device time for this, not just for the
  initial chip UI.
