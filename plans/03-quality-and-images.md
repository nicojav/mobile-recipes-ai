# Milestone 3 — Quality and images

**Covers spec build order steps 4–5.**
**Done when:** the scenario harness scores well on all five rubric axes for
prompt/suggestion quality, and generated dish images swap into cards without ever
blocking card render.

> **Status: step 4 done — hard gate passed.** Full rubric scoring, including
> the author's own read on personal cookability ("all sounds very good
> recipes"), is recorded in `plans/rubric.md`. Step 5 (image pipeline) is
> next.
>
> Harness infrastructure exists and works: 15 scenario files under
> `apps/worker/harness/scenarios/` (including all 4 spec-mandated cases),
> `apps/worker/harness/run.ts` (`npm run harness --workspace=apps/worker`),
> `plans/rubric.md`. Two full 15/15 runs completed against `wrangler dev`,
> output at `apps/worker/harness/output/2026-08-31T21-41-18-622Z/` and
> `.../2026-08-31T21-48-38-679Z/`.
>
> `run.ts` needed a fix mid-milestone: the first attempt had no per-request
> timeout, and its `catch` block returned on any network error without
> retrying. A stalled connection against `wrangler dev` hung the entire run
> silently for ~3 hours with no further output before it was caught and
> killed. Fixed: `AbortSignal.timeout(45_000)` per request, and network
> errors now retry like rate-limit responses instead of failing immediately.
>
> Mechanical checks (not taste calls, safe to settle without the author):
> - **Six-cheese case: passes.** Across both runs, missing-ingredient flags
>   are always process items (salsa de tomate, agua, harina), never a more
>   specific cheese substituted for one already on hand.
> - **Near-empty case: passes.** Stays plausible (fideos/huevo variations),
>   never hallucinates pantry contents. Variety is inherently thin with only
>   2 real ingredients — expected, not a failure of this criterion.
> - **Voseo/authenticity: clean.** Grepped all 30 generated cards (both runs)
>   for common tuteo slips (puedes/tienes/pela/corta/etc. as verbs, not
>   nouns) — zero hits. Milestone 2's curl check had caught 2 typos
>   (sofri→sofreí, peleá→pelá); those don't reproduce here.
>
> **Batch-2/`exclude` case: found failing, fixed, re-verified.** `05` was
> patched with the real titles from `04`'s first-run output as `exclude`,
> then re-run: "Arroz con carne picada y verduras" came back as "Arroz frito
> al estilo criollo con carne picada y verduras" (a reworded duplicate) and
> "milanesa de pollo" was used as the core dish twice within one batch. Fixed
> in `apps/worker/src/prompt.ts`: replaced the literal "don't repeat a title"
> rule with two rules — don't repropose the same dish under a different
> title, and don't reuse the same core dish twice within one 5-card batch.
> Re-ran `04`+`05` only (`npx tsx harness/run.ts 04 05`, a filter added to
> `run.ts` for exactly this) — both failure modes gone on the re-run; one
> soft recurrence remained (milanesa de pollo baked both times, different
> topping/side) judged acceptable since it's a genuine Argentine staple, not
> a sign the fix failed.
>
> **Freezer-only case: passes** — author-reviewed. Effort steps
> easy→elaborate (40→70min) and every card's steps open with the actual
> defrost action ("Sacá las milanesas del freezer y dejalas descongelar 30
> min...").
>
> **Feasibility, variety, personal cookability: pass.** Read through
> representative cards together (freezer-only, time-pressure notes, guest
> notes, dessert-pivot notes); author's verdict: "all sounds very good
> recipes." Full detail in `plans/rubric.md`'s run log.

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
- [x] 15 scenario files exist, including all 4 spec-mandated cases
- [x] `harness/run.ts` runs the full set against a live Worker and writes
      diffable output per run
- [x] Each of at least 2 full harness runs has been scored against the rubric
- [x] Six-cheese case: tolerant matching does not flag reggianito/port
      salut/etc. as missing something more specific
- [x] Near-empty kitchen: suggestions stay plausible, no hallucinated pantry
- [x] Freezer-only: `effort` visibly reflects planning-ahead/defrost time
- [x] Batch-2 with `exclude`: genuinely different dishes, not reworded duplicates
- [x] Feasibility, variety, and authenticity all score well on the latest run

### Spec references
`CLAUDE.md` → Testing (all three tiers, but this step is tier 2), Rubric, Prompt
requirements, Principles #3 (tolerant matching).

### Hard gate
Do not start step 5 until every rubric axis above scores well on a recent harness
run. The spec is explicit: everything after prompt quality is polish, and this is
the product.

---

## Step 5 — Image pipeline

> **Status: built and mechanically verified against `wrangler dev`; the
> real-device check (last acceptance box) is still open.**
>
> Implementation differs from this section's original pseudocode in ways
> worth noting, since the corrections aren't visible from reading the plan
> text alone (already folded into `CLAUDE.md`'s Image pipeline / Free tier
> ceilings sections):
> - `flux-1-schnell` takes no `width`/`height` input at all (verified against
>   Cloudflare's current model docs) — it always outputs 1024×1024, and
>   returns base64-encoded **JPEG**, not WebP. R2 keys are `<slug>.jpg`, not
>   `.webp`.
> - Real neuron cost is ~57.6/image (4 tiles × 4.80 + 4 default steps ×
>   9.60), so the free tier is ~170 images/day, not the ~2,000 the original
>   512×512 assumption implied. Still far more than a single-user prototype
>   needs with per-dish caching.
> - Went with "resolve and embed URLs directly in the `/suggest` response,"
>   the option this section left open — but the URL itself is built
>   synchronously (`imageKeyFor(title)`, no FLUX call, no R2 read) so it
>   costs nothing to attach. Card JSON never waits on an image either way.
>   The Card schema gained a new `CardWithImage` type (`packages/shared/src/api.ts`)
>   layered on top of `Card` — providers still validate raw LLM output
>   against plain `Card`, since no provider produces `imageUrl`.
> - The `GET /img/:key` route takes the imagePrompt as a `?prompt=` query
>   param, needed because the route only has the slug — keeps the Worker
>   stateless (no KV/DB mapping slug→prompt) at the cost of a slightly long
>   URL. A cache hit ignores the param entirely; only a miss uses it.
>
> Mechanically verified against `wrangler dev`:
> - Same dish requested twice: first request 3.66s (real FLUX call), second
>   request 0.011s, byte-identical output — confirmed no duplicate
>   generation, including when the second request's `?prompt=` differs from
>   the first (cache is keyed by slug alone, exactly as designed).
> - 4 different dishes requested concurrently: individual completion times
>   overlapped (2.7s/3.0s/3.7s/4.4s within one wall-clock window) rather than
>   stacking serially — the Worker doesn't bottleneck concurrent generations.
> - Spot-checked 2 of the 5 generated images by eye: both genuinely matched
>   their dish (rice-with-ground-beef-and-morrón bowl; rustic tart with
>   sweet potato, caramelized onion, dollops of cream cheese) — good image
>   fidelity on the first real test.
> - `apps/mobile/src/app/deck.tsx` and `lib/api.ts` typecheck clean
>   (`npx tsc --noEmit`) against the new `CardWithImage` type.
>
> **Not yet done — needs the author on a real device:** run the app via Expo
> Go, tap `Buscar ideas`, and confirm the card renders immediately with the
> emoji placeholder and the real image cross-dissolves in within a few
> seconds per card, without ever blocking the swipe/counter. This is the
> milestone's last open acceptance box.

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
- [x] Same dish title requested twice never calls FLUX twice — second call is an
      R2 hit
- [x] `imagePrompt` sent to FLUX is in English and describes the dish physically
      (spec explicitly warns literal Spanish dish names like "provoleta" will
      likely fail outright)
- [x] Card text/badges render immediately; placeholder shows until the image
      lands; no visible wait on the image before the card is usable — true by
      construction (`/suggest` never awaits FLUX/R2), on-device feel still to
      confirm
- [x] All 5 image requests for a batch are in flight concurrently, not
      sequential — verified server-side (see status note); client fires them
      via a single `Image.prefetch(array)` call
- [x] A bad image can be replaced by hand in R2 (by key) with no code change —
      true by construction (plain keyed blob store)
- [ ] Verified on a real device with real network latency, not localhost

### Spec references
`CLAUDE.md` → Image pipeline (entire section), Free tier ceilings (corrected —
see status note above), Architecture diagram.

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
