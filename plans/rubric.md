# Scenario harness — scoring rubric

Reused every harness run (`npm run harness --workspace=apps/worker`). Scoring is
done by the author, by hand, reading `apps/worker/harness/output/<timestamp>/`.
Not an LLM-judge task — the spec's whole design bets on "does the author's own
taste say yes." See `CLAUDE.md` → Testing → Rubric, and
`plans/03-quality-and-images.md` for the hard gate this feeds.

## The five axes

Score each batch of five cards (add a note per axis, not just a number — the
note is what actually drives the next prompt edit):

- **Feasibility** — could this actually be cooked with what's listed?
- **Variety** — five genuinely different dishes and effort levels, not five
  40-minute variations on the same idea?
- **Argentine authenticity** — vocabulary (`morrón` not `pimiento`, `zapallito`
  not `calabacín`), voseo throughout (`pelá`, `cortá`, `batí`), dish repertoire
  that's actually eaten in Buenos Aires.
- **Personal cookability** — would the author actually make this, this week?
- **Image fidelity** — leave blank until milestone 3 step 5 produces real
  images (`imagePrompt` can still be spot-checked for being English and
  physical-description-style before then).

## What each scenario is testing

| Scenario | Targets |
|---|---|
| `01-six-cheese` | Tolerant matching isn't literal — reggianito/port salut/etc. shouldn't get flagged as missing a more specific cheese (Principle #3) |
| `02-near-empty` | Graceful degradation vs. hallucinating pantry contents |
| `03-freezer-only` | `effort` reflects defrost/planning-ahead time |
| `04-batch1-weeknight` | Baseline — pairs with `05` |
| `05-batch2-weeknight-exclude` | Same kitchen as `04`, `exclude` populated with `04`'s real titles — genuine variety vs. reworded duplicates |
| `06-full-pantry` | Does abundance produce real variety or just more of the same shape? |
| `07-condimentos-terse` | Minimal condimentos phrasing still produces cookable ideas |
| `08-condimentos-verbose` | A long condimentos prose string doesn't push the model toward listing spices instead of dishes |
| `09-notes-apurado` | `notes` signaling time pressure visibly shifts effort/minutes down |
| `10-notes-invitados` | `notes` signaling guests visibly shifts toward more elaborate cards |
| `11-notes-antojo-dulce` | Free-text steering toward a whole different meal category (dessert) |
| `12-vegetarian-leaning` | No active meat — does it force meat in anyway, or work with what's there? |
| `13-mostly-condimentos` | Bare fridge, full spice drawer — degrade gracefully, don't hallucinate protein |
| `14-weekend-elaborate` | `notes` signaling free time shifts effort up without being asked to |
| `15-typical-tuesday` | Ordinary case with one loose `notes` ingredient (champiñones) — does it get used? |

## Run log

Copy this block per run, newest on top.

### Run: 2026-08-31T21-59-05-473Z (04+05 only — post-fix verification)

- Feasibility: pass — see full run below, unaffected by this change.
- Variety: pass — the fix worked. Batch-2 no longer reworded a batch-1 dish
  verbatim ("arroz con carne picada y verduras" did not come back as a
  same-dish reword) and no longer double-used one dish within a single
  batch. One soft recurrence remained (milanesa de pollo baked both times,
  different topping/side) — judged acceptable since milanesa is a genuine
  Argentine staple, not a sign the fix failed.
- Argentine authenticity: pass — same prompt as the full runs, voseo/vocab
  unaffected.
- Personal cookability: pass — author confirmed ("all sounds very good
  recipes"), covering this batch and the two full runs below.
- Image fidelity: blank until step 5.
- Batch-2/exclude case: **pass** (was fail before the `prompt.ts` fix below).
- Notes / prompt changes made after this run: none further — fix held.

### Run: 2026-08-31T21-48-38-679Z (full 15/15) and 2026-08-31T21-41-18-622Z (full 15/15)

Scored together — same prompt, same seed-derived scenarios, no material
difference found between the two beyond normal per-call variance.

- Feasibility: pass. Every scenario read as genuinely cookable with ordinary
  technique/timing. Freezer-only writes the thaw step into the method itself
  ("Sacá las milanesas del freezer y dejalas descongelar 30 min...",
  "Descongelá la carne picada en el microondas 3-4 min...") rather than just
  flagging it.
- Variety: pass. E.g. `03-freezer-only` alone spans baked cutlet, quick
  sauté, baked pastry, soup, and pasta sauce from 4 ingredients;
  `11-notes-antojo-dulce` is five distinct dessert techniques (griddle, oven,
  no-cook blender, crepe, microwave), not five variations on one dessert.
- Argentine authenticity: pass. Vocabulary correct (morrón, verdeo, harina
  000/0000, reggianito, chimichurri), voseo clean across all 30 cards
  (mechanically verified, zero tuteo slips), repertoire is real home cooking
  (milanesa, tortilla de papas, empanadas, bizcochuelo "para acompañar un
  mate").
- Personal cookability: pass — author confirmed, "all sounds very good
  recipes."
- Image fidelity: blank until step 5.
- Six-cheese case pass/fail: **pass** — missing-ingredient flags are always
  process items (salsa de tomate, agua, harina), never a more specific
  cheese swapped in for one already on hand.
- Near-empty case pass/fail: **pass** — stays plausible (fideos/huevo
  variations), never hallucinates pantry contents. Thin variety here is
  expected given only 2 real ingredients, not a failure.
- Freezer-only case pass/fail: **pass** — effort steps easy→elaborate
  (40→70min) and every card's steps open with the actual defrost action.
- Batch-2/exclude case pass/fail: **fail on this run** (empty `exclude` in
  the initial run; once patched with real batch-1 titles, produced a
  reworded duplicate and a within-batch double-milanesa) — fixed and
  re-verified in the run above.
- Notes / prompt changes made after this run: `apps/worker/src/prompt.ts` —
  replaced the literal "don't repeat a title" rule with two rules: don't
  repropose the same dish under a different title, and don't reuse the same
  core dish twice within one 5-card batch. See git history for the exact
  diff.
