# Milestone 2 — End to end

**Covers spec build order steps 2–3.**
**Done when:** pressing `Buscar ideas` on a real phone sends a real request to the
deployed (or `wrangler dev`) Worker, gets back 5 real Gemini cards, and they render
in a swipeable deck with typographic placeholders standing in for images.

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
- [ ] `SuggestRequest`/`SuggestResponse` in `packages/shared` match the spec's
      contract field-for-field, including `condimentos` as a string not an array
- [ ] Gemini call uses JSON schema mode; response is validated, not regex-parsed
- [ ] `curl` against `wrangler dev` with the spec's example payload returns 5
      valid cards
- [ ] `GEMINI_KEY` is only ever read from a Wrangler secret / `.dev.vars`, never a
      literal in source
- [ ] `.dev.vars` is gitignored

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
- [ ] Real request built from actual toggled-on items, not seed/mock data
- [ ] `condimentos` sent as one string, matching the spec's prose style
- [ ] Deck renders 5 cards, swipe and tap both work, counter is accurate
- [ ] `Te falta:` line appears only when needed, styled amber, never blocks the
      swipe
- [ ] Effort badge shows the translated `es-AR` label, not the raw
      `easy`/`medium`/`elaborate` enum value
- [ ] Loading state has been deliberately designed, not a default spinner
- [ ] Prefetch fires at 2-remaining and the next batch excludes prior titles
- [ ] Verified on a real device against a real (not mocked) Worker response

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
