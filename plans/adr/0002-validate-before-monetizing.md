# ADR 0002: Validate before monetizing

Status: accepted
Date: 2026-09-10

## Context

Phase 1 is complete (`plans/README.md`), but three things are still true
simultaneously: the Worker has never been deployed, no APK has been built, and
the app has never been used to cook a meal — including by its author. The
question "is monetizing this viable" was raised against that background, and
answering it required a repo audit plus market research rather than an
opinion, since a monetization plan built on zero usage evidence is a plan
built on nothing.

**Cost side.** Priced against the actual stack at paid rates: Groq
`gpt-oss-120b` at $0.15/$0.60 per M input/output tokens, two calls per batch
(see `CLAUDE.md` → Prefetching), plus FLUX.1 schnell at 57.6 neurons/image ×
$0.011/1k neurons for five images. That's ≈$0.0065 per 5-card batch — cheap in
isolation. But at even 100 users doing 2 batches/day, that's ~$39/mo in COGS
against ~$5/mo of revenue at the category's median freemium numbers (2.1%
D35 conversion, ~$3/mo, less Google's 15% cut) — RevenueCat's *State of
Subscription Apps 2026*. Working the break-even backwards, a free tier has to
be capped near **8 batches/month** (two a week) to not lose money per free
user. That's the real ceiling, not any Groq or Workers AI quota.

The reason this bites here and not for the established competition:
**SuperCook and Cookpad have zero marginal cost per suggestion** — they query
a static recipe database. This app pays an LLM and an image model per
request. That asymmetry, not polish or authenticity, is the structural
problem, and it doesn't go away with better prompts or a nicer UI.

**Geography compounds it.** RevenueCat's 2026 report puts Latin America's
day-60 revenue-per-install around $0.10 vs. $0.55 for North America — roughly
5.5× worse. On top of that, an Argentine card paying a USD subscription
currently carries 21% IVA on digital services plus a 30% withholding on the
peso conversion, so a nominal $2.99 sticker price is closer to $4.50 real.
The app's core differentiator — rioplatense voseo, Argentine ingredient
vocabulary and repertoire (principle 4) — is also what locks it into the
market where a subscription monetizes worst. The moat and the revenue ceiling
are the same wall.

**Yummly is the relevant cautionary data point**, not a hypothetical: VC-backed
since 2009, acquired by Whirlpool in 2017, entire team laid off April 2024,
app killed December 2024. A company that manufactures kitchen appliances
could not justify keeping a recipe app alive. "Recipes from what you have" is
one of the most attempted, least monetizable app concepts that exists.

**Two defects surfaced by the audit block any public deploy regardless of the
monetization question:**

1. The R2 image cache is already documented (ADR-0001) as near-100% miss:
   Groq's default (non-deterministic) sampling makes the same kitchen produce
   different dish titles on different calls, so `slugify(title)` produces a
   different R2 key almost every time, defeating the whole point of the
   per-dish cache. At ~288 neurons for a cold 5-card batch, the 10,000
   neuron/day free tier is good for **~35 batches/day, total, across every
   user** — roughly 10 people. `CLAUDE.md`'s Image pipeline section
   previously claimed the opposite (see the correction in this same commit).
2. `GET /img/:key?prompt=<imagePrompt>` is unauthenticated and unrate-limited
   in `apps/worker/src/index.ts`, and an uncached hit on it is exactly where
   the FLUX cost is incurred — unlike `/suggest`, which does have the
   `X-App-Secret` check and the per-IP rate limiter. `GET
   /debug/image-usage` is public too. Neither is safe to expose publicly as
   written.

## Options considered

- **Consumer subscription now.** Rejected: there is no evidence anyone
  returns to the app at all, so there is nothing to gate a paywall behind.
  The break-even free tier this economics forces (~8 batches/month) is also
  visibly uncompetitive against free unlimited alternatives — building it now
  would be building the wrong thing confidently.
