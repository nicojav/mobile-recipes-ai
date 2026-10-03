# Free text-to-image fallback APIs for when Workers AI's FLUX quota is exhausted

Date: 2026-10-03

## Question

When the Worker's Workers AI FLUX.1 schnell quota (10,000 neurons/day, ≈170
images, see `CLAUDE.md` → Free tier ceilings and `apps/worker/src/images.ts`)
is exhausted for the day, is there a free text-to-image API reachable via
plain HTTP `fetch` from `workerd` that can realistically absorb 5 concurrent
image-generation requests per suggestion batch, producing usable English
food-photography-style images, at **$0 marginal cost**?

## Summary / recommendation

**No candidate checked is fully viable as a same-day fallback.** Every
service that still produces FLUX-or-better quality output either requires
payment credentials once a token-sized free allowance is gone (Hugging Face:
$0.10/month, then pay-as-you-go) or has no durable free tier at all (fal.ai,
Together.ai, Google's Imagen/Gemini image models — the last of which has
**no free tier for any image-generation model**, confirmed directly on
Google's own pricing page). Pollinations.ai, the one candidate with a
genuinely anonymous, keyless endpoint, was **live-tested against its real API
today** (not just read about): anonymous `GET` calls to its FLUX model now
return `402 Payment Required` outright — FLUX is no longer free there — and
even its one remaining anonymous-and-free model (`sana`) fails 4 of 5
concurrent requests with the same `402`, serving only the request currently
in flight. That is a harder failure than this app's own graceful-degradation
path already handles well (a placeholder bowl icon, confirmed in
`apps/mobile/src/app/deck.tsx` per ADR-0001) — not an improvement on it.

**The limiting number driving this conclusion**: 1 of 5 concurrent anonymous
Pollinations requests succeeded in a live test; the other four came back
`402`. No other candidate even reaches that question, because each of them
requires an API key and a payment method before the first request — which
Workers AI's own already-free 170 images/day already provides without
either.

**Best partial option, if one must be named**: Hugging Face's
`routed-by-Hugging-Face` Inference Providers path is the closest thing to a
drop-in `fetch`-only REST call with a real (if token-sized) free allowance —
but at HF's own published $0.003–$0.03/megapixel provider rates, the $0.10/
month free-tier credit buys roughly **3–33 images total per month**, not
per day — far below even a single bad day of Workers AI's own 170/day
budget, and it still requires an HF account + token. It is not a quota
fallback; it is a few-images-a-month trial.

**What's actually missing for a real fix**: nothing found here replaces
Workers AI's free capacity. The practical mitigations are the ones already
in this repo's own plans — `SKIP_IMAGE_GEN` for dev (ADR-0001) and the
`dishKey`-based cache-hit-rate fix (ADR-0002), which raises the number of
*distinct* dishes the existing 170/day budget has to cover, rather than
adding a second provider to call when it runs out.

---

## Pollinations.ai

**Status today: not viable.** This is the one candidate explicitly flagged
in ADR-0001 as rejected for a *different* reason (anonymous pacing too slow
for 5 concurrent jobs). Re-checking it surfaced a bigger change: the service
has moved to a paid "pollen" credit system since that ADR was written, and
FLUX itself is no longer free there at all.

- **What changed since ADR-0001.** The current API (`gen.pollinations.ai`,
  version `0.3.0`, OpenAI-compatible) requires a Bearer API key (`sk_…`) for
  essentially everything; raw keyless publishable keys are explicitly legacy
  and rate-limited to "1 pollen per IP per hour." `402 PAYMENT_REQUIRED`
  is a first-class documented error: "Insufficient pollen balance or API key
  budget exhausted." Source:
  [pollinations/APIDOCS.md](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md)
  (Authentication and Error Responses sections).
- **Live-tested against the real API, 2026-10-03** (not secondary
  commentary — direct `curl` against the production endpoints, from this
  machine):
  - `GET https://gen.pollinations.ai/image/...` with no key → `401
    UNAUTHORIZED`, body: `"A valid API key is required. Get one at
    https://enter.pollinations.ai/keys"`.
  - The older, still-live, fully anonymous `GET
    https://image.pollinations.ai/prompt/{prompt}` endpoint (no key, no
    header) → `200 OK`, a real JPEG, **but only when no `model` is
    specified** (defaults to a model called `sana`).
  - The same anonymous endpoint with `?model=flux`, `?model=flux-schnell`,
    `?model=turbo`, `?model=sdxl`, or `?model=stable-diffusion` → **`402
    Payment Required`**, every time, body `{}`. FLUX specifically is gated
    behind pollen now, even on the "free" legacy host.
  - Five concurrent anonymous requests to the one remaining free model
    (`sana`, no `model` param) → **1 succeeded (`200`, real JPEG, 768×768,
    ~3.2s), the other 4 failed with `402`** in under 1 second each. This is
    the direct, current-day answer to "is 5 concurrent realistically
    usable": no, even on the model that is nominally free.
- **Auth/tiers (documented, not just tested).** Beyond anonymous, registered
  tiers exist — `spore` (free, reported at roughly 1.5 pollen/week in one
  maintainer-filed issue, though the exact number has changed more than
  once per the issue history), `seed`, `flower`, `nectar` (paid, pollen/hour
  allowances). Source:
  [Issue #6231](https://github.com/pollinations/pollinations/issues/6231),
  [Issue #8240](https://github.com/pollinations/pollinations/issues/8240) —
  official repo issue tracker, maintainer-filed/maintained, but the numbers
  inside it have churned repeatedly, so treat the exact figure as volatile,
  not as a stable contract.
- **Documented concurrency/pacing by auth level**, per a maintainer comment
  on the official repo: anonymous ≈6–7s between requests with 1 concurrent
  request allowed and a restricted model set; a registered API token ≈7s
  interval with tier-based concurrency; `enter.pollinations.ai`-authenticated
  ("Enter") requests get 1s intervals and 20 concurrent. Source:
  [Issue #4817](https://github.com/pollinations/pollinations/issues/4817).
  Even if this 20-concurrent figure is accurate for a logged-in, *paid-tier*
  key, it does not help a $0 fallback — and the live FLUX test above shows
  the model that matters (FLUX) isn't reachable anonymously regardless of
  pacing.
- **Fit for English food-photography prompts.** Can't be assessed
  meaningfully for this app's purpose: the only consistently-free path
  (`sana`, no model param) is not a model this app's `imagePrompt` strategy
  was designed or tested against, and the model the strategy *was* designed
  around (FLUX) is paywalled.
- **$0 constraint.** Breaks it for any real quota — free usage is throttled
  to the point of mostly failing outright at the concurrency this app needs,
  and the model that fits the integration (FLUX) requires paid pollen even
  for a single anonymous call.

## Hugging Face Inference Providers (serverless)

- **Free allowance is real but tiny.** Every Hugging Face account — including
  free accounts — gets **$0.10/month** in credit, usable on Inference
  Providers; PRO/Team/Enterprise get $2.00/seat. Past that, "All users can
  continue using the API after exhausting their monthly credits by purchasing
  additional credits" — i.e., a payment method becomes required. Source:
  [Pricing and Billing](https://huggingface.co/docs/inference-providers/en/pricing)
  (official docs).
- **What $0.10 buys.** Inference Providers routes text-to-image requests
  (FLUX.1-dev, FLUX.1-schnell, SDXL, etc.) to third-party compute partners
  (fal, Replicate, Together, Novita, WaveSpeedAI, Nscale — see the partner
  table in [Inference Providers overview](https://huggingface.co/docs/inference-providers/en/index)),
  billed at those providers' own per-second-compute or per-megapixel rates
  passed through with "no markup." At fal's own published FLUX.1-schnell rate
  of $0.003/megapixel (see fal.ai section below), a 1024×1024 (~1MP) image
  costs roughly $0.003 — so $0.10/month covers on the order of **30 images a
  month**, not a day. A reasonable 5-card batch (5 images) would burn a
  sixth of the entire month's free allowance in one suggestion request.
- **The historically "free" `hf-inference` provider itself has moved away
  from GPU/image work.** Per HF's own provider page: "As of July 2025,
  hf-inference focuses mostly on CPU inference (e.g. embedding,
  text-ranking, text-classification, or smaller LLMs...)." It still lists
  `stabilityai/stable-diffusion-3-medium-diffusers` as a supported
  text-to-image model, but the realistic FLUX path on this platform now goes
  through a paid third-party provider underneath, not a free HF-run GPU.
  Source:
  [HF Inference provider page](https://huggingface.co/docs/inference-providers/en/providers/hf-inference).
- **Reachable via plain HTTP `fetch`?** Yes — the REST router
  (`https://router.huggingface.co/...`) is a plain `Authorization: Bearer`
  HTTP API; no Node-only SDK is required, Hugging Face's own docs show a raw
  `fetch`/`curl` form alongside the SDKs. (Note: the docs' explicit raw-HTTP
  example is for chat completions; text-to-image is documented via the
  client SDKs, but the same bearer-token REST router pattern applies.)
- **Concurrency at 5 jobs.** Not documented as a hard number; the real
  constraint is economic, not rate-limiting — 5 concurrent FLUX calls is a
  small fraction of a monthly allowance that's already sub-$1.
- **Fit for English prompts.** Good, if you pay for it — FLUX.1-dev/schnell
  and SDXL are exactly the kind of English-prompted photoreal food-image
  models this app's `imagePrompt` design already targets. The quality isn't
  the problem; the economics are.
- **$0 constraint.** Breaks it for any sustained fallback use — this is a
  one-time trial credit, not a renewable free quota comparable to Workers
  AI's.

## fal.ai

- **No durable free tier.** fal's own pricing page states usage is billed
  per-output on a prepaid credit model ("pay only for successful results"),
  with no mention of an ongoing free allowance; new-signup credits are
  promotional and expire. Source: [fal.ai/pricing](https://fal.ai/pricing)
  (official pricing page — confirms per-output billing, no free-tier line
  item).
- **FLUX.1 [schnell] pricing**: **$0.003/megapixel** (≈$0.003 for a 1024×1024
  image) — this is the number HF's own pass-through pricing for FLUX via fal
  is built on. Source: fal.ai pricing page (same as above).
  Promotional signup credits exist (amount varies by current promotion;
  referral/program credits such as the YC and Entrepreneur's-First deals go
  up to $10k–$50k but are not relevant to a solo hobby project) and some
  coupon-claim credits are explicitly **Sandbox/Playground-only, not usable
  via the API** — so they don't even help a server-side fallback. These
  specific coupon-restriction and promo details come from fal's community
  credit-sharing pages, a weaker (secondary) source than the pricing page
  itself, so treat the exact promo mechanics as indicative, not contractual.
- **Reachable via plain HTTP `fetch`?** Yes — fal's REST API is a standard
  JSON-over-HTTPS API with a bearer key; no Node-only SDK required.
- **Concurrency at 5 jobs.** Not rate-limited in any documented way that
  would block 5 concurrent calls — the blocker is that every call costs
  money from the first request, with no renewing free quota.
- **Fit for English prompts.** Good — FLUX.1 schnell is the same model
  family already in production use via Workers AI, so prompt behavior should
  carry over directly.
- **$0 constraint.** Breaks it immediately — there's no ongoing free tier,
  only a time-limited signup credit.

## Google Gemini / Imagen free image-generation tier

- **There is currently no free tier for any Google image-generation model.**
  Checked directly on Google's own pricing page, which lists an explicit
  "Free tier" column and states **"Not available"** for every image model
  checked:
  - Gemini 2.5 Flash Image ("Nano Banana") — Free tier: *Not available*
    (and this model is listed as being shut down October 2, 2026 anyway)
  - Gemini 3 Pro Image ("Nano Banana Pro") — Free tier: *Not available*
  - Gemini 3.1 Flash Image ("Nano Banana 2") — Free tier: *Not available*
  - Gemini 3.1 Flash Lite Image ("Nano Banana 2 Lite") — Free tier:
    *Not available*
  Source: [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)
  (official Gemini API pricing page, fetched directly).
  Cheapest paid rate found: Gemini 3.1 Flash Lite Image at roughly
  $0.0336 per 1K-resolution image (derived from the page's per-token image
  output rate).
- **Imagen (the dedicated image model family)** is also not on the free
  tier: it requires at minimum a billing-enabled "Tier 1" project, per
  Google's documented rate-limit tiering (10 images/minute at Tier 1, scaling
  up at Tier 2/3). This is consistent with the Gemini API's own framing that
  image generation is deliberately excluded from the free tier because of
  its compute cost. Source: Gemini API rate-limits documentation at
  [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits)
  (official docs; exact current numeric limits are only visible per-project
  on the linked [AI Studio rate-limit dashboard](https://aistudio.google.com/rate-limit),
  which requires a signed-in Google account to view and isn't independently
  publishable here).
- **Reachable via plain HTTP `fetch`?** Yes, in principle — the Gemini API
  is a plain REST/JSON API over HTTPS with an API-key header, no Node-only
  SDK required. This is moot given there's no free quota to call into.
- **$0 constraint.** Breaks it outright — every image-generation model
  Google currently exposes through the Gemini API requires billing enabled
  before the first request, full stop.

## Together.ai (additional candidate found during research, not in the original minimum list)

Flagged separately because Together was Pollinations-adjacent in older
public commentary ("free unlimited FLUX.1 [schnell]" was a real, officially
announced Together promotion in 2024), but that offer does not appear to
still exist, and primary-source confirmation here is weaker than for the
other candidates — Together's own pricing and getting-started docs did not
state a free tier one way or the other when fetched directly.

- **What the official docs show.** Together's docs confirm FLUX, Kontext,
  and Google image models are available, with per-image pricing listed on
  the pricing page, but neither the pricing page nor the getting-started
  docs state whether a free trial or free-FLUX offer is still active.
  Source: [together.ai/pricing](https://www.together.ai/pricing) and
  [docs.together.ai/docs/pricing](https://docs.together.ai/docs/pricing)
  (official, but inconclusive on this specific question as fetched).
- **Secondary-sourced signal, lower confidence.** Multiple third-party
  "as of August 2026" aggregator pages describe Together as now requiring a
  minimum $5 prepaid credit purchase to use the API at all, with no ongoing
  free tier — a reversal of the 2024 free-FLUX promotion. These are not
  primary sources and were not independently verified by testing (no
  Together account was created for this research), so treat this as
  probable, not confirmed.
- **$0 constraint.** If the $5-minimum-purchase reports are accurate, this
  fails the constraint outright (a purchase, however small, is not $0).
  Not recommended to pursue further without a direct account test.

## Other candidates considered and not pursued further

A broader search for "anonymous, keyless, free text-to-image API" turned up
only low-trust aggregator/directory sites (e.g. "Pixazo," "Creen.ai,"
"freetexttoimage.com") with no verifiable primary documentation of their
backing model, infrastructure, or durability — exactly the kind of
secondary, unverifiable source this research was scoped to exclude. None of
these were investigated further. One independent data point is worth
noting: a developer blog post (secondary, dated August 2026) reported that,
at the time, "no public image-generation endpoint that accepts anonymous
generation requests was verified" among Pollinations, fal, Replicate, and
another aggregator (HiAPI) — consistent with this research's own live test
of Pollinations above.

## Conclusion

None of the checked candidates are fully viable as a same-day, $0, 5-concurrent
fallback for an exhausted Workers AI FLUX quota. Ranked by how close they get:

1. **Workers AI's own quota is still the best option** — nothing else is
   actually free at comparable volume.
2. **Hugging Face Inference Providers** is the best-documented partial
   option — a real REST API, real (if tiny) free credit, and the right
   model family — but $0.10/month covers roughly a month's worth of Workers
   AI's *daily* budget, not a meaningful extension of it.
3. **Pollinations.ai**, the candidate that looked most promising on paper
   (keyless, previously "unlimited free Flux" by reputation), **fails in
   practice today**: live-tested, its FLUX model now demands payment even
   anonymously, and its one remaining free model drops 4 of 5 concurrent
   requests outright.
4. **fal.ai, Together.ai, and Google's Imagen/Gemini image models** all
   require payment credentials before the first request, full stop.

If image availability during a quota outage matters enough to act on, the
highest-leverage fix is not a second provider — it's shrinking how often the
existing 170-images/day budget gets spent on a cache miss, which is exactly
what ADR-0002's `dishKey` change already targets, plus keeping `SKIP_IMAGE_GEN`
disciplined in dev per ADR-0001. The app's existing placeholder-on-miss
behavior (confirmed in `apps/mobile/src/app/deck.tsx`) already degrades more
gracefully than any of the fallback APIs checked here would.
