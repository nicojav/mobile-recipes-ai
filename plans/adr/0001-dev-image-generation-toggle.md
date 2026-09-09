# ADR 0001: Local dev toggle for image generation, and graceful quota failure

Status: accepted
Date: 2026-09-09

## Context

Workers AI's FLUX.1 schnell image generation shares one account-wide
10,000-neuron/day budget (~173 images, see `CLAUDE.md` → Free tier ceilings).
In practice this was being exhausted after roughly half a dozen manual test
batches during local development, not real usage.

Root cause, confirmed by reading the actual pipeline rather than assuming:
images are cached in R2 keyed by `slugify(title)` (`imageKeyFor` in
`apps/worker/src/images.ts`). Groq (the active `CardProvider`) runs at
default sampling temperature with no determinism controls, so two separate
manual `/suggest` calls for the same kitchen contents generate different
dish titles → different R2 keys → cache misses on nearly every card, not
just the first time. A single 5-card batch with no cache hits costs
~288 neurons; ~6 such batches exhausts the entire day's budget. This matches
the observed "quota gone after a couple of uses."

Two related but separate problems came out of grilling this:

1. **Dev-time burn**: local testing shouldn't spend the shared real-world
   quota at all, ideally, since it's not real usage.
2. **Failure mode**: today, any `ensureImage` failure — including a genuine
   quota-exceeded from Cloudflare — surfaces as a 502 from `GET /img/:key`.
   The app's card rendering doesn't literally break on this (the deck's
   `imagePlaceholder` Bowl icon renders underneath the `<Image>` and simply
   stays visible if the image never loads — confirmed in
   `apps/mobile/src/app/deck.tsx`), but the Worker itself treats a known,
   expected condition (out of quota for the day) the same as a genuine
   upstream error, and keeps attempting (and failing) fresh Workers AI calls
   on every subsequent cache miss.

## Options considered

- **Cheaper Workers AI model.** Checked Cloudflare's current model catalog:
  `flux-1-schnell` (57.6 neurons/image) is already the cheapest text-to-image
  model Workers AI offers — every other model (Flux 2 Dev/Klein, Leonardo
  Lucid/Phoenix) costs more. No win available here.
- **Swap to an external free image provider** (Pollinations.ai, Hugging Face
  Inference, Gemini's free image tier, etc.) for real dev-time images from a
  separate quota pool. Pollinations in particular needs no signup/API key and
  has no meaningful daily cap. Rejected for now: its per-request pacing
  (1 req/15s anonymous) is far below the 5 concurrent image jobs this app
  fires per batch (see `CLAUDE.md`'s Image pipeline), so using it would mean
  serializing dev-mode image requests (~75s to fill a 5-card batch) — real
  added complexity to solve a problem that a local-only skip already solves
  for free. Noted here so it isn't re-litigated blind if requirements change
  (e.g. if dev-time image fidelity testing becomes a frequent need).
- **Local-only skip + graceful quota failure** (chosen): see Decision below.

## Decision

**A local-only, explicit dev toggle** (`SKIP_IMAGE_GEN` in
`apps/worker/.dev.vars`, never deployed) that, on an R2 cache miss, skips the
real FLUX call entirely instead of generating. It does not touch R2 cache
hits — a dish already cached from earlier (non-toggled) use still returns
its real image for free, since R2 reads don't cost quota. No new placeholder
UI was built: the app's existing Bowl-icon `imagePlaceholder` in
`deck.tsx` already renders underneath the image and stays visible
indefinitely when the image never loads, which is exactly the dev-mode
behavior wanted.

**Independently, quota-exceeded is now a first-class, short-circuited
condition**, not a generic upstream error: the existing sticky
`quotaExceeded` flag in `images.ts` (previously informational only, feeding
the dev usage counter) now also gates `ensureImage` itself — once a real
Workers AI call returns the quota-exceeded error (code `4006`), further
cache misses skip attempting generation at all until a generation succeeds
again, instead of repeating guaranteed-failing Workers AI calls. This
applies everywhere, not just when the dev toggle is on — it's a general
fix for the pipeline's handling of a known, expected condition. Both this
and the dev toggle share one failure path (`ImageGenerationSkipped`), which
`GET /img/:key` now answers with `404` rather than `502` — "no image
available" is a more accurate status than "upstream error" for a condition
the Worker deliberately chose not to attempt, and matches the precedent
already set by the no-prompt-and-not-cached branch in `handleImage`.

**Visibility**: the existing `__DEV__`-only `DevImageQuotaBar` component now
also shows when the toggle is active ("image generation skipped (dev)"),
distinct from its existing quota-exceeded warning styling, so an
all-placeholder deck reads as expected dev behavior rather than a bug to
chase.

## Consequences

- Local dev testing of everything except image fidelity itself (deck
  navigation, card copy, ingredient matching, etc.) can run indefinitely
  without ever touching the real image quota, once the toggle is flipped on.
- Testing real image output (fidelity, style) still means flipping the
  toggle off and accepting the real quota cost — this was a deliberate
  tradeoff (see options considered) rather than an oversight.
- `SKIP_IMAGE_GEN` lives only in `.dev.vars`, which is gitignored-equivalent
  (untracked, no example file committed, same as the existing secrets in
  that file) and never deployed — there's no path by which this ships to
  production silently on.
- The quota-exceeded short-circuit is per-isolate, in-memory state, same as
  the existing counter it extends — it resets on isolate recycle (a normal,
  frequent occurrence for Workers) and does not persist Cloudflare's actual
  server-side quota state across restarts. This is an accepted limitation
  already true of the counter this reuses; it does not make anything worse,
  and the failure mode (an occasional real attempt slips through right after
  an isolate recycle, then fails once and re-trips the flag) is self-healing.
- If the active `CardProvider` is ever swapped for one with a controllable
  sampling temperature, lowering it would make R2 cache hits far more likely
  across separate dev test runs (same kitchen → same titles → same keys),
  independently shrinking the underlying problem this ADR works around. Not
  pursued now since it's a provider-level change outside this ADR's scope,
  but worth revisiting if a provider swap happens (see `CLAUDE.md`'s
  `CardProvider` rationale).
