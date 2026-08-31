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
| 3 | [03-quality-and-images.md](03-quality-and-images.md) | 4–5 | Scenario harness scores well on all five rubric axes; images swap into cards without blocking render | not started |
| 4 | [04-hardening.md](04-hardening.md) | 6–7 | Detail view, saved recipes, and `La cociné` work end-to-end; endpoint has a shared secret and a rate limit before the APK leaves the device | not started |

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

## Keeping `CLAUDE.md` current

`CLAUDE.md` says its own maintainer should update it — and offer the edit unprompted
— whenever a decision is made that isn't visible from the code, or when a decision
in it is reversed. Several sections are explicitly expected to shrink as these
milestones complete (seed data once `packages/shared/src/seed.ts` exists, the
request/response examples once the shared Zod schemas exist, the build order itself
as steps finish). When a milestone here completes one of those, offer that
`CLAUDE.md` trim as part of finishing the milestone.