- **Ads.** Rejected: ad revenue needs volume, and volume is a marketing
  problem this app doesn't yet have any evidence justifies solving. Ads would
  hit the same distribution wall from a weaker position, since ad eCPM in
  LatAm is lower than the already-poor subscription ARPU.
- **B2B — an Argentine supermarket or delivery-app tie-in.** Real money
  plausibly exists here, and it's the one path where the Argentine-only focus
  is an asset rather than a ceiling. Rejected for now: it's pure sales work,
  requires relationships this project doesn't have, and is premature before
  there's a consumer product anyone can point to as working.
- **Validate first, monetize only behind a retention gate** (chosen): spend a
  bounded, cheap window answering "does anyone actually cook from this"
  before spending anything on extracting revenue from the answer.

## Decision

**Sequence.** Validate before monetizing. A consumer-facing marketing push is
explicitly gated on the validation result below — it does not start
regardless of how the six-week window goes on other fronts.

**Scope of the validation window.** Six weeks of evenings, $100, hard stop —
a box chosen deliberately while unattached to the outcome, so it can't be
quietly extended later by sunk-cost reasoning.

**Market.** Argentina only for this window. It's free to reach (the author is
there and speaks the language), and it's the only market where the product is
genuinely better than the free incumbents rather than merely different.
Locale expansion (a second `i18next` resource bundle — already anticipated as
"a new resource file, not a rewrite" per `CLAUDE.md` → Decisions already
made) is a decision for after the gate, not before.

**Paywall.** Deferred entirely — no billing, no entitlements, no accounts
during the validation window. `CLAUDE.md`'s "Explicitly out — do not build
these, do not leave hooks for them" stands unamended for now. If a paywall is
ever built, its shape is decided here in advance rather than improvised
later: **batches/day as the meter** (it's the only thing that actually costs
money, so gating it is honest), with a **persisted weekly meal calendar** as
the premium story (currently `calendar.tsx` + `use-calendar-plan.ts` hold the
week in `useState` only — no Drizzle table — so this is real, not
incremental, work; see the correction to `CLAUDE.md` → Screens in this same
commit).

**Gate metric.** `Guardar` taps as the intent-to-cook proxy (cheap, passive,
already instrumented client-side) plus **≥20% of installs returning to the
app in week 2** as the habit signal, with a single day-14 in-app question
("¿Cocinaste algo de acá?") as a tiebreaker if the numbers land near the
line. Chosen over raw install counts because installs measure marketing
effort, not product quality, and the only question this window exists to
answer is the second one.

