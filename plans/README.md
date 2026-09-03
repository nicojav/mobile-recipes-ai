# Build plan — index

This is the Phase 1 build of an Android app that suggests Argentine home-cooking
ideas from what's in the kitchen, Tinder-style swipe deck, single user, no accounts.
Full context — principles, architecture, data model, API contract, prompt
requirements, decisions already made — lives in `../CLAUDE.md`. Read it before
touching design calls; these files intentionally don't repeat it, only reference it
by section name.

These four files are the execution plan: exact paths, commands, code shapes, and
acceptance criteria for each milestone, grouped from `CLAUDE.md`'s "Build order"
(steps 0–7).

## Milestones

| # | File | Spec build steps | Done when | Status |
|---|---|---|---|---|
| 1 | [01-foundation.md](01-foundation.md) | 0–1 | Chip UI with all 30 seed items running on a real phone via Expo Go, no network involved | done |
| 2 | [02-end-to-end.md](02-end-to-end.md) | 2–3 | Real LLM suggestions render in the swipeable deck on a real phone | done |
| 3 | [03-quality-and-images.md](03-quality-and-images.md) | 4–5 | Scenario harness scores well on all five rubric axes; images swap into cards without blocking render | done |
| 4 | [04-hardening.md](04-hardening.md) | 6–7 | Detail view, saved recipes, and `La cociné` work end-to-end; endpoint has a shared secret and a rate limit before the APK leaves the device | done (prod deploy + APK build deliberately deferred, see file) |

## How to use these

- Work milestones in order. Don't start the next file until the current one's
  **Done when** line is physically true — not "the code looks right," but verified
  on a real device / with `curl` / against the harness, as each file specifies.
- Each step's acceptance criteria are checkboxes. Tick them in place as you verify,
  don't just narrate completion.
- Update the Status column above as you go (`not started` → `in progress` → `done`).
- **This is the recovery mechanism after a context reset.** A fresh session with no
  memory of prior work reads this table first, opens the file for the milestone in
  progress, and trusts its Status blockquote + checkboxes as ground truth — it will
  not re-derive state from git history or guess. That only works if the Status
  column and checkboxes are updated in the same turn the underlying work happens,
  not after the fact. Before ending any turn that changed code, update both: the
  Status column here, and the specific checkboxes/blockquote in the milestone file.
  A milestone that's actually done but still says "not started" is worse than no
  status at all — it causes a rebuild.

## Judgment gates

Two points in this plan are not mechanical — they require the author's own
judgment, not just passing tests:

- **End of milestone 2** (first end-to-end moment): stop and evaluate suggestion
  quality before writing another line of code.
- **All of milestone 3, step 4**: prompt iteration against the scenario harness is a
  hard gate. Don't move on to the image pipeline (step 5) until the rubric scores
  well. Per `CLAUDE.md`, everything after this point is polish — this is the product.

## Code conventions

- **Identifiers are English.** Types, variables, function names, DB columns, and
  JSON keys — always English, no exceptions carved out per-file. The only
  Spanish left in code is *content*: `Location` enum values (`freezer`,
  `heladera`, `alacena`, `condimentos`, `cajon` — the user's own vocabulary,
  sent to the model as-is) and whatever the model generates or the user types.
- **UI text goes through i18next.** `apps/mobile/src/i18n`, `react-i18next`,
  one `es-AR` resource bundle for now. Don't hardcode display strings in
  components — add a key to `locales/es-AR.ts` and call `t()`. See
  `CLAUDE.md` → Decisions already made for why `es-AR` and not a generic
  `es-419`.

## Post-Phase-1 changes

Phase 1 (above) is complete. Changes made after it don't get their own
numbered milestone file unless they're large enough to warrant one — this
section is a short log of the smaller ones, newest first.

- **Deck swipe redesign: back/next instead of discard/like** (2026-09-03):
  swiping is now book-style pagination — left for next, right for back,
  the horizontal-pager convention (Photos, Instagram stories, most
  carousels) — replacing the original Tinder-style discard/like swipe.
  Reversed because the two original directions had never actually done
  anything different (both just advanced; the ✕/♥ stamps were purely
  decorative — nothing was ever saved or discarded by swiping, only Detail's
  `Guardar`), while real use surfaced a genuine want: revisiting a card
  already swiped past. Note the swipe *direction* went through a second
  correction the same day — first built as the literal "swipe left = back,
  like turning a book page," then flipped to left = next / right = back
  once on-device testing showed the literal reading felt backwards, matching
  the muscle memory of pretty much every other horizontal-paging app instead.
  The ‹ / › buttons aren't swipes, so they keep their own arrow-matching
  direction (‹ exits left, › exits right) regardless of which way that
  action's swipe drags. Going back needed no new caching — `cards` was
  already an append-only array (see the progressive-loading entry below),
  so every card shown so far was already sitting there; "back" is just
  showing the array at a lower index. See `CLAUDE.md` → Screens → Deck for
  the full description, and `apps/mobile/src/app/deck.tsx`'s `SwipeCard`
  for the one real subtlety: a "back" action with nowhere to go back to (the
  first card of a batch) has to spring the card back to center rather than
  fly it off-screen, since the index wouldn't change and the card wouldn't
  remount to reset its position.
  - [ ] On-device (Expo Go): swipe left = next, swipe right = back, and the
        ‹/› buttons both feel right; going back and then forward again shows
        the identical cards (no flicker, no re-fetch); a "back" attempt on
        the very first card of a batch springs back instead of getting stuck
        off-screen

- **First-batch progressive loading** (2026-09-03): the deck's first
  suggestion batch is split into two Worker calls — 2 cards rendered
  immediately, the remaining 3 fetched in the background — instead of
  waiting on all 5. **This is a workaround for a Groq limitation**: Groq
  doesn't support streaming together with structured-output JSON schema
  validation, which is what this project relies on to keep the card shape
  reliable. Full rationale, and the exact trigger for reverting this once the
  provider changes, is in `CLAUDE.md` → "Decisions already made — don't
  relitigate". Status: **done**, pending the verification steps below.
  - [ ] Typecheck clean across `packages/shared`, `apps/worker`, `apps/mobile`
  - [ ] Worker locally: `count: 2` and `count: 3` requests each return the
        right number of cards; `exclude` prevents overlap between them
  - [ ] Image warm: a card's `imageUrl` resolves fast after `/suggest`
        returns (warm already ran), and concurrent requests for the same key
        don't trigger two FLUX runs
  - [ ] Scenario harness Variety axis holds up against the pre-change runs in
        `apps/worker/harness/output/` — the real risk of this change, not
        latency
  - [ ] On-device (Expo Go): first card appears sooner, counter never shows
        a wrong total, cards 3–5 append without a visible flicker, swiping
        fast past card 2 shows the loading state and recovers cleanly

## Keeping `CLAUDE.md` current

`CLAUDE.md` says its own maintainer should update it — and offer the edit unprompted
— whenever a decision is made that isn't visible from the code, or when a decision
in it is reversed. Several sections are explicitly expected to shrink as these
milestones complete (seed data once `packages/shared/src/seed.ts` exists, the
request/response examples once the shared Zod schemas exist, the build order itself
as steps finish). When a milestone here completes one of those, offer that
`CLAUDE.md` trim as part of finishing the milestone.
