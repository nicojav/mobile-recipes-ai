# apps/worker

Cloudflare Worker — the only thing that talks to the LLM provider and to
image generation. Stateless: every `/suggest` request carries its own
kitchen context, nothing is stored server-side. See the
[root README](../../README.md) for how this fits with the mobile app, and
[`CLAUDE.md`](../../CLAUDE.md) for architecture rationale, free-tier ceilings,
and the abuse-protection design.

## Why this exists

The active provider's API key must never ship in the APK. This Worker holds
it as a secret and is the only thing that calls it. It also builds the
prompt server-side — the client sends structured kitchen data only, so
nobody can point a modified client at the endpoint and use it as a free
general-purpose LLM proxy, and prompt iteration ships without a Play Store
release.

## Setup

```bash
npm install                 # from repo root
```

Create `apps/worker/.dev.vars` (local dev secrets, gitignored, no example
file committed):

```
GROQ_KEY=...       # active provider's key — see src/providers/index.ts
GEMINI_KEY=...      # only needed if you switch activeProvider to gemini
APP_SECRET=...      # must match the mobile app's EXPO_PUBLIC_APP_SECRET
SKIP_IMAGE_GEN=false # set to "true" to stop cache-miss FLUX calls from
                      # burning the shared daily image quota while iterating
                      # on anything other than image fidelity — see
                      # plans/adr/0001-dev-image-generation-toggle.md
```

Workers AI needs no secret — it's an account binding (`[ai]` in
`wrangler.toml`), not an API key.

```bash
npm run dev -w apps/worker      # wrangler dev, local
npm run harness -w apps/worker  # scenario harness against a running dev server
```

For deploying for real: `wrangler secret put GROQ_KEY` (and `APP_SECRET`),
then `npm run deploy -w apps/worker`. Production deploy is deliberately
deferred per the Phase 1 plan — see `plans/04-hardening.md`.

## Request flow

```mermaid
sequenceDiagram
    participant App as Expo app
    participant W as Worker (index.ts)
    participant P as CardProvider\n(providers/*)
    participant LLM as Groq / Gemini / Workers AI
    participant R2 as R2 bucket
    participant FLUX as Workers AI (FLUX.1 schnell)

    App->>W: POST /suggest\n(X-App-Secret, kitchen items, notes, exclude)
    W->>W: check X-App-Secret (timing-safe)
    W->>W: check SUGGEST_RATE_LIMITER\n(20 req/60s per IP)
    W->>W: parse + validate against SuggestRequest (Zod)
    W->>P: activeProvider.generateCards(...)
    P->>P: build prompt server-side (prompt.ts)
    P->>LLM: structured JSON request\n(schema derived from Card, packages/shared)
    LLM-->>P: 5 cards (title, steps, have/missing, calories, imagePrompt, ...)
    P-->>W: validated cards
    W-->>App: SuggestResponse\n(each card's imageUrl points at /img/:key, not fetched yet)

    Note over App,W: Later, per card, lazily:
    App->>W: GET /img/:key?prompt=imagePrompt
    W->>R2: check cache
    alt cache hit
        R2-->>W: existing JPEG
    else cache miss
        W->>FLUX: generate 1024x1024
        FLUX-->>W: image
        W->>R2: store as JPEG, keyed by slugify(title)
    end
    W-->>App: image URL
```

## Structure

```
src/index.ts          fetch handler — routes, auth, rate limit, request/response validation
src/prompt.ts          the system prompt (rioplatense Spanish, voseo, Argentine
                        ingredient vocabulary — see CLAUDE.md "Prompt requirements")
src/images.ts          R2 cache-or-generate for dish images, keyed by slugify(title)
src/providers/
  types.ts              CardProvider interface + ProviderError
  base.ts               shared helpers across providers
  groq.ts                active provider — see comments for the structured-output caveat
  gemini.ts              Google Schema-proto dialect conversion from the Zod schema
  workers-ai.ts           free LLM option, also hosts image generation
  index.ts                the one-line switch: `activeProvider`
  schema.ts              builds each provider's JSON-schema dialect from the shared Card schema
harness/
  run.ts                scenario runner — scores fixed payloads against the rubric
  scenarios/*.json       ~15 fixed kitchen payloads (six-cheese, near-empty, freezer-only, ...)
  output/                harness run results, for diffing across prompt edits
```

## Provider swap

The LLM call is behind `CardProvider`, not hardcoded. To switch providers,
change one line in `src/providers/index.ts` (`activeProvider = ...`) and set
the matching secret. Before switching, check the new provider's
tokens-per-minute ceiling specifically (not just request-count limits) and
whether it supports streaming with structured output — see `CLAUDE.md` →
"Decisions already made" for why the first-batch split into two calls exists
and exactly when to undo it.