**Telemetry to measure the gate.** An anonymous event log in the Worker —
`POST /event` accepting `{installId, event, ts}` where `event` is one of
`batch_requested | recipe_saved | app_opened`, keyed on an install-scoped
random ID with no IP, no device data, no ingredient contents. Stored in D1,
not KV, because the gate is a cohort query ("of installs in week 1, how many
returned in week 2"), which KV can't answer without enumerating. **This
reverses** `plans/04-hardening.md`'s note that `cooked_count` is "explicitly
the *only* analytics in the whole app — don't let it grow into a broader
tracking mechanism." The reversal is recorded here with its bounds so it
can't drift further un-noticed: anonymous counts only, install-scoped random
ID, no per-user history, no third-party SDK.

**Image cache fix.** Add a `dishKey` field to the `Card` schema
(`packages/shared/src/api.ts`) — the model emits a canonical, lowercase dish
name alongside the creative `title`, and the Worker slugs `dishKey` instead
of `title` when building the R2 key. This is a refinement of the fix
ADR-0001 already anticipated ("If the active `CardProvider` is ever swapped
for one with a controllable sampling temperature, lowering it would make R2
cache hits far more likely"): `dishKey` gets the same stable-key effect
without trading away batch-to-batch variety, which `CLAUDE.md` treats as a
real product value ("the same kitchen on Tuesday and Wednesday should give
different ideas, or the app feels dead" — Decisions already made, KV
response caching entry). Needed regardless of monetization: at validation
scale, on the free image tier, the current near-100% miss rate caps the
*entire* app at ~10 concurrent users before Cloudflare 4006s start firing,
which would corrupt the validation test itself before it produced a result.

**`/img/` and `/debug/image-usage` lockdown.** HMAC-sign the `imageUrl` when
`/suggest` builds it (the Worker already knows the prompt and key at that
moment); `GET /img/:key` rejects a request whose signature doesn't match.
Keeps the URL publicly cacheable (it's still just a `GET`) but unforgeable,
so scraping the endpoint format can't be used to burn the image budget
independent of real `/suggest` traffic. `/debug/image-usage` is gated behind
an env check so it doesn't ship to the deployed Worker at all.

**`La cociné`.** Deleted — button, `cooked_count`, `last_cooked_at`, and the
three i18n strings. Two independent reasons converged on this: (1) it is
today a write-only counter — `cookedCount` renders exactly once, on the same
Detalle screen the tap happens on, and nowhere in Guardadas, Mi cocina, or
the deck, so it pays the user nothing back for tapping it; and (2) it asks
the user to do unpaid bookkeeping for the builder's benefit, which principle
1 ("any feature that asks the user to maintain accuracy is suspect") and
principle 2 argue against on their own terms, independent of whether the
button worked well. The chosen gate metric (`Guardar` + week-2 return) does
not depend on it. The idea of making the tap pay the user back directly —
turning it into "más cosas como esta," biasing the next batch toward that
dish's style — is recorded here rather than discarded, as the version worth
building if personalization is ever wanted; it wasn't pursued now because it
adds prompt and schema surface to rescue a signal the chosen gate doesn't
use.

**Prerequisites, unconditional.** A real deploy (`wrangler secret put
APP_SECRET`, `wrangler deploy`) and a signed APK — closing the one open
acceptance box in the entire Phase 1 plan set
(`plans/04-hardening.md`: "`GEMINI_KEY` does not appear anywhere in the
built APK — grep the built bundle/binary"). Along with two weeks of the
author actually cooking from the app in parallel — the cheapest possible
kill signal, already named by `CLAUDE.md` → Testing tier 3 as the test that
matters most, and the one piece of evidence that's completely missing so
far.

## Consequences

- If it's ever started, the six-week window has this shape: week 1 —
  documentation pass (this ADR, plus the two `CLAUDE.md` corrections made in
  the same commit) and the deploy/APK/endpoint-lockdown prerequisites, with
  the author's own two weeks of cooking running in parallel starting
  immediately; week 2 — the `dishKey` schema change; week 3 — remove `La
  cociné`, add the anonymous D1 event log; weeks 4–6 — Play Console listing,
  privacy policy, the two screens `Design.md` still marks undesigned (the
  empty state, and the loading state `CLAUDE.md` flags as "design this one
  first — it's the moment most likely to make the app feel cheap"), one
  launch post in Argentine cooking communities, then measurement with no
  further building during the window.
- **If the gate fails** (< 20% week-2 return), the plan is to stop rather
  than extend the box. The repo remains a real asset independent of the
  app's commercial fate: a 325-line implemented design system with measured
  contrast ratios (`Design.md`), a `CardProvider` interface that survived
  two real platform outages in one afternoon, and this ADR trail — worth
  writing up as a portfolio piece, and that path needs no users at all.
- **If the gate passes**, monetization planning restarts with real retention
  numbers instead of market averages, and the batches/day + persisted
  calendar paywall shape above is the first thing built, not a new idea
  argued from scratch.
- Everything under "Explicitly out" in `CLAUDE.md` (accounts, backend
  database beyond the new anonymous event log, sync, Play Billing) stays
  out until the gate opens. This ADR does not amend that list — it only
  carves out one narrow, bounded exception (the anonymous D1 event log) for
  the sole purpose of measuring the gate itself.
