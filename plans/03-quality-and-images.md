# Milestone 3 — Quality and images

**Covers spec build order steps 4–5.**
**Done when:** the scenario harness scores well on all five rubric axes for
prompt/suggestion quality, and generated dish images swap into cards without ever
blocking card render.

## Why this grouping

Step 4 (prompt iteration) is a hard gate the spec insists on crossing before doing
anything else — including images. Step 5 depends on step 4 being done, since
`imagePrompt` quality depends on the same prompt that step 4 is tuning. They belong
in one file because step 5 cannot start until step 4's gate is passed.

## Step 4 — Prompt iteration against the scenario harness

### Goal
A repeatable harness of ~15 fixed kitchen scenarios run against the Worker, scored
by hand against the spec's rubric, driving prompt revisions in
`apps/worker/src/prompt.ts` until the rubric scores well across the board.

### Files to create
```
apps/worker/harness/scenarios/*.json   ← ~15 fixed request payloads
apps/worker/harness/run.ts             ← runs all scenarios, writes timestamped output
plans/rubric.md                        ← the scoring rubric, reused every run
```

### Key shapes
`apps/worker/harness/scenarios/` — each file is a valid `SuggestRequest`. Must
include, verbatim from the spec:
1. **Six-cheese case** — heladera includes reggianito, port salut, cremoso,
   muzzarella, queso crema, plus one more cheese. Tests whether tolerant matching
   is too literal (if the model asks for parmesano and flags reggianito as
   missing, that's a failure — see spec Principles #3).
2. **Near-empty kitchen** — almost nothing active. Tests graceful degradation vs.
   hallucination.
3. **Freezer-only** — only freezer items active. Tests whether `effort`
   correctly accounts for defrosting/planning ahead.
4. **Batch-2 with `exclude` populated** — same kitchen as an earlier scenario,
   `exclude` carrying titles from batch 1. Tests real variety vs. minor
   rewordings of the same dish.

Fill the remaining ~11 with realistic variations across kitchen fullness,
condimentos phrasing, and `notes` free text.

`apps/worker/harness/run.ts` — POSTs every scenario file to a target Worker URL
(local `wrangler dev` or deployed), writes each response to
`apps/worker/harness/output/<timestamp>/<scenario>.json` so consecutive runs can
be diffed side by side across prompt edits.

`plans/rubric.md` — the five axes from `CLAUDE.md` → Testing → Rubric, each scored
per batch of five cards:
- Feasibility — could this actually be cooked with what's listed?
- Variety — five genuinely different dishes and effort levels?
- Argentine authenticity — vocabulary, voseo, dish repertoire
- Personal cookability — would the author actually make this?
- Image fidelity — leave blank until step 5 produces real images

Scoring is done by the author, by hand, reading harness output — this is not
something to automate with an LLM judge; the spec's whole design bets on "does the
author's own taste say yes."

### Acceptance criteria
- [ ] 15 scenario files exist, including all 4 spec-mandated cases
- [ ] `harness/run.ts` runs the full set against a live Worker and writes
      diffable output per run
- [ ] Each of at least 2 full harness runs has been scored against the rubric
- [ ] Six-cheese case: tolerant matching does not flag reggianito/port
      salut/etc. as missing something more specific
- [ ] Near-empty kitchen: suggestions stay plausible, no hallucinated pantry
- [ ] Freezer-only: `effort` visibly reflects planning-ahead/defrost time
- [ ] Batch-2 with `exclude`: genuinely different dishes, not reworded duplicates
- [ ] Feasibility, variety, and authenticity all score well on the latest run

### Spec references
`CLAUDE.md` → Testing (all three tiers, but this step is tier 2), Rubric, Prompt
requirements, Principles #3 (tolerant matching).

### Hard gate
Do not start step 5 until every rubric axis above scores well on a recent harness
run. The spec is explicit: everything after prompt quality is polish, and this is
the product.

---

## Step 5 — Image pipeline

### Goal
Dish images are generated once per unique dish (not per card), cached in R2, and
swapped into the deck asynchronously without ever delaying card render.

### Files to create
```
apps/worker/src/images.ts       ← slugify, R2 lookup/store, FLUX call
apps/worker/wrangler.toml       ← R2 + Workers AI bindings (edit, not create)
```
App side, in `apps/mobile/src/app/deck.tsx` (edit from milestone 2): swap the
placeholder for the real image URL as each of the 5 image requests resolves.

### Key shapes
`apps/worker/src/images.ts`:
```ts
function slugify(title: string): string { /* → "tortilla-de-papa-con-verdeo" */ }

async function getOrGenerateImage(env: Env, title: string, imagePrompt: string): Promise<string> {
  const key = `${slugify(title)}.webp`;
  const cached = await env.RECIPE_IMAGES.get(key);
  if (cached) return urlFor(key);
  const image = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
    prompt: imagePrompt,   // English, physical description — see spec
    width: 512, height: 512,
  });
  await env.RECIPE_IMAGES.put(key, image);
  return urlFor(key);
}
```

Route: either `GET /img/:slug` serving from R2, or resolve and embed URLs directly
in the `/suggest` response (fire all 5 generation calls in parallel, `Promise.all`,
attach `imagen_url` to each card before responding) — since the spec says never
block the card *on the image*, but the card JSON itself already takes ~2s while
FLUX takes 2–5s, decide here whether image URLs arrive with the card response
(client polls/retries per-image) or via a separate endpoint the client hits
per-card. Either is consistent with the spec as long as the client never awaits
an image before showing the card text/badges.

`wrangler.toml` additions: R2 bucket binding (e.g. `RECIPE_IMAGES`), Workers AI
binding (`AI`).

App side: render every card immediately with a typographic placeholder (title
initial or icon on a solid background), kick off all 5 image fetches concurrently
as soon as the card batch arrives, swap each image in as it resolves — independent
per card, not blocked on card 1's image finishing before card 2 starts fetching.

### Acceptance criteria
- [ ] Same dish title requested twice never calls FLUX twice — second call is an
      R2 hit
- [ ] `imagePrompt` sent to FLUX is in English and describes the dish physically
      (spec explicitly warns literal Spanish dish names like "provoleta" will
      likely fail outright)
- [ ] Card text/badges render immediately; placeholder shows until the image
      lands; no visible wait on the image before the card is usable
- [ ] All 5 image requests for a batch are in flight concurrently, not
      sequential
- [ ] A bad image can be replaced by hand in R2 (by key) with no code change
- [ ] Verified on a real device with real network latency, not localhost

### Spec references
`CLAUDE.md` → Image pipeline (entire section), Free tier ceilings (Workers AI:
10k neurons/day ≈ 2,000 images at 512×512), Architecture diagram.

## Risks / known friction

- FLUX output quality for Argentine-specific dishes is the spec's own named risk
  ("a beautiful image of the wrong food is worse than no image"). Budget time to
  eyeball several generated images against real dishes before calling this done —
  this is what "image fidelity" in the rubric is for.
- R2 key collisions: two differently-worded titles for the same dish (e.g. minor
  rewording across prompt revisions) will generate duplicate images under
  different slugs. Not worth solving now — the spec accepts hand-replacement as
  the fix for bad images, and near-duplicate dishes are a low-cost problem at this
  scale.
